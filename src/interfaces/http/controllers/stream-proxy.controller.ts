import { Readable } from 'node:stream';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { makeGetBestStream } from '@/core/use-cases/factories/ranking.factories';
import { ResourceNotFoundError, StreamNotFoundError } from '@/shared/errors';

const DMCA_SIZE = 2_119_075; // RD's exact DMCA placeholder size in bytes
const MIN_VIDEO_SIZE = 10_000_000; // 10 MB minimum for a real video file

// In-process cache: movieId → resolved RD URL + detected content-type.
// Stores the FINAL redirect target so probe and serve always hit the same file.
// TTL: 4 hours (RD unrestricted links expire, so we don't cache indefinitely).
const TTL_MS = 4 * 60 * 60 * 1000;

interface CacheEntry {
  url: string;
  contentType: string;
  expiresAt: number;
  audio?: string;
  codec?: string;
  language?: string;
  container?: string;
}

const streamUrlCache = new Map<string, CacheEntry>();

// Deduplicates concurrent discovery for the same key — all waiters share one probe run.
const inFlight = new Map<string, Promise<{ finalUrl: string; contentType: string; stream: { url: string; audio?: string; codec?: string; language?: string; container?: string } } | null>>();

function getCached(movieId: string): CacheEntry | null {
  const entry = streamUrlCache.get(movieId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { streamUrlCache.delete(movieId); return null; }
  return entry;
}

function setCached(movieId: string, url: string, contentType: string, meta?: { audio?: string; codec?: string; language?: string; container?: string }): void {
  streamUrlCache.set(movieId, { url, contentType, expiresAt: Date.now() + TTL_MS, ...meta });
}

function detectContentType(bytes: Uint8Array, fallback: string): string {
  // MKV/WebM: EBML header 1a 45 df a3
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/x-matroska';
  }
  // MP4: 'ftyp' at offset 4
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'video/mp4';
  }
  return fallback.includes('application/force-download') ? 'video/mp4' : fallback;
}

function extractTotalSize(res: Response): number | null {
  const contentRange = res.headers.get('content-range');
  if (contentRange) {
    const match = /\/(\d+)$/.exec(contentRange);
    if (match) return Number.parseInt(match[1], 10);
  }
  const contentLength = res.headers.get('content-length');
  if (contentLength) return Number.parseInt(contentLength, 10);
  return null;
}

// Probe fetches 12 bytes from the stream URL, follows all redirects,
// and returns { finalUrl: the resolved RD URL, contentType: detected format }.
// Caching finalUrl ensures probe and serve never diverge.
async function probeStream(url: string): Promise<{ finalUrl: string; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-11' },
      redirect: 'follow',
    });

    if (!res.ok) { await res.body?.cancel(); return null; }

    const serverContentType = res.headers.get('content-type') ?? '';
    if (serverContentType.includes('text/html') || serverContentType.includes('text/plain')) {
      await res.body?.cancel();
      return null;
    }

    const totalSize = extractTotalSize(res);
    if (totalSize !== null && (totalSize === DMCA_SIZE || totalSize < MIN_VIDEO_SIZE)) {
      await res.body?.cancel();
      return null;
    }

    const buf = await res.arrayBuffer();
    const contentType = detectContentType(new Uint8Array(buf), serverContentType);

    // res.url is the final URL after following all redirects — use this for serving
    return { finalUrl: res.url || url, contentType };
  } catch {
    return null;
  }
}

async function openStream(url: string, rangeHeader?: string): Promise<Response | null> {
  const range = rangeHeader ?? 'bytes=0-';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Range': range },
  });
  return res.ok ? res : null;
}

// Probe top N streams in parallel; return first success.
async function findBestStream(ranked: { url: string; audio?: string; codec?: string; language?: string; container?: string }[]): Promise<{ finalUrl: string; contentType: string; stream: typeof ranked[0] } | null> {
  const PARALLEL = 3;
  for (let i = 0; i < ranked.length; i += PARALLEL) {
    const batch = ranked.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(batch.map((s) => probeStream(s.url)));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value) return { ...r.value, stream: batch[j] };
    }
  }
  return null;
}

async function discoverAndCache(movieId: string, lang: 'pt' | 'en'): Promise<{ finalUrl: string; contentType: string; stream: { url: string; audio?: string; codec?: string; language?: string; container?: string } } | null> {
  const cKey = `${movieId}:${lang}`;
  const existing = inFlight.get(cKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { ranked } = await makeGetBestStream().execute(movieId, lang);
      const result = await findBestStream(ranked);
      if (result) {
        const meta = { audio: result.stream.audio, codec: result.stream.codec, language: result.stream.language, container: result.stream.container };
        setCached(cKey, result.finalUrl, result.contentType, meta);
      }
      return result;
    } finally {
      inFlight.delete(cKey);
    }
  })();

  inFlight.set(cKey, promise);
  return promise;
}

export const streamPrefetch = async (request: FastifyRequest, reply: FastifyReply) => {
  const { movieId } = request.params as { movieId: string };
  const { lang = 'pt' } = request.query as { lang?: 'pt' | 'en' };
  const cKey = `${movieId}:${lang}`;
  try {
    if (getCached(cKey)) return reply.send({ ready: true });
    const result = await discoverAndCache(movieId, lang);
    if (!result) return reply.status(503).send({ ready: false });
    console.log(`[prefetch] movie=${movieId} lang=${lang} audio=${result.stream.audio} codec=${result.stream.codec} container=${result.stream.container}`);
    return reply.send({ ready: true });
  } catch (err) {
    if (err instanceof StreamNotFoundError || err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ ready: false });
    }
    throw err;
  }
};

export const streamProxy = async (request: FastifyRequest, reply: FastifyReply) => {
  const { movieId } = request.params as { movieId: string };
  const { lang = 'pt' } = request.query as { lang?: 'pt' | 'en' };
  const cKey = `${movieId}:${lang}`;
  const rangeHeader = request.headers.range;

  try {
    let cached = getCached(cKey);
    console.log(`[proxy] movie=${movieId} lang=${lang} range=${rangeHeader ?? 'none'} cacheHit=${!!cached}`);

    if (!cached) {
      const result = await discoverAndCache(movieId, lang);
      if (!result) return reply.status(503).send({ error: 'No working stream found for this movie.' });
      console.log(`[stream] movie=${movieId} lang=${lang} audio=${result.stream.audio} codec=${result.stream.codec} container=${result.stream.container} url=${result.finalUrl.slice(0, 80)}`);
      cached = getCached(cKey)!;
    }

    let upstream = await openStream(cached.url, rangeHeader);

    // Cached RD URL expired — re-probe and get fresh resolved URL
    if (!upstream) {
      streamUrlCache.delete(cKey);
      const result = await discoverAndCache(movieId, lang);
      if (!result) return reply.status(503).send({ error: 'No working stream found for this movie.' });
      console.log(`[stream:refresh] movie=${movieId} lang=${lang} url=${result.finalUrl.slice(0, 80)}`);
      cached = getCached(cKey)!;
      upstream = await openStream(cached.url, rangeHeader);
    }

    if (!upstream) {
      return reply.status(502).send({ error: 'Stream became unavailable.' });
    }

    const contentType = cached.contentType;
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');

    const status = upstream.status === 206 ? 206 : 200;

    // Use Fastify's reply pipeline so @fastify/cors onSend hook fires and sets CORS headers
    reply.code(status).type(contentType);
    reply.header('Accept-Ranges', acceptRanges ?? 'bytes');
    if (contentLength) reply.header('Content-Length', contentLength);
    if (contentRange) reply.header('Content-Range', contentRange);
    reply.header('X-Stream-Audio', cached.audio ?? 'unknown');
    reply.header('X-Stream-Codec', cached.codec ?? 'unknown');
    reply.header('X-Stream-Language', cached.language ?? 'unknown');
    reply.header('X-Stream-Container', cached.container ?? 'unknown');

    if (!upstream.body) {
      return reply.status(502).send({ error: 'No stream body from source' });
    }

    const nodeStream = Readable.fromWeb(
      upstream.body as Parameters<typeof Readable.fromWeb>[0],
    );

    request.socket.once('close', () => nodeStream.destroy());

    return reply.send(nodeStream);
  } catch (err) {
    if (err instanceof StreamNotFoundError || err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: err.message });
    }
    throw err;
  }
};
