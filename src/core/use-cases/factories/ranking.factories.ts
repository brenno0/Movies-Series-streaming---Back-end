import { AddonRegistryPrismaRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import { AggregateStreamsUseCase } from '../ranking/aggregate-streams.use-case';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';

export function makeAggregateStreams() {
  return new AggregateStreamsUseCase(new AddonRegistryPrismaRepository());
}

export function makeGetBestStream() {
  return new GetBestStreamUseCase(new AddonRegistryPrismaRepository());
}
