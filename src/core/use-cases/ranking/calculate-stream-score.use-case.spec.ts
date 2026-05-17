import { describe, it, expect } from 'vitest';

import type { StreamEntity } from '@/core/entities/stream.entity';
import { calculateScore, rankStreams } from './calculate-stream-score.use-case';

function makeStream(overrides: Partial<StreamEntity> = {}): StreamEntity {
  return {
    id: '1',
    movieId: 'movie-1',
    url: 'http://example.com/stream.mp4',
    quality: '1080p',
    codec: 'h264',
    container: 'mp4',
    audio: 'aac',
    language: 'unknown',
    bitrate: 4000000,
    seeds: 500,
    addonSource: 'test-addon',
    ...overrides,
  };
}

describe('calculateScore', () => {
  it('higher quality produces higher score', () => {
    const s4k = makeStream({ quality: '4K' });
    const s720 = makeStream({ quality: '720p' });
    expect(calculateScore(s4k)).toBeGreaterThan(calculateScore(s720));
  });

  it('more seeds produces higher score', () => {
    const many = makeStream({ seeds: 1000 });
    const few = makeStream({ seeds: 10 });
    expect(calculateScore(many)).toBeGreaterThan(calculateScore(few));
  });

  it('score is between 0 and 1', () => {
    const s = makeStream({ quality: '4K', seeds: 1000, codec: 'av1' });
    const score = calculateScore(s);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('rankStreams', () => {
  it('returns sorted by score descending', () => {
    const streams = [
      makeStream({ id: 'low', quality: '480p', seeds: 10 }),
      makeStream({ id: 'high', quality: '4K', seeds: 1000, codec: 'av1' }),
      makeStream({ id: 'mid', quality: '720p', seeds: 200 }),
    ];
    const ranked = rankStreams(streams);
    expect(ranked[0].id).toBe('high');
    expect(ranked[ranked.length - 1].id).toBe('low');
  });

  it('PT pool wins over better-quality EN stream', () => {
    const streams = [
      makeStream({ id: 'en-4k', quality: '4K', seeds: 1000, language: 'unknown' }),
      makeStream({ id: 'pt-720', quality: '720p', seeds: 50, language: 'pt' }),
    ];
    const ranked = rankStreams(streams);
    expect(ranked[0].id).toBe('pt-720');
  });

  it('falls back to EN pool when no PT exists', () => {
    const streams = [
      makeStream({ id: 'en', quality: '1080p', seeds: 300, language: 'unknown' }),
      makeStream({ id: 'other', quality: '4K', seeds: 1000, language: 'other' }),
    ];
    const ranked = rankStreams(streams);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('en');
  });

  it('discards other-language streams entirely', () => {
    const streams = [
      makeStream({ id: 'ru', quality: '4K', seeds: 999, language: 'other' }),
      makeStream({ id: 'pl', quality: '1080p', seeds: 500, language: 'other' }),
    ];
    const ranked = rankStreams(streams);
    expect(ranked).toHaveLength(0);
  });
});
