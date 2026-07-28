import { env } from '@/env';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { SeriesPrismaRepository } from '@/infrastructure/database/repositories/series.repository';
import { DebridResolver } from '@/infrastructure/debrid/debrid-resolver';
import { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { TorBoxClient } from '@/infrastructure/torbox/torbox.client';

import { AggregateStreamsUseCase } from '../ranking/aggregate-streams.use-case';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';
import { GetBestSeriesStreamUseCase } from '../ranking/get-best-series-stream.use-case';

export function makeDfindexerClient() {
  return new DfindexerClient(env.DFINDEXER_URL);
}

export function makeRealDebridClient() {
  return new RealDebridClient(env.REAL_DEBRID_TOKEN);
}

export function makeTorBoxClient() {
  return env.TORBOX_API_KEY ? new TorBoxClient(env.TORBOX_API_KEY) : null;
}

export function makeDebridResolver() {
  return new DebridResolver(makeTorBoxClient(), makeRealDebridClient());
}

export function makeAggregateStreams() {
  return new AggregateStreamsUseCase(makeDfindexerClient(), makeDebridResolver(), new MoviesPrismaRepository());
}

export function makeGetBestStream() {
  return new GetBestStreamUseCase(makeDfindexerClient(), makeDebridResolver(), new MoviesPrismaRepository());
}

export function makeGetBestSeriesStream() {
  return new GetBestSeriesStreamUseCase(makeDfindexerClient(), makeDebridResolver(), new SeriesPrismaRepository());
}
