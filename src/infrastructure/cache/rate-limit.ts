import { redis } from './redis';

const WINDOW_SECONDS = 3600;

function key(userId: string): string {
  return `rate:${userId}`;
}

export async function incrementRateLimit(userId: string): Promise<number> {
  const count = await redis.incr(key(userId));
  if (count === 1) {
    await redis.expire(key(userId), WINDOW_SECONDS);
  }
  return count;
}

export async function getRateLimitCount(userId: string): Promise<number> {
  const raw = await redis.get(key(userId));
  return raw ? parseInt(raw, 10) : 0;
}
