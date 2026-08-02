import type { ResolvedMagnet } from '@/infrastructure/debrid/debrid-resolver';

// Resolving all 20 ranked candidates via Promise.allSettled waits for the SLOWEST one
// (cold TorBox magnets can poll for ~12s before falling back to RD) even though the
// caller only needs a handful of working streams to hand to the prober. Resolving in
// small batches and stopping once we have enough successes bounds latency to the
// worst case of the first batch that clears the threshold, not all 20.
const BATCH_SIZE = 6;
const MIN_RESOLVED_TO_STOP = 5;

export async function resolveBatched<C>(
  candidates: C[],
  resolveFn: (candidate: C) => Promise<ResolvedMagnet | null>,
): Promise<{ candidate: C; resolved: ResolvedMagnet }[]> {
  const results: { candidate: C; resolved: ResolvedMagnet }[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(resolveFn));
    settled.forEach((result, j) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push({ candidate: batch[j], resolved: result.value });
      }
    });
    if (results.length >= MIN_RESOLVED_TO_STOP) break;
  }

  return results;
}
