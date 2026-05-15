import type { Movie } from 'generated/prisma';

import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';

interface CreateMovieRequest {
  title: string;
  overview: string;
  tmdbId: number;
  posterPath: string;
  voteAverage: number;
}

export class CreateMovieUseCase {
  constructor(private readonly moviesRepository: MoviesRepository) {}

  async execute(data: CreateMovieRequest): Promise<Movie> {
    const existing = await this.moviesRepository.findByTmdbId(data.tmdbId);
    if (existing) return existing;

    return this.moviesRepository.create(data);
  }
}
