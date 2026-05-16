import type { StreamEntity } from '@/core/entities/stream.entity';
import type { AddonRegistryRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import { deleteStreamCache, getStreamCache, setStreamCache } from '@/infrastructure/cache/stream-cache';
import { StreamNotFoundError } from '@/shared/errors';

import { AggregateStreamsUseCase } from './aggregate-streams.use-case';
import { rankStreams } from './calculate-stream-score.use-case';

export class GetBestStreamUseCase {
  private aggregator: AggregateStreamsUseCase;

  constructor(
    private readonly addonRepository: AddonRegistryRepository,
    private readonly moviesRepository: MoviesRepository,
  ) {
    this.aggregator = new AggregateStreamsUseCase(addonRepository, moviesRepository);
  }

  async execute(movieId: string): Promise<{ best: StreamEntity; ranked: StreamEntity[] }> {
    const cached = await getStreamCache(movieId);
    if (cached && cached.length > 0) {
      return { best: cached[0], ranked: cached };
    }

    const streams = await this.aggregator.execute(movieId);
    if (streams.length === 0) throw new StreamNotFoundError();

    const ranked = rankStreams(streams);
    await setStreamCache(movieId, ranked);

    return { best: ranked[0], ranked };
  }

  async invalidate(movieId: string): Promise<void> {
    await deleteStreamCache(movieId);
  }
}
