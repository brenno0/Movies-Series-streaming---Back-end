import { AddonRegistryPrismaRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { SeriesPrismaRepository } from '@/infrastructure/database/repositories/series.repository';
import { AggregateStreamsUseCase } from '../ranking/aggregate-streams.use-case';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';
import { GetBestSeriesStreamUseCase } from '../ranking/get-best-series-stream.use-case';

export function makeAggregateStreams() {
  return new AggregateStreamsUseCase(new AddonRegistryPrismaRepository(), new MoviesPrismaRepository());
}

export function makeGetBestStream() {
  return new GetBestStreamUseCase(new AddonRegistryPrismaRepository(), new MoviesPrismaRepository());
}

export function makeGetBestSeriesStream() {
  return new GetBestSeriesStreamUseCase(new AddonRegistryPrismaRepository(), new SeriesPrismaRepository());
}
