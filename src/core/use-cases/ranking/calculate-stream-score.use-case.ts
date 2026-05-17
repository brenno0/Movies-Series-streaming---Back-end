import type { StreamEntity } from '@/core/entities/stream.entity';
import { resolutionScore } from '@/core/value-objects/stream-metadata.vo';

const WEIGHTS = {
  quality: 0.35,
  seeds: 0.25,
  compat: 0.25,
  language: 0.05, // only differentiates multi vs unknown within the same language tier
  latency: 0.10,
};

const MAX_SEEDS = 1000;
const MAX_LATENCY_MS = 5000;

function languageScore(stream: StreamEntity): number {
  if (stream.language === 'pt') return 1.0;
  if (stream.language === 'multi') return 0.8;
  if (stream.language === 'en') return 0.6;
  return 0.3; // unknown (assume EN)
}

// Higher = more browser-compatible (video codec + container + audio codec)
function compatScore(stream: StreamEntity): number {
  const isH264 = stream.codec === 'h264';
  const isAAC = stream.audio === 'aac';
  let score = 0;
  // Video/container (0–0.6)
  if (stream.container === 'mp4' && isH264) score += 0.6;
  else if (stream.container === 'mp4') score += 0.35;
  else if (stream.container === 'mkv' && isH264) score += 0.4;
  else score += 0.2;
  // Audio (0–0.4): AAC plays on all Linux browsers; unknown = maybe ok; ac3/dts already filtered
  score += isAAC ? 0.4 : 0.2;
  return score;
}

export function calculateScore(stream: StreamEntity, latencyMs = 0): number {
  const qualityNorm = resolutionScore(stream.quality) / 4;
  const seedsNorm = Math.min(stream.seeds / MAX_SEEDS, 1);
  const latencyNorm = 1 - Math.min(latencyMs / MAX_LATENCY_MS, 1);

  return (
    qualityNorm * WEIGHTS.quality +
    seedsNorm * WEIGHTS.seeds +
    compatScore(stream) * WEIGHTS.compat +
    languageScore(stream) * WEIGHTS.language +
    latencyNorm * WEIGHTS.latency
  );
}

export function rankStreams(streams: StreamEntity[], preferLang: 'pt' | 'en' = 'pt'): StreamEntity[] {
  const ptPool = streams.filter(s => s.language === 'pt');
  const enPool = streams.filter(s => s.language === 'en' || s.language === 'multi' || s.language === 'unknown');
  // 'other' (RU, PL, DE, ES, etc.) is always discarded — not relevant to this platform
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
