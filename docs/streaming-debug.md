# Streaming Debug Notes

## Problem
Browser video player shows "No video with supported format and MIME type found" or "File was removed from debrid service due to copyright infringement".

## Root Causes Found & Fixed

### 1. CORS `allowedHeaders: '*'` doesn't cover `Authorization`
**File:** `src/app.ts`
**Fix:** Changed to explicit list:
```ts
app.register(cors, {
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});
```

### 2. `<video>` without `crossOrigin` → opaque response → OpaqueResponseBlocking
**File:** `src/routes/movie/ui/movieModal.tsx` (frontend)
**Fix:** Added `crossOrigin="anonymous"` to `<video>` element.

### 3. `useCreateWatchList` wrong casing (import error)
**File:** `src/routes/movie/$id.tsx` (frontend)
**Fix:** Renamed to `useCreateWatchlist` / `useDeleteWatchlist` (lowercase L) to match gen output.

### 4. Movie saved without `imdbId` — proxy returns 404
**Problem:** `CreateMovieUseCase` did `if (existing) return existing` — returned stale DB record without `imdbId` when movie was first added via watchlist.
**Fix:** Changed to upsert in `movies.repository.ts` + `create-movie.use-case.ts`. Now always patches `imdbId` on existing records.

### 5. Route body schema stripped `imdbId`
**File:** `src/interfaces/http/routes/catalog.routes.ts`
**Fix:** Added `imdbId: z.string().optional()` to POST `/movies` body schema and response schema.

### 6. `AggregateStreamsUseCase` parser totally broken
**Problem:** Expected `quality/codec/bitrate/seeds` fields directly on Torrentio streams, but Torrentio returns `name/title/url/behaviorHints`. All fields came through as `undefined`.
**Fix:** Rewrote parser to extract:
- `quality` from `name` + `filename` (regex for 4k/2160p/1080p/720p)
- `codec` from `filename` (hevc/h265/x265 vs h264/x264/avc vs av1)
- `seeds` from `title` (parses `👤 N` emoji pattern)
- Added `isBrowserCompatible()` filter — only MP4 extension + not HEVC-only

### 7. Stream proxy no fallback on DMCA/unavailable streams
**Fix:** Proxy now iterates `ranked[]` array, skips streams that return HTML or errors, uses first working one.

### 8. Real-Debrid DMCA placeholder disguised as `video/mp4`
**Problem:** RD returns a fake `video/mp4` response with exactly `2,119,075` bytes for DMCA'd files. Browser shows "File was removed from debrid service due to copyright infringement".
**Fix:** Added DMCA size detection in proxy:
```ts
const DMCA_SIZE = 2_119_075;
const MIN_VIDEO_SIZE = 10_000_000;
if (!rangeHeader && contentLength) {
  const size = parseInt(contentLength, 10);
  if (size === DMCA_SIZE || size < MIN_VIDEO_SIZE) return null; // skip
}
```

### 9. `application/force-download` content-type breaks browser `<video>`
**Problem:** RD returns `Content-Type: application/force-download` for some cached files. Browser refuses to play.
**Fix:** Proxy overrides to `video/mp4` when upstream returns `application/force-download`.

## Current State (end of session)

- Proxy returns `Content-Type: video/mp4`, `Content-Length: 4775326016` (4.4GB real CAMRip file)
- Raw bytes start with `ftypmp42` — valid MP4 container
- Browser still not playing — unknown why (user confirmed still broken)

## What to Try Tomorrow

1. **Check browser console for exact error** after clicking Assistir — network tab, what status does the proxy return?
2. **Test with `<video>` directly** in browser console:
   ```js
   const v = document.createElement('video');
   v.src = 'http://localhost:3333/stream/proxy/289a5cd1-4b6b-40d8-933b-555703e829a0';
   v.controls = true;
   document.body.appendChild(v);
   ```
3. **Check if Range requests work** — browser sends `Range: bytes=0-` for video, verify proxy handles it. The CAMRip file is 4.4GB so browser needs Range support to seek.
4. **Try HLS.js** — if native video still fails, use HLS.js library to handle the stream. Requires backend to segment into HLS (FFmpeg needed again) OR use a different stream source.
5. **Check if movie `imdbId` is actually saved** after clicking Assistir:
   ```sql
   SELECT id, title, "imdbId" FROM "Movie" WHERE "tmdbId" = 687163;
   ```
6. **Alternative: use `vidsrc.icu` embed** instead of direct proxy — keep the `<iframe>` path as fallback when proxy stream fails.
7. **Firefox vs Chrome** — try in Chrome, Firefox has stricter OpaqueResponseBlocking.
8. **File size issue** — 4.4GB CAMRip might time out or the browser might reject it without proper `Accept-Ranges` support. Check if the proxy properly handles `Range` headers for seeking.

## Key URLs / IDs
- Movie: "Devoradores de Estrelas" (Project Hail Mary), tmdbId=687163, imdbId=tt12042730
- DB ID: `289a5cd1-4b6b-40d8-933b-555703e829a0`
- Proxy endpoint: `GET http://localhost:3333/stream/proxy/{movieId}`
- Torrentio addon URL in DB: `https://torrentio.strem.fun/realdebrid=RDNSKWQAKQQDGYRUV66FWRHTBAIZYX7JYAKMD4HD3RJ2A6AZWXGA`
- Total streams available: 125 (13 MP4, all WEB-DL ones DMCA'd, CAMRip ones real)

## Files Modified This Session
- `src/app.ts` — CORS fix
- `src/interfaces/http/controllers/stream-proxy.controller.ts` — fallback + DMCA detection + content-type override
- `src/interfaces/http/routes/catalog.routes.ts` — added imdbId to schema
- `src/core/use-cases/ranking/aggregate-streams.use-case.ts` — full Torrentio parser rewrite
- `src/core/use-cases/catalog/create-movie.use-case.ts` — upsert instead of early return
- `src/infrastructure/database/repositories/movies.repository.ts` — added upsert method
- Frontend `src/routes/movie/$id.tsx` — hook casing fix
- Frontend `src/routes/movie/ui/movieModal.tsx` — isVideo prop + crossOrigin
