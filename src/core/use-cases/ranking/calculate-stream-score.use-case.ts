import type { StreamEntity } from '@/core/entities/stream.entity';
import { codecScore, resolutionScore } from '@/core/value-objects/stream-metadata.vo';

const WEIGHTS = {
  quality: 0.4,
  seeds: 0.3,
  codec: 0.2,
  latency: 0.1,
};

const MAX_SEEDS = 1000;
const MAX_LATENCY_MS = 5000;

export function calculateScore(stream: StreamEntity, latencyMs = 0): number {
  const qualityNorm = resolutionScore(stream.quality) / 4;
  const seedsNorm = Math.min(stream.seeds / MAX_SEEDS, 1);
  const codecNorm = codecScore(stream.codec) / 3;
  const latencyNorm = 1 - Math.min(latencyMs / MAX_LATENCY_MS, 1);

  return (
    qualityNorm * WEIGHTS.quality +
    seedsNorm * WEIGHTS.seeds +
    codecNorm * WEIGHTS.codec +
    latencyNorm * WEIGHTS.latency
  );
}

export function rankStreams(streams: StreamEntity[]): StreamEntity[] {
  return streams
    .map((s) => ({ ...s, score: calculateScore(s) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
