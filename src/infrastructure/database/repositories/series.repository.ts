import type { Series, Prisma } from 'generated/prisma';

import { prisma } from '../prisma';

export interface SeriesRepository {
  create(data: Prisma.SeriesCreateInput): Promise<Series>;
  upsert(data: Prisma.SeriesCreateInput): Promise<Series>;
  findByTmdbId(tmdbId: number): Promise<Series | null>;
  findById(id: string): Promise<Series | null>;
}

export class SeriesPrismaRepository implements SeriesRepository {
  async create(data: Prisma.SeriesCreateInput): Promise<Series> {
    return prisma.series.create({ data });
  }

  async upsert(data: Prisma.SeriesCreateInput): Promise<Series> {
    return prisma.series.upsert({
      where: { tmdbId: data.tmdbId as number },
      create: data,
      update: { imdbId: data.imdbId },
    });
  }

  async findByTmdbId(tmdbId: number): Promise<Series | null> {
    return prisma.series.findUnique({ where: { tmdbId } });
  }

  async findById(id: string): Promise<Series | null> {
    return prisma.series.findUnique({ where: { id } });
  }
}
