import type { StreamEntity } from '@/core/entities/stream.entity';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { ScraperType } from '@/infrastructure/dfindexer/dfindexer.types';
import type { DebridResolver } from '@/infrastructure/debrid/debrid-resolver';
import { deleteStreamCache, getStreamCache, setStreamCache } from '@/infrastructure/cache/stream-cache';
import { StreamNotFoundError } from '@/shared/errors';

import { AggregateStreamsUseCase } from './aggregate-streams.use-case';
import { rankStreams } from './calculate-stream-score.use-case';

export class GetBestStreamUseCase {
  private aggregator: AggregateStreamsUseCase;

  constructor(
    dfindexerClient: DfindexerClient,
    debridResolver: DebridResolver,
    private readonly moviesRepository: MoviesRepository,
  ) {
    this.aggregator = new AggregateStreamsUseCase(dfindexerClient, debridResolver, moviesRepository);
  }

  async execute(movieId: string, lang: 'pt' | 'en' = 'pt', sourceFilter?: ScraperType): Promise<{ best: StreamEntity; ranked: StreamEntity[] }> {
    const cKey = `${movieId}:${lang}`;
    let ranked = await getStreamCache(cKey);

    if (!ranked || ranked.length === 0) {
      const streams = await this.aggregator.execute(movieId, lang);
      if (streams.length === 0) throw new StreamNotFoundError();
      ranked = rankStreams(streams, lang);
      await setStreamCache(cKey, ranked);
    }

    const pool = sourceFilter ? ranked.filter((s) => s.scraperSource === sourceFilter) : ranked;
    if (pool.length === 0) throw new StreamNotFoundError();

    return { best: pool[0], ranked: pool };
  }

  async invalidate(movieId: string): Promise<void> {
    await deleteStreamCache(`${movieId}:pt`);
    await deleteStreamCache(`${movieId}:en`);
  }
}
