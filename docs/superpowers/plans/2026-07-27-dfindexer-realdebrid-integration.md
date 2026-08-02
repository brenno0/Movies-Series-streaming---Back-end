# dfindexer + Real-Debrid Streaming Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No TDD** — this plan skips the write-test-first cycle by explicit user request; verification steps use `tsc --noEmit` and manual smoke checks instead of automated tests.

**Goal:** Replace the Stremio-addon streaming pipeline (Jackett/Torrentio/`AddonRegistry`) with a direct dfindexer (5 Brazilian torrent scrapers, queried in parallel) + Real-Debrid (magnet → direct HTTP link) pipeline, without touching the existing byte-range streaming proxy.

**Architecture:** `DfindexerClient` searches all 5 scrapers in parallel and returns raw candidates; a pure scoring function ranks them by seed count/quality/match-similarity; the top 8 candidates get resolved to real download URLs via a new `RealDebridClient` (add magnet → select file → poll → unrestrict); the resulting `StreamEntity[]` feeds the **unmodified** `stream-proxy.controller.ts` probe/pipe logic.

**Tech Stack:** TypeScript, Fastify, Prisma, Redis (ioredis), native `fetch`.

## Global Constraints

- No TDD this round — implement directly, verify with `npx tsc --noEmit` after each task, no test files required.
- Real-Debrid token: reuse existing `REAL_DEBRID_TOKEN` env var (already in `src/env/index.ts`, unused until now).
- Reuse the same magnet-resolution trick Torrentio used server-side — resolve here instead, in `RealDebridClient`.
- `stream-proxy.controller.ts` and `series-stream-proxy.controller.ts` are **not modified** — they already consume `{url, audio, codec, language, container}[]`; the new pipeline must produce that same shape.
- dfindexer scrapers: `starck`, `rede`, `tfilme`, `comand`, `bludv`. `comand` and `bludv` require `use_flaresolverr=true` (Cloudflare); the other 3 use `false`.
- dfindexer query formats (confirmed against dfindexer's own `utils/text/query.py`): movie = `"{title}"`, episode = `"{title} S{season:02}E{episode:02}"`, full season = `"{title} temporada {season}"`.
- Backend runs on the `nbflix-network` bridge network (not host mode); dfindexer runs in a separate compose project with `network_mode: host`. `localhost` inside `nb-flix-backend` does **not** reach dfindexer — must use `host.docker.internal` (wired via `extra_hosts` in this task's docker-compose change).

---

### Task 1: DfindexerClient

**Files:**
- Create: `src/infrastructure/dfindexer/dfindexer.types.ts`
- Create: `src/infrastructure/dfindexer/dfindexer.client.ts`

**Interfaces:**
- Produces: `DfindexerResult`, `DfindexerCandidate`, `ScraperType` (types), `DfindexerClient` class with `searchAll(query: string): Promise<DfindexerCandidate[]>`.

- [ ] **Step 1: Write the types file**

```typescript
// src/infrastructure/dfindexer/dfindexer.types.ts
export type ScraperType = 'starck' | 'rede' | 'tfilme' | 'comand' | 'bludv';

export interface DfindexerResult {
  title: string;
  title_processed: string;
  title_translated_processed: string;
  original_title: string;
  magnet_link: string;
  magnet_original: string;
  magnet_processed: string;
  info_hash: string;
  details: string;
  date: string;
  size: string;
  seed_count: number;
  leech_count: number;
  imdb: string;
  legend: string;
  audio: string[];
  has_legenda: boolean;
  similarity: number;
  year: string;
  trackers: string[];
}

export interface DfindexerCandidate extends DfindexerResult {
  scraperSource: ScraperType;
}
```

- [ ] **Step 2: Write the client**

```typescript
// src/infrastructure/dfindexer/dfindexer.client.ts
import type { DfindexerCandidate, DfindexerResult, ScraperType } from './dfindexer.types';

const SCRAPERS: ScraperType[] = ['starck', 'rede', 'tfilme', 'comand', 'bludv'];

// Sites behind Cloudflare per dfindexer's own README — need FlareSolverr to pass the challenge.
const NEEDS_FLARESOLVERR: Set<ScraperType> = new Set(['comand', 'bludv']);

const REQUEST_TIMEOUT_MS = 25000;

export class DfindexerClient {
  constructor(private readonly baseUrl: string) {}

  async search(scraperType: ScraperType, query: string): Promise<DfindexerResult[]> {
    const useFlaresolverr = NEEDS_FLARESOLVERR.has(scraperType);
    const url = `${this.baseUrl}/indexers/${scraperType}?q=${encodeURIComponent(query)}&use_flaresolverr=${useFlaresolverr}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: DfindexerResult[] };
      return data.results ?? [];
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchAll(query: string): Promise<DfindexerCandidate[]> {
    const settled = await Promise.allSettled(
      SCRAPERS.map((scraperType) => this.search(scraperType, query)),
    );

    const candidates: DfindexerCandidate[] = [];
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const scraperSource = SCRAPERS[index];
      result.value.forEach((r) => candidates.push({ ...r, scraperSource }));
    });

    return candidates;
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `dfindexer.client.ts` or `dfindexer.types.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/dfindexer/
git commit -m "feat: add DfindexerClient for parallel multi-scraper torrent search"
```

---

### Task 2: RealDebridClient

**Files:**
- Create: `src/infrastructure/real-debrid/real-debrid.types.ts`
- Create: `src/infrastructure/real-debrid/real-debrid.client.ts`

**Interfaces:**
- Consumes: `redis` export from `@/infrastructure/cache/redis` (ioredis instance, `.get(key)`, `.set(key, value, 'EX', seconds)`, matches usage already in `src/infrastructure/cache/stream-cache.ts`).
- Produces: `RealDebridClient` class with `resolveMagnetToUrl(magnet: string, infoHash: string, episodeHint?: { season: number; episode: number }): Promise<{ url: string; filename: string; container: 'mp4' | 'mkv' } | null>`.

- [ ] **Step 1: Write the types file**

```typescript
// src/infrastructure/real-debrid/real-debrid.types.ts
export interface RdTorrentFile {
  id: number;
  path: string;
  bytes: number;
  selected: 0 | 1;
}

export interface RdTorrentInfo {
  id: string;
  filename: string;
  status:
    | 'magnet_error'
    | 'magnet_conversion'
    | 'waiting_files_selection'
    | 'queued'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'virus'
    | 'compressing'
    | 'uploading'
    | 'dead';
  files: RdTorrentFile[];
  links: string[];
}

export interface RdUnrestrictedLink {
  download: string;
  filename: string;
  mimeType: string;
  filesize: number;
}
```

- [ ] **Step 2: Write the client**

```typescript
// src/infrastructure/real-debrid/real-debrid.client.ts
import { redis } from '@/infrastructure/cache/redis';

import type { RdTorrentFile, RdTorrentInfo, RdUnrestrictedLink } from './real-debrid.types';

const API_BASE = 'https://api.real-debrid.com/rest/1.0';
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 3000;
const LINK_CACHE_TTL_SECONDS = 4 * 60 * 60; // RD unrestricted links expire — same TTL the old proxy cache used
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];

function cacheKey(infoHash: string): string {
  return `rd:link:${infoHash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function pickFile(files: RdTorrentFile[], episodeHint?: { season: number; episode: number }): RdTorrentFile | null {
  const videoFiles = files.filter((f) => isVideoFile(f.path));
  if (videoFiles.length === 0) return null;

  if (episodeHint) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const pattern = new RegExp(`s${pad(episodeHint.season)}e${pad(episodeHint.episode)}`, 'i');
    const matched = videoFiles.filter((f) => pattern.test(f.path));
    if (matched.length > 0) {
      return matched.reduce((a, b) => (b.bytes > a.bytes ? b : a));
    }
  }

  return videoFiles.reduce((a, b) => (b.bytes > a.bytes ? b : a));
}

export class RealDebridClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Real-Debrid API error ${res.status} on ${path}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async addMagnet(magnet: string): Promise<{ id: string }> {
    const body = new URLSearchParams({ magnet });
    return this.request<{ id: string }>('/torrents/addMagnet', { method: 'POST', body });
  }

  async selectFiles(torrentId: string, fileIds: string[]): Promise<void> {
    const body = new URLSearchParams({ files: fileIds.join(',') });
    await this.request<void>(`/torrents/selectFiles/${torrentId}`, { method: 'POST', body });
  }

  async getTorrentInfo(torrentId: string): Promise<RdTorrentInfo> {
    return this.request<RdTorrentInfo>(`/torrents/info/${torrentId}`);
  }

  async unrestrictLink(link: string): Promise<RdUnrestrictedLink> {
    const body = new URLSearchParams({ link });
    return this.request<RdUnrestrictedLink>('/unrestrict/link', { method: 'POST', body });
  }

  async resolveMagnetToUrl(
    magnet: string,
    infoHash: string,
    episodeHint?: { season: number; episode: number },
  ): Promise<{ url: string; filename: string; container: 'mp4' | 'mkv' } | null> {
    const cached = await redis.get(cacheKey(infoHash));
    if (cached) return JSON.parse(cached) as { url: string; filename: string; container: 'mp4' | 'mkv' };

    try {
      const { id } = await this.addMagnet(magnet);
      let info = await this.getTorrentInfo(id);

      if (info.status === 'waiting_files_selection') {
        const file = pickFile(info.files, episodeHint);
        if (!file) return null;
        await this.selectFiles(id, [String(file.id)]);
      }

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        info = await this.getTorrentInfo(id);
        if (info.status === 'downloaded' && info.links.length > 0) break;
        if (info.status === 'error' || info.status === 'dead' || info.status === 'virus' || info.status === 'magnet_error') return null;
        await sleep(POLL_INTERVAL_MS);
      }

      if (info.status !== 'downloaded' || info.links.length === 0) return null;

      const unrestricted = await this.unrestrictLink(info.links[0]);
      const container: 'mp4' | 'mkv' = unrestricted.filename.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mkv';
      const result = { url: unrestricted.download, filename: unrestricted.filename, container };

      await redis.set(cacheKey(infoHash), JSON.stringify(result), 'EX', LINK_CACHE_TTL_SECONDS);
      return result;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `real-debrid.client.ts` or `real-debrid.types.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/real-debrid/
git commit -m "feat: add RealDebridClient to resolve magnets into direct download links"
```

---

### Task 3: Query builder and release-metadata parsing

**Files:**
- Create: `src/core/use-cases/ranking/build-dfindexer-query.ts`
- Create: `src/core/use-cases/ranking/parse-dfindexer-release.ts`

**Interfaces:**
- Consumes: `DfindexerCandidate` from `@/infrastructure/dfindexer/dfindexer.types`, `StreamEntity['quality']`/`['codec']`/`['audio']`/`['language']` from `@/core/entities/stream.entity` (defined in Task 5).
- Produces: `buildMovieQuery(title: string): string`, `buildEpisodeQuery(title: string, season: number, episode: number): string`, `parseQuality`, `parseCodec`, `parseAudio`, `parseLanguage`, `isBrowserCompatible` — all take a `DfindexerCandidate`.

- [ ] **Step 1: Write the query builder**

```typescript
// src/core/use-cases/ranking/build-dfindexer-query.ts
export function buildMovieQuery(title: string): string {
  return title;
}

export function buildEpisodeQuery(title: string, season: number, episode: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${title} S${pad(season)}E${pad(episode)}`;
}
```

- [ ] **Step 2: Write the release-metadata parser**

Ported from the old Torrentio-facing parser in `aggregate-streams.use-case.ts`, pointed at
dfindexer's `magnet_processed` (already-standardized release name, e.g.
`"Reacher.S01.2022.WEB-DL.1080p.x264.DUAL.5.1-STARCKFILMES"`) and `title` (carries
`[Brazilian]`/`[Eng]`/`[Jap]` tags per dfindexer's own README convention).

```typescript
// src/core/use-cases/ranking/parse-dfindexer-release.ts
import type { DfindexerCandidate } from '@/infrastructure/dfindexer/dfindexer.types';

export function parseQuality(candidate: DfindexerCandidate): '4K' | '1080p' | '720p' | '480p' {
  const src = candidate.magnet_processed.toLowerCase();
  if (src.includes('2160p') || src.includes('4k') || src.includes('uhd')) return '4K';
  if (src.includes('1080p')) return '1080p';
  if (src.includes('720p')) return '720p';
  return '480p';
}

export function parseCodec(candidate: DfindexerCandidate): 'h264' | 'hevc' | 'av1' {
  const src = candidate.magnet_processed.toLowerCase();
  if (src.includes('av1')) return 'av1';
  if (src.includes('hevc') || src.includes('h265') || src.includes('x265')) return 'hevc';
  return 'h264';
}

export function parseAudio(candidate: DfindexerCandidate): 'aac' | 'ac3' | 'dts' | 'unknown' {
  const src = `${candidate.title} ${candidate.magnet_processed}`.toLowerCase();
  if (src.includes('truehd') || src.includes('atmos')) return 'dts';
  if (src.includes('dts')) return 'dts';
  if (src.includes('eac3') || src.includes('ddp') || src.includes('dd+')) return 'ac3';
  if (/\bdd[257][.\s]?[012]\b/.test(src) && !src.includes('aac')) return 'ac3';
  if (src.includes('ac3') || src.includes('dolby digital')) return 'ac3';
  if (src.includes('aac')) return 'aac';
  return 'unknown';
}

export function parseLanguage(candidate: DfindexerCandidate): 'pt' | 'en' | 'multi' | 'unknown' | 'other' {
  const title = candidate.title.toLowerCase();
  const hasBrazilian = title.includes('[brazilian]');
  const hasEng = title.includes('[eng]');
  const hasJap = title.includes('[jap]');

  if (hasBrazilian && (hasEng || hasJap)) return 'multi';
  if (hasBrazilian) return 'pt';
  if (hasJap) return 'other';
  if (hasEng) return 'en';

  // Fall back to the "legend" field (audio/subtitle language reported by the scraper).
  const legend = candidate.legend.toLowerCase();
  if (legend.includes('português') || legend.includes('portugues')) return 'pt';
  if (legend.includes('inglês') || legend.includes('ingles') || legend.includes('english')) return 'en';

  return 'unknown';
}

// Rejects cam/telesync rips regardless of quality — same rule the old Torrentio parser used.
export function isBrowserCompatibleRelease(candidate: DfindexerCandidate): boolean {
  const src = `${candidate.title} ${candidate.magnet_processed}`.toLowerCase();
  if (
    src.includes('camrip') || src.includes('cam-rip') || src.includes('hdcam') ||
    src.includes('dcprip') || src.includes('dcp-rip') ||
    src.includes('telesync') || src.includes('telecine') || src.includes('screener')
  ) return false;
  return true;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors only about `@/core/entities/stream.entity` or `@/infrastructure/dfindexer/dfindexer.types` if Task 1/5 haven't landed yet in this exact order — none expected since both already exist by this point.

- [ ] **Step 4: Commit**

```bash
git add src/core/use-cases/ranking/build-dfindexer-query.ts src/core/use-cases/ranking/parse-dfindexer-release.ts
git commit -m "feat: add dfindexer query builder and release-metadata parsing"
```

---

### Task 4: Add DFINDEXER_URL env var

**Files:**
- Modify: `src/env/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `env.DFINDEXER_URL: string`, consumed by the factories in Task 6.

- [ ] **Step 1: Add the env var to the schema**

In `src/env/index.ts`, add one line to `envSchema`:

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['dev', 'test', 'production']),
  PORT: z.coerce.number().default(3333),
  JWT_SECRET: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REAL_DEBRID_TOKEN: z.string(),
  DFINDEXER_URL: z.string().default('http://host.docker.internal:7006'),
});
```

- [ ] **Step 2: Document it in `.env.example`**

Append to `.env.example`:

```
DFINDEXER_URL="http://host.docker.internal:7006"
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/env/index.ts .env.example
git commit -m "feat: add DFINDEXER_URL env var"
```

---

### Task 5: Rewrite StreamEntity and the scoring functions

**Files:**
- Modify: `src/core/entities/stream.entity.ts`
- Modify: `src/core/use-cases/ranking/calculate-stream-score.use-case.ts`

**Interfaces:**
- Produces: `StreamEntity` (with `scraperSource` replacing `addonSource`), `scoreCandidate(candidate: DfindexerCandidate): number`, `rankCandidates(candidates: DfindexerCandidate[], preferLang: 'pt' | 'en'): DfindexerCandidate[]`, `rankStreams(streams: StreamEntity[], preferLang: 'pt' | 'en'): StreamEntity[]` (signature unchanged, still used by Task 6).

- [ ] **Step 1: Rewrite the entity**

```typescript
// src/core/entities/stream.entity.ts
import type { ScraperType } from '@/infrastructure/dfindexer/dfindexer.types';

export interface StreamEntity {
  id: string;
  movieId: string;
  url: string;
  quality: '4K' | '1080p' | '720p' | '480p';
  codec: 'h264' | 'hevc' | 'av1';
  container: 'mp4' | 'mkv';
  audio: 'aac' | 'ac3' | 'dts' | 'unknown';
  language: 'pt' | 'en' | 'multi' | 'unknown' | 'other';
  bitrate: number;
  seeds: number;
  scraperSource: ScraperType;
  score?: number;
}
```

- [ ] **Step 2: Rewrite the scoring functions**

Adds `scoreCandidate`/`rankCandidates` (pre-Real-Debrid, ranks raw dfindexer results to
pick which ones are worth resolving) alongside the existing `calculateScore`/`rankStreams`
(post-Real-Debrid, unchanged signature — `stream-proxy.controller.ts` doesn't call these
directly, but `GetBestStreamUseCase` in Task 6 does).

```typescript
// src/core/use-cases/ranking/calculate-stream-score.use-case.ts
import type { StreamEntity } from '@/core/entities/stream.entity';
import { resolutionScore } from '@/core/value-objects/stream-metadata.vo';
import type { DfindexerCandidate } from '@/infrastructure/dfindexer/dfindexer.types';

import { parseLanguage, parseQuality } from './parse-dfindexer-release';

const CANDIDATE_WEIGHTS = { quality: 0.4, seeds: 0.35, similarity: 0.25 };
const STREAM_WEIGHTS = { quality: 0.35, seeds: 0.25, compat: 0.25, language: 0.05, latency: 0.1 };
const MAX_SEEDS = 1000;
const MAX_LATENCY_MS = 5000;
const MIN_SIMILARITY = 0.5;

export function scoreCandidate(candidate: DfindexerCandidate): number {
  const qualityNorm = resolutionScore(parseQuality(candidate)) / 4;
  const seedsNorm = Math.min(candidate.seed_count / MAX_SEEDS, 1);
  return (
    qualityNorm * CANDIDATE_WEIGHTS.quality +
    seedsNorm * CANDIDATE_WEIGHTS.seeds +
    candidate.similarity * CANDIDATE_WEIGHTS.similarity
  );
}

export function rankCandidates(candidates: DfindexerCandidate[], preferLang: 'pt' | 'en' = 'pt'): DfindexerCandidate[] {
  const filtered = candidates.filter((c) => c.similarity >= MIN_SIMILARITY);
  const ptPool = filtered.filter((c) => parseLanguage(c) === 'pt');
  const otherPool = filtered.filter((c) => ['en', 'multi', 'unknown'].includes(parseLanguage(c)));

  const pool = preferLang === 'pt'
    ? (ptPool.length > 0 ? ptPool : otherPool)
    : (otherPool.length > 0 ? otherPool : ptPool);

  return [...pool].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
}

function languageScore(stream: StreamEntity): number {
  if (stream.language === 'pt') return 1.0;
  if (stream.language === 'multi') return 0.8;
  if (stream.language === 'en') return 0.6;
  return 0.3;
}

function compatScore(stream: StreamEntity): number {
  const isH264 = stream.codec === 'h264';
  const isAAC = stream.audio === 'aac';
  let score = 0;
  if (stream.container === 'mp4' && isH264) score += 0.6;
  else if (stream.container === 'mp4') score += 0.35;
  else if (stream.container === 'mkv' && isH264) score += 0.4;
  else score += 0.2;
  score += isAAC ? 0.4 : 0.2;
  return score;
}

export function calculateScore(stream: StreamEntity, latencyMs = 0): number {
  const qualityNorm = resolutionScore(stream.quality) / 4;
  const seedsNorm = Math.min(stream.seeds / MAX_SEEDS, 1);
  const latencyNorm = 1 - Math.min(latencyMs / MAX_LATENCY_MS, 1);

  return (
    qualityNorm * STREAM_WEIGHTS.quality +
    seedsNorm * STREAM_WEIGHTS.seeds +
    compatScore(stream) * STREAM_WEIGHTS.compat +
    languageScore(stream) * STREAM_WEIGHTS.language +
    latencyNorm * STREAM_WEIGHTS.latency
  );
}

export function rankStreams(streams: StreamEntity[], preferLang: 'pt' | 'en' = 'pt'): StreamEntity[] {
  const ptPool = streams.filter((s) => s.language === 'pt');
  const enPool = streams.filter((s) => s.language === 'en' || s.language === 'multi' || s.language === 'unknown');
  let pool: StreamEntity[];
  if (preferLang === 'pt') {
    pool = ptPool.length > 0 ? ptPool : enPool;
  } else {
    pool = enPool.length > 0 ? enPool : ptPool;
  }
  return pool
    .map((s) => ({ ...s, score: calculateScore(s) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
```

- [ ] **Step 3: Delete the stale spec file**

`calculate-stream-score.use-case.spec.ts` asserts against the old `addonSource`-based
`StreamEntity` shape and the removed Torrentio-parsing path. Since this plan skips TDD and
the file would no longer compile against the new entity, delete it rather than rewrite it:

```bash
rm src/core/use-cases/ranking/calculate-stream-score.use-case.spec.ts
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors remaining only in files not yet touched (`aggregate-streams.use-case.ts`,
`aggregate-series-streams.use-case.ts`, `get-best-stream.use-case.ts`,
`get-best-series-stream.use-case.ts`, `start-playback.use-case.ts`, the two factories) —
all fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/core/entities/stream.entity.ts src/core/use-cases/ranking/calculate-stream-score.use-case.ts
git rm src/core/use-cases/ranking/calculate-stream-score.use-case.spec.ts
git commit -m "feat: rework StreamEntity and scoring for dfindexer candidates"
```

---

### Task 6: Rewire the streaming pipeline (aggregate → get-best-stream → factories → start-playback)

This is the integration task — everything from Task 1–5 gets wired together here. It's one
task because these files import each other and must land as a unit to compile.

**Files:**
- Modify: `src/core/use-cases/ranking/aggregate-streams.use-case.ts`
- Modify: `src/core/use-cases/ranking/aggregate-series-streams.use-case.ts`
- Modify: `src/core/use-cases/ranking/get-best-stream.use-case.ts`
- Modify: `src/core/use-cases/ranking/get-best-series-stream.use-case.ts`
- Modify: `src/core/use-cases/factories/ranking.factories.ts`
- Modify: `src/core/use-cases/factories/streaming.factories.ts`
- Modify: `src/core/use-cases/streaming/start-playback.use-case.ts`

**Interfaces:**
- Consumes: `DfindexerClient.searchAll` (Task 1), `RealDebridClient.resolveMagnetToUrl` (Task 2), `buildMovieQuery`/`buildEpisodeQuery` (Task 3), `parseQuality`/`parseCodec`/`parseAudio`/`parseLanguage`/`isBrowserCompatibleRelease` (Task 3), `rankCandidates`/`rankStreams` (Task 5), `StreamEntity` (Task 5), `env.DFINDEXER_URL`/`env.REAL_DEBRID_TOKEN` (Task 4).
- Produces: `AggregateStreamsUseCase.execute(movieId, season?, episode?): Promise<StreamEntity[]>`, same signature pattern for series, unchanged public shape of `GetBestStreamUseCase`/`GetBestSeriesStreamUseCase`/`StartPlaybackUseCase` (so `streaming.routes.ts` and the two proxy controllers need zero changes).

- [ ] **Step 1: Rewrite `aggregate-streams.use-case.ts` (movies)**

```typescript
// src/core/use-cases/ranking/aggregate-streams.use-case.ts
import type { StreamEntity } from '@/core/entities/stream.entity';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { ResourceNotFoundError } from '@/shared/errors';

import { buildMovieQuery } from './build-dfindexer-query';
import { rankCandidates } from './calculate-stream-score.use-case';
import { isBrowserCompatibleRelease, parseAudio, parseCodec, parseLanguage, parseQuality } from './parse-dfindexer-release';

const TOP_N_TO_RESOLVE = 8;

export class AggregateStreamsUseCase {
  constructor(
    private readonly dfindexerClient: DfindexerClient,
    private readonly realDebridClient: RealDebridClient,
    private readonly moviesRepository: MoviesRepository,
  ) {}

  async execute(movieId: string, preferLang: 'pt' | 'en' = 'pt'): Promise<StreamEntity[]> {
    const movie = await this.moviesRepository.findById(movieId);
    if (!movie) throw new ResourceNotFoundError({ resource: 'Movie' });

    const query = buildMovieQuery(movie.title);
    const rawCandidates = await this.dfindexerClient.searchAll(query);
    const compatible = rawCandidates.filter(isBrowserCompatibleRelease);
    const ranked = rankCandidates(compatible, preferLang).slice(0, TOP_N_TO_RESOLVE);

    const resolved = await Promise.allSettled(
      ranked.map((c) => this.realDebridClient.resolveMagnetToUrl(c.magnet_link, c.info_hash)),
    );

    const streams: StreamEntity[] = [];
    resolved.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const candidate = ranked[index];
      streams.push({
        id: candidate.info_hash,
        movieId,
        url: result.value.url,
        quality: parseQuality(candidate),
        codec: parseCodec(candidate),
        container: result.value.container,
        audio: parseAudio(candidate),
        language: parseLanguage(candidate),
        bitrate: 0,
        seeds: candidate.seed_count,
        scraperSource: candidate.scraperSource,
      });
    });

    return streams;
  }
}
```

- [ ] **Step 2: Rewrite `aggregate-series-streams.use-case.ts` (series)**

```typescript
// src/core/use-cases/ranking/aggregate-series-streams.use-case.ts
import type { StreamEntity } from '@/core/entities/stream.entity';
import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { ResourceNotFoundError } from '@/shared/errors';

import { buildEpisodeQuery } from './build-dfindexer-query';
import { rankCandidates } from './calculate-stream-score.use-case';
import { isBrowserCompatibleRelease, parseAudio, parseCodec, parseLanguage, parseQuality } from './parse-dfindexer-release';

const TOP_N_TO_RESOLVE = 8;

export class AggregateSeriesStreamsUseCase {
  constructor(
    private readonly dfindexerClient: DfindexerClient,
    private readonly realDebridClient: RealDebridClient,
    private readonly seriesRepository: SeriesRepository,
  ) {}

  async execute(seriesId: string, season: number, episode: number, preferLang: 'pt' | 'en' = 'pt'): Promise<StreamEntity[]> {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) throw new ResourceNotFoundError({ resource: 'Series' });

    const query = buildEpisodeQuery(series.title, season, episode);
    const rawCandidates = await this.dfindexerClient.searchAll(query);
    const compatible = rawCandidates.filter(isBrowserCompatibleRelease);
    const ranked = rankCandidates(compatible, preferLang).slice(0, TOP_N_TO_RESOLVE);

    const resolved = await Promise.allSettled(
      ranked.map((c) => this.realDebridClient.resolveMagnetToUrl(c.magnet_link, c.info_hash, { season, episode })),
    );

    const streams: StreamEntity[] = [];
    resolved.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const candidate = ranked[index];
      streams.push({
        id: candidate.info_hash,
        movieId: seriesId,
        url: result.value.url,
        quality: parseQuality(candidate),
        codec: parseCodec(candidate),
        container: result.value.container,
        audio: parseAudio(candidate),
        language: parseLanguage(candidate),
        bitrate: 0,
        seeds: candidate.seed_count,
        scraperSource: candidate.scraperSource,
      });
    });

    return streams;
  }
}
```

- [ ] **Step 3: Update `get-best-stream.use-case.ts` constructor**

Only the constructor and its dependency wiring change — `execute`/`invalidate` bodies stay identical.

```typescript
// src/core/use-cases/ranking/get-best-stream.use-case.ts
import type { StreamEntity } from '@/core/entities/stream.entity';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { deleteStreamCache, getStreamCache, setStreamCache } from '@/infrastructure/cache/stream-cache';
import { StreamNotFoundError } from '@/shared/errors';

import { AggregateStreamsUseCase } from './aggregate-streams.use-case';
import { rankStreams } from './calculate-stream-score.use-case';

export class GetBestStreamUseCase {
  private aggregator: AggregateStreamsUseCase;

  constructor(
    dfindexerClient: DfindexerClient,
    realDebridClient: RealDebridClient,
    private readonly moviesRepository: MoviesRepository,
  ) {
    this.aggregator = new AggregateStreamsUseCase(dfindexerClient, realDebridClient, moviesRepository);
  }

  async execute(movieId: string, lang: 'pt' | 'en' = 'pt'): Promise<{ best: StreamEntity; ranked: StreamEntity[] }> {
    const cKey = `${movieId}:${lang}`;
    const cached = await getStreamCache(cKey);
    if (cached && cached.length > 0) {
      return { best: cached[0], ranked: cached };
    }

    const streams = await this.aggregator.execute(movieId, lang);
    if (streams.length === 0) throw new StreamNotFoundError();

    const ranked = rankStreams(streams, lang);
    await setStreamCache(cKey, ranked);

    return { best: ranked[0], ranked };
  }

  async invalidate(movieId: string): Promise<void> {
    await deleteStreamCache(`${movieId}:pt`);
    await deleteStreamCache(`${movieId}:en`);
  }
}
```

- [ ] **Step 4: Update `get-best-series-stream.use-case.ts` constructor**

```typescript
// src/core/use-cases/ranking/get-best-series-stream.use-case.ts
import type { StreamEntity } from '@/core/entities/stream.entity';
import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { deleteStreamCache, getStreamCache, setStreamCache } from '@/infrastructure/cache/stream-cache';
import { StreamNotFoundError } from '@/shared/errors';

import { AggregateSeriesStreamsUseCase } from './aggregate-series-streams.use-case';
import { rankStreams } from './calculate-stream-score.use-case';

export class GetBestSeriesStreamUseCase {
  private aggregator: AggregateSeriesStreamsUseCase;

  constructor(
    dfindexerClient: DfindexerClient,
    realDebridClient: RealDebridClient,
    private readonly seriesRepository: SeriesRepository,
  ) {
    this.aggregator = new AggregateSeriesStreamsUseCase(dfindexerClient, realDebridClient, seriesRepository);
  }

  private cacheKey(seriesId: string, season: number, episode: number, lang: 'pt' | 'en'): string {
    return `series:${seriesId}:${season}:${episode}:${lang}`;
  }

  async execute(seriesId: string, season: number, episode: number, lang: 'pt' | 'en' = 'pt'): Promise<{ best: StreamEntity; ranked: StreamEntity[] }> {
    const cKey = this.cacheKey(seriesId, season, episode, lang);
    const cached = await getStreamCache(cKey);
    if (cached && cached.length > 0) {
      return { best: cached[0], ranked: cached };
    }

    const streams = await this.aggregator.execute(seriesId, season, episode, lang);
    if (streams.length === 0) throw new StreamNotFoundError();

    const ranked = rankStreams(streams, lang);
    await setStreamCache(cKey, ranked);

    return { best: ranked[0], ranked };
  }

  async invalidate(seriesId: string, season: number, episode: number): Promise<void> {
    await deleteStreamCache(this.cacheKey(seriesId, season, episode, 'pt'));
    await deleteStreamCache(this.cacheKey(seriesId, season, episode, 'en'));
  }
}
```

- [ ] **Step 5: Update the ranking factories**

```typescript
// src/core/use-cases/factories/ranking.factories.ts
import { env } from '@/env';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { SeriesPrismaRepository } from '@/infrastructure/database/repositories/series.repository';
import { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';

import { AggregateStreamsUseCase } from '../ranking/aggregate-streams.use-case';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';
import { GetBestSeriesStreamUseCase } from '../ranking/get-best-series-stream.use-case';

export function makeDfindexerClient() {
  return new DfindexerClient(env.DFINDEXER_URL);
}

export function makeRealDebridClient() {
  return new RealDebridClient(env.REAL_DEBRID_TOKEN);
}

export function makeAggregateStreams() {
  return new AggregateStreamsUseCase(makeDfindexerClient(), makeRealDebridClient(), new MoviesPrismaRepository());
}

export function makeGetBestStream() {
  return new GetBestStreamUseCase(makeDfindexerClient(), makeRealDebridClient(), new MoviesPrismaRepository());
}

export function makeGetBestSeriesStream() {
  return new GetBestSeriesStreamUseCase(makeDfindexerClient(), makeRealDebridClient(), new SeriesPrismaRepository());
}
```

- [ ] **Step 6: Update `start-playback.use-case.ts`**

```typescript
// src/core/use-cases/streaming/start-playback.use-case.ts
import type { PlaybackSessionRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';

interface StartPlaybackRequest {
  userId: string;
  movieId: string;
}

interface StartPlaybackResponse {
  sessionId: string;
  streamUrl: string;
  quality: string;
  source: string;
}

export class StartPlaybackUseCase {
  private getBestStream: GetBestStreamUseCase;

  constructor(
    private readonly playbackSessionRepository: PlaybackSessionRepository,
    dfindexerClient: DfindexerClient,
    realDebridClient: RealDebridClient,
    moviesRepository: MoviesRepository,
  ) {
    this.getBestStream = new GetBestStreamUseCase(dfindexerClient, realDebridClient, moviesRepository);
  }

  async execute({ userId, movieId }: StartPlaybackRequest): Promise<StartPlaybackResponse> {
    const { best } = await this.getBestStream.execute(movieId);

    const session = await this.playbackSessionRepository.create({
      userId,
      movieId,
    });

    return {
      sessionId: session.id,
      streamUrl: best.url,
      quality: best.quality,
      source: best.scraperSource,
    };
  }
}
```

- [ ] **Step 7: Update `streaming.factories.ts`**

```typescript
// src/core/use-cases/factories/streaming.factories.ts
import { MediaProgressPrismaRepository } from '@/infrastructure/database/repositories/media-progress.repository';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { PlaybackSessionPrismaRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import { EndPlaybackUseCase } from '../streaming/end-playback.use-case';
import { StartPlaybackUseCase } from '../streaming/start-playback.use-case';
import { UpdateProgressUseCase } from '../streaming/update-progress.use-case';
import { makeDfindexerClient, makeRealDebridClient } from './ranking.factories';

export function makeStartPlayback() {
  return new StartPlaybackUseCase(
    new PlaybackSessionPrismaRepository(),
    makeDfindexerClient(),
    makeRealDebridClient(),
    new MoviesPrismaRepository(),
  );
}

export function makeUpdateProgress() {
  return new UpdateProgressUseCase(
    new PlaybackSessionPrismaRepository(),
    new MediaProgressPrismaRepository(),
  );
}

export function makeEndPlayback() {
  return new EndPlaybackUseCase(new PlaybackSessionPrismaRepository());
}
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors remaining only in `addons.controller.ts`/`addons.routes.ts`/
`addon-registry.repository.ts` (deleted in Task 7) and `stream.entity.ts`'s old
`AddonUnavailableError`/`ResourceNotFoundError` imports in the two aggregate files if any
were left unused — none expected, both files above only import what they use.

- [ ] **Step 9: Commit**

```bash
git add src/core/use-cases/ranking/aggregate-streams.use-case.ts \
        src/core/use-cases/ranking/aggregate-series-streams.use-case.ts \
        src/core/use-cases/ranking/get-best-stream.use-case.ts \
        src/core/use-cases/ranking/get-best-series-stream.use-case.ts \
        src/core/use-cases/factories/ranking.factories.ts \
        src/core/use-cases/factories/streaming.factories.ts \
        src/core/use-cases/streaming/start-playback.use-case.ts
git commit -m "feat: rewire streaming pipeline through dfindexer + Real-Debrid"
```

---

### Task 7: Remove the addon/Stremio layer

**Files:**
- Delete: `src/interfaces/http/controllers/addons.controller.ts`
- Delete: `src/interfaces/http/routes/addons.routes.ts`
- Delete: `src/infrastructure/database/repositories/addon-registry.repository.ts`
- Delete: `prisma/seed.ts`
- Modify: `src/app.ts`
- Modify: `prisma/schema.prisma`
- Modify: `package.json`

**Interfaces:**
- None — this task only removes now-dead code. Everything downstream was already migrated off `AddonRegistry` in Task 6.

- [ ] **Step 1: Delete the addon files**

```bash
rm src/interfaces/http/controllers/addons.controller.ts
rm src/interfaces/http/routes/addons.routes.ts
rm src/infrastructure/database/repositories/addon-registry.repository.ts
rm prisma/seed.ts
```

- [ ] **Step 2: Remove the route registration from `src/app.ts`**

Remove this import line:

```typescript
import { addonsRoutes } from './interfaces/http/routes/addons.routes';
```

Remove this registration line:

```typescript
app.register(addonsRoutes);
```

- [ ] **Step 3: Remove the `AddonRegistry` model from `prisma/schema.prisma`**

Delete the entire `model AddonRegistry { ... }` block.

- [ ] **Step 4: Remove the `seed` script from `package.json`**

Delete this line from `scripts`:

```json
"seed": "tsx prisma/seed.ts",
```

- [ ] **Step 5: Generate and apply the migration**

```bash
npx prisma migrate dev --name drop_addon_registry --schema=./prisma/schema.prisma
```

Expected: migration created under `prisma/migrations/`, applied to the local dev database,
`AddonRegistry` table dropped.

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove Stremio addon layer (Jackett/Torrentio/AddonRegistry)"
```

---

### Task 8: Remove Jackett/Torrentio containers from docker-compose, wire host access for dfindexer

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Remove the Jackett/FlareSolverr services and volume**

Delete the `nb-flix-flaresolverr`, `nb-flix-jackett`, `nb-flix-jackett-stremio` service
blocks and the `jackett-config` volume entry.

- [ ] **Step 2: Give `nb-flix-backend` a route to the host** (so `DFINDEXER_URL=http://host.docker.internal:7006` resolves — the backend runs on the `nbflix-network` bridge, not host networking, so plain `localhost` won't reach dfindexer)

```yaml
  nb-flix-backend:
    build:
      context: .
    ports:
      - 3333:3333
    container_name: "nb-flix-backend"
    environment:
      - REDIS_URL=redis://nb-flix-cache:6379
      - DFINDEXER_URL=http://host.docker.internal:7006
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      nb-flix-database:
        condition: service_healthy
      nb-flix-cache:
        condition: service_healthy
    entrypoint:
      - /bin/sh
      - -c
      - |
        echo "Running Prisma migrations..."
        npx prisma migrate deploy --schema=./prisma/schema.prisma
        echo "Migrations applied. Starting application..."
        exec node dist/server.js
    networks:
      - nbflix-network
```

Resulting file in full:

```yaml
services:
  nb-flix-database:
    image: 'bitnami/postgresql'
    ports:
      - 5433:5432
    environment:
      - POSTGRESQL_USERNAME=docker
      - POSTGRESQL_PASSWORD=docker
      - POSTGRESQL_DATABASE=nbflix
    volumes:
      - postgres-data:/bitnami/postgresql
    networks:
      - nbflix-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U docker -d nbflix"]
      interval: 5s
      timeout: 5s
      retries: 5

  nb-flix-cache:
    image: 'redis:7-alpine'
    ports:
      - 6379:6379
    networks:
      - nbflix-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  nb-flix-backend:
    build:
      context: .
    ports:
      - 3333:3333
    container_name: "nb-flix-backend"
    environment:
      - REDIS_URL=redis://nb-flix-cache:6379
      - DFINDEXER_URL=http://host.docker.internal:7006
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      nb-flix-database:
        condition: service_healthy
      nb-flix-cache:
        condition: service_healthy
    entrypoint:
      - /bin/sh
      - -c
      - |
        echo "Running Prisma migrations..."
        npx prisma migrate deploy --schema=./prisma/schema.prisma # migrate deploy é não-interativo e ideal para produção/startup
        echo "Migrations applied. Starting application..."
        exec node dist/server.js # Inicia sua aplicação Fastify
    networks:
      - nbflix-network

volumes:
  postgres-data:

networks:
  nbflix-network:
    name: nbflix-network
    driver: bridge
    external: true
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: drop Jackett/Torrentio containers, route backend to host dfindexer"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero errors (warnings ok if pre-existing).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/` produced with no errors.

- [ ] **Step 4: Boot the stack and smoke-test a real movie**

```bash
docker compose up -d --build
```

Wait for `nb-flix-backend` healthy, then pick a `tmdbId` already in the local DB (any
movie the frontend has shown before) and hit:

```bash
curl -X POST http://localhost:3333/stream/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid JWT>" \
  -d '{"movieId": "<local movie UUID, not tmdbId>"}'
```

Expected: `200` with `{sessionId, streamUrl, quality, source}` where `source` is one of
`starck|rede|tfilme|comand|bludv`. Then:

```bash
curl -v http://localhost:3333/stream/proxy/<movieId> -H "Range: bytes=0-1000" -o /dev/null
```

Expected: `206 Partial Content` with `Content-Range` header — proxy still range-serving
correctly, now against a Real-Debrid-resolved dfindexer link.

- [ ] **Step 5: Commit** (only if any fixes were needed during verification)

```bash
git add -A
git commit -m "fix: address issues found during dfindexer integration verification"
```
