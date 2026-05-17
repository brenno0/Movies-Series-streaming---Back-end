import type { Movie } from 'generated/prisma';

import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';

interface CreateMovieRequest {
  title: string;
  overview: string;
  tmdbId: number;
  imdbId?: string;
  posterPath: string;
  voteAverage: number;
}

export class CreateMovieUseCase {
  constructor(private readonly moviesRepository: MoviesRepository) {}

  async execute(data: CreateMovieRequest): Promise<Movie> {
    return this.moviesRepository.upsert({
      tmdbId: data.tmdbId,
      imdbId: data.imdbId,
      title: data.title,
      overview: data.overview,
      posterPath: data.posterPath,
      voteAverage: data.voteAverage,
    });
  }
}
