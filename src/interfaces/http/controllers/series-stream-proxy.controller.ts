import { Readable } from 'node:stream';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { makeGetBestSeriesStream } from '@/core/use-cases/factories/ranking.factories';
import { ResourceNotFoundError, StreamNotFoundError } from '@/shared/errors';

const DMCA_SIZE = 2_119_075;
const MIN_VIDEO_SIZE = 10_000_000;

const TTL_MS = 4 * 60 * 60 * 1000;
const streamUrlCache = new Map<string, { url: string; contentType: string; expiresAt: number }>();

function cacheKey(seriesId: string, season: number, episode: number, lang: 'pt' | 'en'): string {
  return `${seriesId}:${season}:${episode}:${lang}`;
}

function getCached(key: string): { url: string; contentType: string } | null {
  const entry = streamUrlCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { streamUrlCache.delete(key); return null; }
  return { url: entry.url, contentType: entry.contentType };
}

function setCached(key: string, url: string, contentType: string): void {
  streamUrlCache.set(key, { url, contentType, expiresAt: Date.now() + TTL_MS });
}

function detectContentType(bytes: Uint8Array, fallback: string): string {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/x-matroska';
  }
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

async function findBestStream(ranked: { url: string }[]): Promise<{ finalUrl: string; contentType: string } | null> {
  const PARALLEL = 3;
  for (let i = 0; i < ranked.length; i += PARALLEL) {
    const batch = ranked.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(batch.map((s) => probeStream(s.url)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) return r.value;
    }
  }
  return null;
}

export const seriesStreamPrefetch = async (request: FastifyRequest, reply: FastifyReply) => {
  const { seriesId } = request.params as { seriesId: string };
  const query = request.query as { season?: string; episode?: string; lang?: 'pt' | 'en' };
  const season = Number(query.season ?? 1);
  const episode = Number(query.episode ?? 1);
  const lang = query.lang ?? 'pt';
  const key = cacheKey(seriesId, season, episode, lang);

  try {
    if (getCached(key)) return reply.send({ ready: true });

    const { ranked } = await makeGetBestSeriesStream().execute(seriesId, season, episode, lang);
    const result = await findBestStream(ranked);
    if (!result) return reply.status(503).send({ ready: false });

    setCached(key, result.finalUrl, result.contentType);
    return reply.send({ ready: true });
  } catch (err) {
    if (err instanceof StreamNotFoundError || err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ ready: false });
    }
    throw err;
  }
};

export const seriesStreamProxy = async (request: FastifyRequest, reply: FastifyReply) => {
  const { seriesId } = request.params as { seriesId: string };
  const query = request.query as { season?: string; episode?: string; lang?: 'pt' | 'en' };
  const season = Number(query.season ?? 1);
  const episode = Number(query.episode ?? 1);
  const lang = query.lang ?? 'pt';
  const key = cacheKey(seriesId, season, episode, lang);
  const rangeHeader = request.headers.range;

  try {
    let cached = getCached(key);

    if (!cached) {
      const { ranked } = await makeGetBestSeriesStream().execute(seriesId, season, episode, lang);
      const result = await findBestStream(ranked);
      if (result) {
        setCached(key, result.finalUrl, result.contentType);
        cached = { url: result.finalUrl, contentType: result.contentType };
      }
      if (!cached) {
        return reply.status(503).send({ error: 'No working stream found for this episode.' });
      }
    }

    let upstream = await openStream(cached.url, rangeHeader);

    if (!upstream) {
      streamUrlCache.delete(key);
      const { ranked } = await makeGetBestSeriesStream().execute(seriesId, season, episode, lang);
      const result = await findBestStream(ranked);
      if (!result) return reply.status(503).send({ error: 'No working stream found for this episode.' });
      setCached(key, result.finalUrl, result.contentType);
      cached = { url: result.finalUrl, contentType: result.contentType };
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

    reply.code(status).type(contentType);
    reply.header('Accept-Ranges', acceptRanges ?? 'bytes');
    if (contentLength) reply.header('Content-Length', contentLength);
    if (contentRange) reply.header('Content-Range', contentRange);

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
      return reply.status(404).send({ error: (err as Error).message });
    }
    throw err;
  }
};
