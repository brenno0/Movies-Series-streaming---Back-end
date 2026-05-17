import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { SeriesPrismaRepository } from '@/infrastructure/database/repositories/series.repository';
import { WatchlistPrismaRepository } from '@/infrastructure/database/repositories/watchlist.repository';
import { CreateMovieUseCase } from '../catalog/create-movie.use-case';
import { CreateSeriesUseCase } from '../catalog/create-series.use-case';
import { CreateWatchlistUseCase } from '../catalog/create-watchlist.use-case';
import { DeleteWatchlistUseCase } from '../catalog/delete-watchlist.use-case';
import { GetAllWatchlistUseCase } from '../catalog/get-all-watchlist.use-case';

export function makeCreateMovie() {
  return new CreateMovieUseCase(new MoviesPrismaRepository());
}

export function makeCreateSeries() {
  return new CreateSeriesUseCase(new SeriesPrismaRepository());
}

export function makeCreateWatchlist() {
  return new CreateWatchlistUseCase(
    new WatchlistPrismaRepository(),
    new MoviesPrismaRepository(),
  );
}

export function makeDeleteWatchlist() {
  return new DeleteWatchlistUseCase(new WatchlistPrismaRepository());
}

export function makeGetAllWatchlist() {
  return new GetAllWatchlistUseCase(new WatchlistPrismaRepository());
}
