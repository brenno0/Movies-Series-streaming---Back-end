import type { Movie, Watchlist } from 'generated/prisma';

import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { WatchlistRepository } from '@/infrastructure/database/repositories/watchlist.repository';
import { ResourceAlreadyExistsError, ResourceNotFoundError } from '@/shared/errors';

interface CreateWatchlistRequest {
  userId: string;
  movieId: string;
}

export class CreateWatchlistUseCase {
  constructor(
    private readonly watchlistRepository: WatchlistRepository,
    private readonly moviesRepository: MoviesRepository,
  ) {}

  async execute({ userId, movieId }: CreateWatchlistRequest): Promise<{ watchList: Watchlist; movie: Movie }> {
    const movie = await this.moviesRepository.findById(movieId);
    if (!movie) throw new ResourceNotFoundError({ resource: 'Movie' });

    const existing = await this.watchlistRepository.findByMovieAndUser(movieId, userId);
    if (existing) throw new ResourceAlreadyExistsError({ resource: 'Movie in watchlist' });

    const watchList = await this.watchlistRepository.create({ movieId, userId });
    return { watchList, movie };
  }
}
