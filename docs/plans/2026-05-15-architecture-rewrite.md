# Architecture Rewrite — DDD + OTT Orchestrator

**Branch:** `feat/architecture-rewrite`  
**Goal:** Replace flat structure with DDD modular monolith per `docs/architeture/new-architeture-and-demands.md`. Keep all existing features (auth, movies, watchlist, favorites) + add streaming pipeline, ranking, addon aggregation, Redis cache, Google Drive storage, and janitor/expurge logic.

---

## Current State (what exists)

| Layer | Files |
|---|---|
| Controllers | `auth`, `movies`, `users`, `watchList` |
| Use-cases | `createUser`, `authenticate`, `getUser`, `createMovie`, `createWatchList`, `deleteWatchList`, `getAllWatchLists` |
| Repositories | Prisma: users, movies, watchList — In-memory: same |
| DB Schema | `User`, `Movie`, `Favorite`, `Watchlist` |
| Infra | Fastify + Prisma + PostgreSQL only (no Redis) |

---

## Target Folder Structure

```
src/
├── @types/
├── core/
│   ├── entities/           # Movie, User, Stream
│   ├── value-objects/      # StreamMetadata (resolution, codec, bitrate)
│   ├── aggregates/         # PlaybackSession
│   └── use-cases/
│       ├── catalog/        # createMovie, getMovie, watchlist, favorites
│       ├── auth/           # createUser, authenticate, getUser
│       ├── ranking/        # executeRanking, aggregateStreams
│       └── streaming/      # processVideo, createPlaybackSession
├── infrastructure/
│   ├── database/
│   │   ├── prisma.ts
│   │   └── repositories/   # all Prisma repos
│   ├── cache/
│   │   ├── redis.ts
│   │   └── stream-cache.ts
│   ├── storage/
│   │   ├── google-drive.adapter.ts
│   │   └── local-ssd.adapter.ts
│   └── video/
│       └── ffmpeg.wrapper.ts
├── interfaces/
│   ├── http/
│   │   ├── controllers/
│   │   └── routes/
│   └── workers/
│       └── janitor.worker.ts
└── shared/
    ├── errors/
    └── utils/
```

---

## New DB Schema (full redesign)

Keep: `User`, `Movie`, `Favorite`, `Watchlist`  
Add:
- `AddonRegistry` — Stremio addon URLs + status
- `MediaProgress` — "Continue Watching" per user/movie
- `FileMetadata` — Google Drive paths + HLS chunk metadata

---

## Phases

### PHASE 0 — Git Setup
- [ ] Create branch: `git checkout -b feat/architecture-rewrite`
- [ ] Commit checkpoint after each phase

---

### PHASE 1 — Folder Structure (scaffold only, no logic yet)
Create empty dirs + index files for new structure. No deletes yet.

- [ ] Create `src/core/entities/`
- [ ] Create `src/core/value-objects/`
- [ ] Create `src/core/aggregates/`
- [ ] Create `src/core/use-cases/catalog/`, `auth/`, `ranking/`, `streaming/`
- [ ] Create `src/infrastructure/database/repositories/`
- [ ] Create `src/infrastructure/cache/`
- [ ] Create `src/infrastructure/storage/`
- [ ] Create `src/infrastructure/video/`
- [ ] Create `src/interfaces/http/controllers/`, `routes/`
- [ ] Create `src/interfaces/workers/`
- [ ] Create `src/shared/errors/`, `utils/`
- [ ] Commit: `chore: scaffold DDD folder structure`

---

### PHASE 2 — Prisma Schema Redesign
Full schema rewrite. Keep existing models + add new ones.

**Models to keep (with updates):**
- `User` — add `preferences Json?`
- `Movie` — keep as-is
- `Favorite` — keep as-is
- `Watchlist` — keep as-is

**Models to add:**
```prisma
model AddonRegistry {
  id        String   @id @default(uuid())
  name      String
  url       String   @unique
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model MediaProgress {
  id           String   @id @default(uuid())
  userId       String
  movieId      String
  progressSecs Int      @default(0)
  updatedAt    DateTime @updatedAt

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie Movie @relation(fields: [movieId], references: [id], onDelete: Cascade)

  @@unique([userId, movieId])
}

model FileMetadata {
  id            String   @id @default(uuid())
  movieId       String
  driveFileId   String?
  localPath     String?
  hlsPlaylist   String?
  status        String   @default("pending")
  lastAccessed  DateTime @default(now())
  createdAt     DateTime @default(now())

  movie Movie @relation(fields: [movieId], references: [id], onDelete: Cascade)
}
```

- [ ] Rewrite `prisma/schema.prisma`
- [ ] Run `npx prisma migrate dev --name redesign-schema`
- [ ] Commit: `feat(db): redesign schema with AddonRegistry, MediaProgress, FileMetadata`

---

### PHASE 3 — Shared Layer (errors + utils)
Migrate existing errors + add new ones.

- [ ] Move all `src/use-cases/errors/*.ts` → `src/shared/errors/`
- [ ] Keep: `userAlreadyExists`, `invalidCredentials`, `resourceNotFound`, `resourceAlreadyExists`
- [ ] Add: `streamNotFound`, `transcodingFailed`, `addonUnavailable`
- [ ] Commit: `refactor(shared): migrate errors to shared layer`

---

### PHASE 4 — Core Entities & Value Objects

**Entities:**
- `src/core/entities/user.entity.ts` — id, email, name, password, preferences
- `src/core/entities/movie.entity.ts` — id, tmdbId, title, overview, posterPath, voteAverage
- `src/core/entities/stream.entity.ts` — id, movieId, url, quality, codec, bitrate, source (addon name)

**Value Objects:**
- `src/core/value-objects/stream-metadata.vo.ts` — resolution (4K/1080p/720p), codec (h264/hevc), bitrate (number)

**Aggregates:**
- `src/core/aggregates/playback-session.aggregate.ts` — userId, movieId, streamId, progressSecs, status (active/paused/ended), startedAt

- [ ] Create entity files with TypeScript interfaces/classes
- [ ] Create value object files
- [ ] Create aggregate file
- [ ] Commit: `feat(core): add entities, value objects, and PlaybackSession aggregate`

---

### PHASE 5 — Infrastructure: Database (repositories)
Move + adapt Prisma repos to new location.

- [ ] Move `src/lib/prisma.ts` → `src/infrastructure/database/prisma.ts`
- [ ] Move `src/repositories/prisma/users.repository.prisma.ts` → `src/infrastructure/database/repositories/users.repository.ts`
- [ ] Move `src/repositories/prisma/movies.repository.prisma.ts` → `src/infrastructure/database/repositories/movies.repository.ts`
- [ ] Move `src/repositories/prisma/watchList.repository.prisma.ts` → `src/infrastructure/database/repositories/watchlist.repository.ts`
- [ ] Create `src/infrastructure/database/repositories/addon-registry.repository.ts`
- [ ] Create `src/infrastructure/database/repositories/media-progress.repository.ts`
- [ ] Create `src/infrastructure/database/repositories/file-metadata.repository.ts`
- [ ] Update all import paths
- [ ] Commit: `refactor(infra): move repositories to infrastructure/database`

---

### PHASE 6 — Infrastructure: Redis Cache
Add Redis dependency + implement cache adapters.

- [ ] `npm install ioredis @types/ioredis`
- [ ] Create `src/infrastructure/cache/redis.ts` — IORedis client singleton
- [ ] Create `src/infrastructure/cache/stream-cache.ts` — `get(movieId)`, `set(movieId, streams, ttlSeconds=3600)`, `del(movieId)`
- [ ] Create `src/infrastructure/cache/rate-limit.ts` — `increment(userId)`, `get(userId)`, TTL-based
- [ ] Add Redis service to `docker-compose.yml`
- [ ] Add `REDIS_URL` to env
- [ ] Commit: `feat(infra): add Redis cache (stream cache + rate limiting)`

---

### PHASE 7 — Infrastructure: Storage Adapters

- [ ] Create `src/infrastructure/storage/local-ssd.adapter.ts`
  - `saveChunk(filePath, buffer)`, `deleteChunk(filePath)`, `getDiskUsagePercent()`
- [ ] Create `src/infrastructure/storage/google-drive.adapter.ts`
  - `upload(filePath, fileName)`, `download(fileId, destPath)`, `delete(fileId)`
  - Uses Google Drive API (googleapis package)
- [ ] `npm install googleapis`
- [ ] Commit: `feat(infra): add LocalSSD and GoogleDrive storage adapters`

---

### PHASE 8 — Infrastructure: FFmpeg Wrapper

- [ ] `npm install fluent-ffmpeg @types/fluent-ffmpeg`
- [ ] Create `src/infrastructure/video/ffmpeg.wrapper.ts`
  - `transcode(inputPath, outputDir, options)` — uses `h264_nvenc` encoder
  - `generateHLS(inputPath, outputDir)` — outputs `.m3u8` + `.ts` chunks
  - `getMetadata(filePath)` — returns codec, duration, resolution
- [ ] Commit: `feat(infra): add FFmpeg wrapper with NVENC support`

---

### PHASE 9 — Core Use-Cases: Auth & Catalog
Migrate existing use-cases to new location.

- [ ] Move `createUsersUseCase.ts` → `src/core/use-cases/auth/create-user.use-case.ts`
- [ ] Move `authenticate.ts` → `src/core/use-cases/auth/authenticate.use-case.ts`
- [ ] Move `getUser.ts` → `src/core/use-cases/auth/get-user.use-case.ts`
- [ ] Move `create-movie-use-case.ts` → `src/core/use-cases/catalog/create-movie.use-case.ts`
- [ ] Move watchlist use-cases → `src/core/use-cases/catalog/`
- [ ] Update all factory files under `src/core/use-cases/factories/`
- [ ] Commit: `refactor(core): migrate auth + catalog use-cases to DDD structure`

---

### PHASE 10 — Core Use-Cases: Ranking (Aggregator)
New feature — Stremio addon HTTP aggregation + stream scoring.

- [ ] Create `src/core/use-cases/ranking/aggregate-streams.use-case.ts`
  - Fetches streams from all active `AddonRegistry` entries via HTTP
  - Each addon returns `[{ url, quality, codec, seeds }]`
  - Calls score calculator
- [ ] Create `src/core/use-cases/ranking/calculate-stream-score.use-case.ts`
  - Score formula: `quality(40%) + seedCount(30%) + codec(20%) + latency(10%)`
  - Returns sorted stream list
- [ ] Create `src/core/use-cases/ranking/get-best-stream.use-case.ts`
  - Checks Redis stream cache first
  - Falls back to aggregator + ranker
  - Caches result for 1 hour
- [ ] Commit: `feat(ranking): implement Stremio addon aggregation and stream scoring`

---

### PHASE 11 — Core Use-Cases: Streaming + Playback

- [ ] Create `src/core/use-cases/streaming/start-playback.use-case.ts`
  - Creates `PlaybackSession` in DB
  - Triggers download from Google Drive (or checks local SSD)
  - Starts FFmpeg HLS transcoding
  - Returns `.m3u8` URL
- [ ] Create `src/core/use-cases/streaming/update-progress.use-case.ts`
  - Updates `MediaProgress` for user/movie
- [ ] Create `src/core/use-cases/streaming/end-playback.use-case.ts`
  - Marks session as ended
  - Schedules chunk cleanup via janitor
- [ ] Commit: `feat(streaming): implement playback session lifecycle`

---

### PHASE 12 — Janitor Worker (Expurge Logic)

- [ ] Create `src/interfaces/workers/janitor.worker.ts`
  - On interval: check SSD disk usage
  - If > 80%: find LRU movie (via `FileMetadata.lastAccessed`), delete its chunks, update DB
  - Marks `FileMetadata` entries where session ended > 24h as expired, deletes files
- [ ] Commit: `feat(workers): implement LRU janitor with disk threshold`

---

### PHASE 13 — Interfaces: HTTP Controllers + Routes
Move + add controllers.

- [ ] Move existing controllers to `src/interfaces/http/controllers/`
  - `auth.controller.ts`, `movies.controller.ts`, `users.controller.ts`, `watchlist.controller.ts`
- [ ] Add new controllers:
  - `streaming.controller.ts` — `POST /stream/start`, `PATCH /stream/progress`, `POST /stream/end`
  - `addons.controller.ts` — `GET /addons`, `POST /addons`, `DELETE /addons/:id`
- [ ] Consolidate routes into `src/interfaces/http/routes/`
  - `auth.routes.ts`, `catalog.routes.ts`, `streaming.routes.ts`, `addons.routes.ts`
- [ ] Commit: `refactor(interfaces): migrate controllers + add streaming and addon routes`

---

### PHASE 14 — Docker Compose Update

- [ ] Add Redis service to `docker-compose.yml`
- [ ] Add env vars: `REDIS_URL`, `GOOGLE_DRIVE_CREDENTIALS`, `JWT_SECRET`
- [ ] Commit: `chore(docker): add Redis service and env vars`

---

### PHASE 15 — Cleanup: Delete Old Structure
**Only after all phases above verified working.**

- [ ] Delete `src/repositories/` (old flat repos)
- [ ] Delete `src/use-cases/` (old flat use-cases)
- [ ] Delete `src/http/` (old flat controllers)
- [ ] Delete `src/lib/` (moved to infra)
- [ ] Delete leftover error files outside `shared/`
- [ ] Commit: `chore: remove legacy flat structure`

---

### PHASE 16 — Tests Migration

- [ ] Move test files (`*.spec.ts`) to mirror new structure
- [ ] Update imports in all test files
- [ ] Add in-memory repos for new contexts (ranking, streaming)
- [ ] `npm test` — all green
- [ ] Commit: `test: migrate and fix all tests for new structure`

---

## Status Tracking

| Phase | Status |
|---|---|
| 0 — Git Setup | ⬜ |
| 1 — Folder Scaffold | ⬜ |
| 2 — Prisma Redesign | ⬜ |
| 3 — Shared Errors | ⬜ |
| 4 — Core Entities | ⬜ |
| 5 — DB Repositories | ⬜ |
| 6 — Redis Cache | ⬜ |
| 7 — Storage Adapters | ⬜ |
| 8 — FFmpeg Wrapper | ⬜ |
| 9 — Auth + Catalog Use-Cases | ⬜ |
| 10 — Ranking Use-Cases | ⬜ |
| 11 — Streaming Use-Cases | ⬜ |
| 12 — Janitor Worker | ⬜ |
| 13 — HTTP Controllers | ⬜ |
| 14 — Docker Compose | ⬜ |
| 15 — Delete Old Structure | ⬜ |
| 16 — Tests | ⬜ |

---

## New Dependencies Needed

```bash
npm install ioredis googleapis fluent-ffmpeg
npm install -D @types/fluent-ffmpeg
```

## Notes

- Redis TTL: stream cache = 1h, rate limit window = 1h
- FFmpeg encoder: `h264_nvenc` (RTX 3060) — fallback to `libx264` if no GPU
- Disk threshold: 80% triggers LRU expurge
- Chunk TTL: inactive sessions → delete after 24h
- Score formula: `quality(40%) + seeds(30%) + codec(20%) + latency(10%)`
