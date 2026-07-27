import { env } from '@/env';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { SeriesPrismaRepository } from '@/infrastructure/database/repositories/series.repository';
import { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';

import { AggregateStreamsUseCase } from '../ranking/aggregate-streams.use-case';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';
import { GetBestSeriesStreamUseCase } from '../ranking/get-best-series-stream.use-case';

export function makeDfindexerClient() {
  return new DfindexerClient(env.DFINDEXER_URL);
}

export function makeRealDebridClient() {
  return new RealDebridClient(env.REAL_DEBRID_TOKEN);
}

export function makeAggregateStreams() {
  return new AggregateStreamsUseCase(makeDfindexerClient(), makeRealDebridClient(), new MoviesPrismaRepository());
}

export function makeGetBestStream() {
  return new GetBestStreamUseCase(makeDfindexerClient(), makeRealDebridClient(), new MoviesPrismaRepository());
}

export function makeGetBestSeriesStream() {
  return new GetBestSeriesStreamUseCase(makeDfindexerClient(), makeRealDebridClient(), new SeriesPrismaRepository());
}
