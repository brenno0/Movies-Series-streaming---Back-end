# MKV remux/transcode for browser playback

## Problem

Player showed infinite loading for every stream. Root cause chain:
1. `dfindexer` container's DNS resolution of scraper sites was blocked by ISP (fixed: `/etc/hosts` entries).
2. `nb-flix-backend` container was running a stale build predating TorBox integration (fixed: rebuilt).
3. Even with a resolved stream, most PT-BR releases are `.mkv`. The frontend `VideoPlayer` hardcodes `type: 'video/mp4'`, and even if labeled correctly, Chrome/Firefox don't support MKV container natively in `<video>`. Backend was serving the raw MKV bytes through as-is.

This doc covers fix #3.

## Approach

Backend probes real codecs (via `ffprobe`, not the release-name-derived `codec` field used for ranking) and decides per-stream:

- **Passthrough** (no ffmpeg): container already `mp4` and video=h264, audio=aac. Unchanged fast path, keeps native Range/seek support.
- **Remux** (`-c copy` both streams): container is wrong (mkv) but codecs are compatible. Near-zero CPU.
- **Transcode**: video isn't h264 (e.g. h265) and/or audio isn't aac (e.g. AC3/DTS). Real `libx264 veryfast` + `aac` encode.

ffmpeg output is fragmented MP4 (`frag_keyframe+empty_moov+default_base_moof`) piped directly into the Fastify response as a chunked stream — no Content-Length/Range on this path.

## Seeking

No Range support on the ffmpeg path means the browser can't jump to an unbuffered position on its own. Frontend intercepts seek, reloads the stream URL with `?seekTo=<seconds>`; backend kills the current ffmpeg process and restarts it with `-ss <seconds>` before `-i` (fast input seek). Frontend already has the real movie duration from TMDB (`movie.runtime`), so no new duration signaling needed backend-side.

## Concurrency

Real-time transcode is CPU-real. In-memory semaphore caps at 3 concurrent ffmpeg jobs (server: 12 cores / 32GB, personal use = 1-2 concurrent streams, headroom for spikes). Over the cap → `503`, same pattern as existing "no stream found" errors.

## Changes

- `src/infrastructure/ffmpeg/ffmpeg-stream.ts` (new): `probeCodecs`, `planRemux`, `startFfmpegPipeline`, concurrency slot helpers.
- `stream-proxy.controller.ts` / `series-stream-proxy.controller.ts`: cache the remux plan alongside the resolved URL; branch to ffmpeg pipeline when needed, unchanged passthrough otherwise.
- `streaming.routes.ts`: add optional `seekTo` querystring param to both proxy routes.
- `Dockerfile`: `apk add --no-cache ffmpeg` in the final stage.
- Frontend `VideoPlayer`: seek handling (reload src with `seekTo`, track segment base offset locally).

## Explicitly out of scope

- GPU-accelerated encode (NVENC) — software `veryfast` is enough at 1-2 concurrent streams on this hardware; revisit if concurrency needs grow.
- Perfect absolute-time progress bar across seeks on transcoded streams — accepted quirk: after a seek, the player's own `currentTime`/`duration` reflect the new segment, not the full movie, since vidstack doesn't expose duration override cleanly. Seeking works, display may reset instead of showing true absolute position.
