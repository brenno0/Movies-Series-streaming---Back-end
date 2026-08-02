import { redis } from '@/infrastructure/cache/redis';

const API_BASE = 'https://api.themoviedb.org/3';
// Original title never changes for a given tmdbId — safe to cache for a long time.
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

function cacheKey(mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `tmdb:original-title:${mediaType}:${tmdbId}`;
}

// Scraper sites index torrents by international release title (e.g. "Family Guy"), but
// our catalog stores the localized PT-BR title from TMDB (e.g. "Uma Família da Pesada").
// Fanout queries built from the localized title return zero matches whenever the two
// diverge, so aggregate-streams/aggregate-series-streams use this to get the title that
// actually matches release naming.
export class TmdbClient {
  constructor(private readonly accessToken: string) {}

  async getOriginalTitle(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
    const key = cacheKey(mediaType, tmdbId);
    const cached = await redis.get(key);
    if (cached !== null) return cached.length > 0 ? cached : null;

    try {
      const res = await fetch(`${API_BASE}/${mediaType}/${tmdbId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as { original_title?: string; original_name?: string };
      const originalTitle = (mediaType === 'movie' ? data.original_title : data.original_name) ?? null;

      // Cache the miss too (empty string) so a title-less response doesn't hammer TMDB every call.
      await redis.set(key, originalTitle ?? '', 'EX', CACHE_TTL_SECONDS);
      return originalTitle;
    } catch {
      return null;
    }
  }
}
