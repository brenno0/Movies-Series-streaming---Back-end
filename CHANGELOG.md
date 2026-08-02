# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [3.4.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v3.3.1...v3.4.0) (2026-08-02)


### Features

* add dfindexer query builder and release-metadata parsing ([500721c](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/500721c2984d8788f4cad3a6c2faf77c50a64b9c))
* add DFINDEXER_URL env var ([ba8001d](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/ba8001ddc87ce0bc4b90afeb299f18e5a57dbe40))
* add DfindexerClient for parallel multi-scraper torrent search ([418c2a4](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/418c2a4ac944b6a0e71f8b054afd03bca621111d))
* add RealDebridClient to resolve magnets into direct download links ([2c8a5e2](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/2c8a5e2f174c95ae764f366959e1d63dfc4b7f09))
* add TorBox as primary debrid provider, Real-Debrid as fallback ([fefcb30](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/fefcb30c725f3d42a10e194f6e2b0137e02d580f))
* allow filtering resolved streams by scraper source ([d9d3e20](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/d9d3e20f207d62ad1a19555602e3264c0da42c11))
* expose ?source= query param and active scraper source on stream endpoints ([a39cc07](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/a39cc079509f1fbd450dfaff4927300f4d074e99))
* rewire streaming pipeline through dfindexer + Real-Debrid ([bb8c6f2](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/bb8c6f2c28966297c98dea80679a6d70aba29168))
* rework StreamEntity and scoring for dfindexer candidates ([ecf2516](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/ecf2516214cc8dcedb2b11dce7b6f3c37f38fed9))


### Bug Fixes

* harden Real-Debrid resolution and disambiguate dfindexer matches by IMDB id ([c0e7c83](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/c0e7c83cb0e7660751d602e88a660ea3f4dd1eea))
* keep non-IMDB-matched candidates as fallback, widen resolve pool to 20 ([c4c4499](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/c4c44999aa3c6f5d2b4d6c1cd7f3f88a3a067b9e))
* verify TorBox endpoints live, shorten poll budget for cold magnets ([8e341ce](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/8e341ce7b00aeb17c42175b5dd6bdea117c785ab))

### [3.3.1](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v3.3.0...v3.3.1) (2026-05-17)

## [3.3.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v3.2.0...v3.3.0) (2026-05-16)


### Features

* **streaming:** add stream proxy endpoint for browser-compatible video playback ([e37b6a0](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/e37b6a097261b9a8c0f6a89e00f5db62f999681a))

## [3.2.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v3.1.0...v3.2.0) (2026-05-16)


### Features

* **streaming:** replace FFmpeg/Drive pipeline with Real-Debrid direct stream via Torrentio ([c6a35a9](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/c6a35a9ac7ab74ce48236c5c3f85aee420de44c0))

## [3.1.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.3.1...v3.1.0) (2026-05-16)


### Features

* **catalog:** add imdbId field to Movie for Stremio addon protocol ([37e754d](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/37e754d04d851aa96b3c5ad0684ecb6d1aea8d32))
* **db:** add Prisma seed with Torrentio and Cinemeta addon registry entries ([6f210ac](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/6f210ace1a21879099a8df804e250365080955f6))

### [2.3.1](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.3.0...v2.3.1) (2026-05-16)

## [2.3.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.2.3...v2.3.0) (2026-05-16)


### Features

* **core:** add entities (User, Movie, Stream), StreamMetadata value object, and PlaybackSession aggregate ([fd95bce](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/fd95bce6a4461ea3ccca592908ca3f4e96d88d4b))
* **db:** redesign schema with AddonRegistry, MediaProgress, FileMetadata, PlaybackSession ([f497613](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/f4976131126a0d46d046c258567da51a2b4c0982))
* **infra:** add FFmpeg wrapper with NVENC support and libx264 fallback ([f85aade](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/f85aadeac9cf74bd078755b7e8a6f797e7480053))
* **infra:** add LocalSSD and GoogleDrive storage adapters ([b9ff3ee](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/b9ff3ee60173d3a6dbb4c2961498f53c98ab5175))
* **infra:** add Redis cache layer with stream cache and rate limiting ([aa9b84a](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/aa9b84a7dd6ab95d3d387e361473c26696c01cde))
* **ranking:** implement Stremio addon aggregation, stream scoring, and best-stream selection with Redis cache ([5581833](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/5581833de9fd6344527b7e23f5efa828960f99cf))
* **streaming:** implement playback session lifecycle (start, update progress, end) ([895f009](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/895f0097d3f37482db6f8e17e11092640a8e7224))
* **workers:** implement LRU janitor with disk threshold and 24h TTL eviction ([0b9e820](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/0b9e8203ad1aa10ea1682fe9a24ec4bf6af7d000))

### [2.2.3](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.2.0...v2.2.3) (2026-05-15)

### [2.2.2](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.2.1...v2.2.2) (2025-08-19)

### [2.2.1](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.2.0...v2.2.1) (2025-08-19)

## [2.2.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.1.4...v2.2.0) (2025-08-19)


### Features

* creating routes and documentations ([c6a8746](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/c6a87465c817ad8893b1062a3bb1b65ccaff5f9a))

### [2.1.4](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.1.3...v2.1.4) (2025-08-19)

### [2.1.3](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.1.2...v2.1.3) (2025-08-19)

### [2.1.2](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.1.1...v2.1.2) (2025-08-19)

### [2.1.1](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.1.0...v2.1.1) (2025-08-19)

## [2.1.0](https://github.com/brenno0/Movies-Series-streaming---Back-end/compare/v2.0.0...v2.1.0) (2025-08-19)


### Features

* adding standard-version to the project ([1100c55](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/1100c55737fc2e1e2b7ce52d69aaa4024cc0db44))

## 2.0.0 (2025-08-19)


### ⚠ BREAKING CHANGES

* Upload of almost 80% of the entire project

### Features

* uploading project in github ([6065e51](https://github.com/brenno0/Movies-Series-streaming---Back-end/commit/6065e51567a3957832ce036800b4e9df3ccde443))
