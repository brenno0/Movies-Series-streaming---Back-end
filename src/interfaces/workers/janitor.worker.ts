import { FileMetadataPrismaRepository } from '@/infrastructure/database/repositories/file-metadata.repository';
import { deleteDirectory, getDiskUsagePercent, hlsOutputPath } from '@/infrastructure/storage/local-ssd.adapter';
import { env } from '@/env';

const INACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5min

const fileMetaRepo = new FileMetadataPrismaRepository();

async function evictLRU(): Promise<void> {
  const lru = await fileMetaRepo.findLRU();
  if (!lru) return;

  const outputDir = hlsOutputPath(lru.movieId);
  await deleteDirectory(outputDir);
  await fileMetaRepo.deleteById(lru.id);

  console.log(`[janitor] evicted LRU movie ${lru.movieId}`);
}

async function evictExpiredSessions(): Promise<void> {
  const expired = await fileMetaRepo.findExpiredSessions(INACTIVE_SESSION_TTL_MS);
  for (const meta of expired) {
    const outputDir = hlsOutputPath(meta.movieId);
    await deleteDirectory(outputDir);
    await fileMetaRepo.deleteById(meta.id);
    console.log(`[janitor] evicted expired session for movie ${meta.movieId}`);
  }
}

async function runCycle(): Promise<void> {
  try {
    await evictExpiredSessions();

    const usagePercent = await getDiskUsagePercent();
    if (usagePercent >= env.DISK_THRESHOLD_PERCENT) {
      console.log(`[janitor] disk at ${usagePercent}% — running LRU eviction`);
      while ((await getDiskUsagePercent()) >= env.DISK_THRESHOLD_PERCENT) {
        await evictLRU();
      }
    }
  } catch (err) {
    console.error('[janitor] cycle error:', err);
  }
}

export function startJanitor(): NodeJS.Timeout {
  console.log('[janitor] started');
  runCycle();
  return setInterval(runCycle, CHECK_INTERVAL_MS);
}
