import { env } from '@/env';
import { BetorClient } from '@/infrastructure/betor/betor.client';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { SeriesPrismaRepository } from '@/infrastructure/database/repositories/series.repository';
import { DebridResolver } from '@/infrastructure/debrid/debrid-resolver';
import { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { TmdbClient } from '@/infrastructure/tmdb/tmdb.client';
import { TorBoxClient } from '@/infrastructure/torbox/torbox.client';

import { AggregateStreamsUseCase } from '../ranking/aggregate-streams.use-case';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';
import { GetBestSeriesStreamUseCase } from '../ranking/get-best-series-stream.use-case';

export function makeDfindexerClient() {
  return new DfindexerClient(env.DFINDEXER_URL);
}

export function makeBetorClient() {
  return new BetorClient();
}

export function makeTmdbClient() {
  return env.TMDB_ACCESS_TOKEN ? new TmdbClient(env.TMDB_ACCESS_TOKEN) : null;
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
  return new AggregateStreamsUseCase(makeDfindexerClient(), makeDebridResolver(), new MoviesPrismaRepository(), makeBetorClient(), makeTmdbClient());
}

export function makeGetBestStream() {
  return new GetBestStreamUseCase(makeDfindexerClient(), makeDebridResolver(), new MoviesPrismaRepository(), makeBetorClient(), makeTmdbClient());
}

export function makeGetBestSeriesStream() {
  return new GetBestSeriesStreamUseCase(makeDfindexerClient(), makeDebridResolver(), new SeriesPrismaRepository(), makeBetorClient(), makeTmdbClient());
}
