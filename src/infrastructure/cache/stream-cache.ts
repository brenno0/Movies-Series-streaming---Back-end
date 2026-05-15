import type { StreamEntity } from '@/core/entities/stream.entity';

import { redis } from './redis';

const STREAM_TTL_SECONDS = 3600;

function key(movieId: string): string {
  return `streams:${movieId}`;
}

export async function getStreamCache(movieId: string): Promise<StreamEntity[] | null> {
  const raw = await redis.get(key(movieId));
  if (!raw) return null;
  return JSON.parse(raw) as StreamEntity[];
}

export async function setStreamCache(movieId: string, streams: StreamEntity[]): Promise<void> {
  await redis.set(key(movieId), JSON.stringify(streams), 'EX', STREAM_TTL_SECONDS);
}

export async function deleteStreamCache(movieId: string): Promise<void> {
  await redis.del(key(movieId));
}
