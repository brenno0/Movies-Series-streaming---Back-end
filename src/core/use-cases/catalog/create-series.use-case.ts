import type { Series } from 'generated/prisma';

import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';

interface CreateSeriesRequest {
  title: string;
  overview: string;
  tmdbId: number;
  imdbId?: string;
  posterPath: string;
  voteAverage: number;
}

export class CreateSeriesUseCase {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  async execute(data: CreateSeriesRequest): Promise<Series> {
    return this.seriesRepository.upsert({
      tmdbId: data.tmdbId,
      imdbId: data.imdbId,
      title: data.title,
      overview: data.overview,
      posterPath: data.posterPath,
      voteAverage: data.voteAverage,
    });
  }
}
