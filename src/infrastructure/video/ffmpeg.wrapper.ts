import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface VideoMetadata {
  duration: number;
  codec: string;
  resolution: string;
  bitrate: number;
}

export interface TranscodeOptions {
  useNvenc?: boolean;
  crf?: number;
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function runProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', args, { stdio: 'pipe' });
    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe exited ${code}`));
    });
  });
}

export async function generateHLS(
  inputPath: string,
  outputDir: string,
  options: TranscodeOptions = {},
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const playlistPath = path.join(outputDir, 'index.m3u8');
  const segmentPattern = path.join(outputDir, 'segment%03d.ts');

  const encoder = options.useNvenc !== false ? 'h264_nvenc' : 'libx264';

  const args = [
    '-i', inputPath,
    '-c:v', encoder,
    '-crf', String(options.crf ?? 23),
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_list_size', '0',
    '-hls_segment_filename', segmentPattern,
    playlistPath,
    '-y',
  ];

  try {
    await run(args);
  } catch {
    // NVENC not available — fallback to software encoder
    if (encoder === 'h264_nvenc') {
      args[args.indexOf('h264_nvenc')] = 'libx264';
      await run(args);
    } else {
      throw new Error('Transcoding failed with libx264');
    }
  }

  return playlistPath;
}

export async function getMetadata(filePath: string): Promise<VideoMetadata> {
  const raw = await runProbe([
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);

  const data = JSON.parse(raw);
  const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');

  return {
    duration: parseFloat(data.format?.duration ?? '0'),
    codec: videoStream?.codec_name ?? 'unknown',
    resolution: `${videoStream?.width ?? 0}x${videoStream?.height ?? 0}`,
    bitrate: parseInt(data.format?.bit_rate ?? '0', 10),
  };
}
