import type { Movie, Prisma } from 'generated/prisma';

import { prisma } from '../prisma';

export interface MoviesRepository {
  create(data: Prisma.MovieCreateInput): Promise<Movie>;
  findByTmdbId(tmdbId: number): Promise<Movie | null>;
  findById(id: string): Promise<Movie | null>;
}

export class MoviesPrismaRepository implements MoviesRepository {
  async create(data: Prisma.MovieCreateInput): Promise<Movie> {
    return prisma.movie.create({ data });
  }

  async findByTmdbId(tmdbId: number): Promise<Movie | null> {
    return prisma.movie.findUnique({ where: { tmdbId } });
  }

  async findById(id: string): Promise<Movie | null> {
    return prisma.movie.findUnique({ where: { id } });
  }
}
