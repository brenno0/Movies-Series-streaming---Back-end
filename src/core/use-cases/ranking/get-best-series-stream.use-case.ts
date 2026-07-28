import type { StreamEntity } from '@/core/entities/stream.entity';
import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { ScraperType } from '@/infrastructure/dfindexer/dfindexer.types';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { deleteStreamCache, getStreamCache, setStreamCache } from '@/infrastructure/cache/stream-cache';
import { StreamNotFoundError } from '@/shared/errors';

import { AggregateSeriesStreamsUseCase } from './aggregate-series-streams.use-case';
import { rankStreams } from './calculate-stream-score.use-case';

export class GetBestSeriesStreamUseCase {
  private aggregator: AggregateSeriesStreamsUseCase;

  constructor(
    dfindexerClient: DfindexerClient,
    realDebridClient: RealDebridClient,
    private readonly seriesRepository: SeriesRepository,
  ) {
    this.aggregator = new AggregateSeriesStreamsUseCase(dfindexerClient, realDebridClient, seriesRepository);
  }

  private cacheKey(seriesId: string, season: number, episode: number, lang: 'pt' | 'en'): string {
    return `series:${seriesId}:${season}:${episode}:${lang}`;
  }

  async execute(seriesId: string, season: number, episode: number, lang: 'pt' | 'en' = 'pt', sourceFilter?: ScraperType): Promise<{ best: StreamEntity; ranked: StreamEntity[] }> {
    const cKey = this.cacheKey(seriesId, season, episode, lang);
    let ranked = await getStreamCache(cKey);

    if (!ranked || ranked.length === 0) {
      const streams = await this.aggregator.execute(seriesId, season, episode, lang);
      if (streams.length === 0) throw new StreamNotFoundError();
      ranked = rankStreams(streams, lang);
      await setStreamCache(cKey, ranked);
    }

    const pool = sourceFilter ? ranked.filter((s) => s.scraperSource === sourceFilter) : ranked;
    if (pool.length === 0) throw new StreamNotFoundError();

    return { best: pool[0], ranked: pool };
  }

  async invalidate(seriesId: string, season: number, episode: number): Promise<void> {
    await deleteStreamCache(this.cacheKey(seriesId, season, episode, 'pt'));
    await deleteStreamCache(this.cacheKey(seriesId, season, episode, 'en'));
  }
}
