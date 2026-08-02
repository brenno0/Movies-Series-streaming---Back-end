import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface ProbedCodecs {
  videoCodec: string | null;
  audioCodec: string | null;
  durationSeconds: number | null;
}

export interface RemuxPlan {
  copyVideo: boolean;
  copyAudio: boolean;
}

const COMPATIBLE_VIDEO_CODECS = new Set(['h264']);
const COMPATIBLE_AUDIO_CODECS = new Set(['aac']);
const PROBE_TIMEOUT_MS = 15000;

// ffprobe reading directly from a remote URL is very slow on these sources (10-15s+,
// independent of probesize/analyzeduration tuning) — its own HTTP client does the
// fetch inefficiently. Fetching a chunk ourselves with a plain Range GET and piping
// it into ffprobe's stdin is ~instant by comparison. Video/audio track headers come
// before subtitle tracks in these MKVs, so 2MB is plenty even on releases with
// dozens of embedded subtitle languages.
const PROBE_BYTES = 2 * 1024 * 1024;

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
}

interface FfprobeFormat {
  duration?: string;
}

export async function probeCodecs(url: string): Promise<ProbedCodecs | null> {
  let head: Buffer;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Range: `bytes=0-${PROBE_BYTES - 1}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) return null;
    head = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_entries', 'stream=codec_type,codec_name:format=duration',
      '-i', 'pipe:0',
    ];
    const proc = spawn('ffprobe', args);
    const timer = setTimeout(() => { proc.kill('SIGKILL'); }, PROBE_TIMEOUT_MS);

    let out = '';
    proc.stdout.on('data', (chunk) => { out += chunk; });
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
    // ffprobe often has everything it needs and exits before we finish writing the
    // 8MB buffer — writing to its now-closed stdin throws EPIPE. Without a listener
    // here that's an unhandled 'error' event, which crashes the whole process.
    proc.stdin.on('error', () => {});
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      try {
        const data = JSON.parse(out) as { streams?: FfprobeStream[]; format?: FfprobeFormat };
        const streams = data.streams ?? [];
        const videoStream = streams.find((s) => s.codec_type === 'video');
        const audioStream = streams.find((s) => s.codec_type === 'audio');
        // Duration read from the head chunk's container metadata (MKV Segment Info,
        // MP4 moov when present near the start) — often unavailable for MP4 releases
        // with moov at the tail. Null just means we skip the duration header downstream.
        const rawDuration = data.format?.duration ? Number.parseFloat(data.format.duration) : NaN;
        resolve({
          videoCodec: videoStream?.codec_name ?? null,
          audioCodec: audioStream?.codec_name ?? null,
          durationSeconds: Number.isFinite(rawDuration) ? rawDuration : null,
        });
      } catch {
        resolve(null);
      }
    });

    proc.stdin.write(head);
    proc.stdin.end();
  });
}

export function planRemux(codecs: ProbedCodecs): RemuxPlan {
  return {
    copyVideo: codecs.videoCodec !== null && COMPATIBLE_VIDEO_CODECS.has(codecs.videoCodec),
    copyAudio: codecs.audioCodec !== null && COMPATIBLE_AUDIO_CODECS.has(codecs.audioCodec),
  };
}

// Real-time transcoding is CPU-real — cap simultaneous ffmpeg jobs so a burst
// of plays doesn't starve the box. Over the cap, callers should 503.
const MAX_CONCURRENT_JOBS = 3;
let activeJobs = 0;

export function tryAcquireFfmpegSlot(): boolean {
  if (activeJobs >= MAX_CONCURRENT_JOBS) return false;
  activeJobs++;
  return true;
}

export function releaseFfmpegSlot(): void {
  activeJobs = Math.max(0, activeJobs - 1);
}

export interface FfmpegSession {
  stream: Readable;
  kill: () => void;
}

export function startFfmpegPipeline(url: string, plan: RemuxPlan, seekSeconds: number): FfmpegSession {
  const args: string[] = ['-v', 'error', '-user_agent', 'Mozilla/5.0', '-i', url];

  // Output seeking (-ss after -i), not input seeking. Verified directly against this
  // source (scene-release MKV, PT-BR AC3 audio): input seeking (-ss before -i) breaks
  // outright here in two different ways — with audio transcode, the decoder hits an
  // immediate EOF and ffmpeg writes zero bytes; with audio copy, the fragmented-MP4
  // muxer fails ("Cannot write moov atom before AC3 packets"). Output seeking reads-and
  // -discards from the start instead — always correct, but its cost scales with how far
  // into the file the seek target is (real network read, not free).
  if (seekSeconds > 0) args.push('-ss', String(seekSeconds));

  args.push('-c:v', plan.copyVideo ? 'copy' : 'libx264');
  if (!plan.copyVideo) args.push('-preset', 'veryfast', '-crf', '21');

  args.push('-c:a', plan.copyAudio ? 'copy' : 'aac');
  if (!plan.copyAudio) args.push('-b:a', '192k');

  // avoid_negative_ts: -ss + stream copy can leave timestamps that don't start at 0,
  // which some browsers refuse to play cleanly.
  args.push('-avoid_negative_ts', 'make_zero');
  args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');

  const proc = spawn('ffmpeg', args);
  // Drain stderr so ffmpeg's diagnostic logging doesn't block on a full pipe buffer.
  proc.stderr.on('data', () => {});
  proc.on('error', () => proc.stdout.destroy());

  return {
    stream: proc.stdout,
    kill: () => { if (!proc.killed) proc.kill('SIGKILL'); },
  };
}
