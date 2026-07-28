import type { StreamEntity } from '@/core/entities/stream.entity';
import { resolutionScore } from '@/core/value-objects/stream-metadata.vo';
import type { DfindexerCandidate } from '@/infrastructure/dfindexer/dfindexer.types';

import { parseLanguage, parseQuality } from './parse-dfindexer-release';

const CANDIDATE_WEIGHTS = { quality: 0.4, seeds: 0.35, similarity: 0.25 };
const STREAM_WEIGHTS = { quality: 0.35, seeds: 0.25, compat: 0.25, language: 0.05, latency: 0.1 };
const MAX_SEEDS = 1000;
const MAX_LATENCY_MS = 5000;
const MIN_SIMILARITY = 0.5;

export function scoreCandidate(candidate: DfindexerCandidate): number {
  const qualityNorm = resolutionScore(parseQuality(candidate)) / 4;
  const seedsNorm = Math.min(candidate.seed_count / MAX_SEEDS, 1);
  return (
    qualityNorm * CANDIDATE_WEIGHTS.quality +
    seedsNorm * CANDIDATE_WEIGHTS.seeds +
    candidate.similarity * CANDIDATE_WEIGHTS.similarity
  );
}

export function rankCandidates(candidates: DfindexerCandidate[], preferLang: 'pt' | 'en' = 'pt', imdbId?: string): DfindexerCandidate[] {
  const filtered = candidates.filter((c) => c.similarity >= MIN_SIMILARITY);
  const ptPool = filtered.filter((c) => parseLanguage(c) === 'pt');
  const otherPool = filtered.filter((c) => ['en', 'multi', 'unknown'].includes(parseLanguage(c)));

  const pool = preferLang === 'pt'
    ? (ptPool.length > 0 ? ptPool : otherPool)
    : (otherPool.length > 0 ? otherPool : ptPool);

  // dfindexer's own similarity score can give a false 1.0 to unrelated titles that merely
  // share a common word (e.g. query "Soul" matching "Soul Surfer" or a translated "Le Mangeur
  // d'Âmes"). When we know the real IMDB id, sort those matches first — but don't discard the
  // rest: if every IMDB-matched release turns out dead/DMCA-flagged on Real-Debrid, the next
  // candidates are still there as fallback instead of leaving an empty pool.
  return [...pool].sort((a, b) => {
    if (imdbId) {
      const aMatch = a.imdb === imdbId ? 1 : 0;
      const bMatch = b.imdb === imdbId ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
    }
    return scoreCandidate(b) - scoreCandidate(a);
  });
}

function languageScore(stream: StreamEntity): number {
  if (stream.language === 'pt') return 1.0;
  if (stream.language === 'multi') return 0.8;
  if (stream.language === 'en') return 0.6;
  return 0.3;
}

function compatScore(stream: StreamEntity): number {
  const isH264 = stream.codec === 'h264';
  const isAAC = stream.audio === 'aac';
  let score = 0;
  if (stream.container === 'mp4' && isH264) score += 0.6;
  else if (stream.container === 'mp4') score += 0.35;
  else if (stream.container === 'mkv' && isH264) score += 0.4;
  else score += 0.2;
  score += isAAC ? 0.4 : 0.2;
  return score;
}

export function calculateScore(stream: StreamEntity, latencyMs = 0): number {
  const qualityNorm = resolutionScore(stream.quality) / 4;
  const seedsNorm = Math.min(stream.seeds / MAX_SEEDS, 1);
  const latencyNorm = 1 - Math.min(latencyMs / MAX_LATENCY_MS, 1);

  return (
    qualityNorm * STREAM_WEIGHTS.quality +
    seedsNorm * STREAM_WEIGHTS.seeds +
    compatScore(stream) * STREAM_WEIGHTS.compat +
    languageScore(stream) * STREAM_WEIGHTS.language +
    latencyNorm * STREAM_WEIGHTS.latency
  );
}

export function rankStreams(streams: StreamEntity[], preferLang: 'pt' | 'en' = 'pt'): StreamEntity[] {
  const ptPool = streams.filter((s) => s.language === 'pt');
  const enPool = streams.filter((s) => s.language === 'en' || s.language === 'multi' || s.language === 'unknown');
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
