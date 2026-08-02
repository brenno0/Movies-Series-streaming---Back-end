import { Prisma, type Watchlist } from 'generated/prisma';

import { ResourceNotFoundError } from '@/shared/errors';
import { prisma } from '../prisma';

export interface WatchlistRepository {
  create(data: Prisma.WatchlistUncheckedCreateInput): Promise<Watchlist>;
  deleteById(id: string): Promise<void>;
  findById(id: string): Promise<Watchlist | null>;
  findByMovieAndUser(movieId: string, userId: string): Promise<Watchlist | null>;
  getAll(params: {
    userId: string;
    filter?: { title?: string };
    orderBy?: {
      field: 'createdAt' | 'title' | 'voteAverage';
      direction: 'asc' | 'desc';
    };
    page?: number;
    limit?: number;
  }): Promise<Watchlist[]>;
}

export class WatchlistPrismaRepository implements WatchlistRepository {
  async create(data: Prisma.WatchlistUncheckedCreateInput): Promise<Watchlist> {
    try {
      return await prisma.watchlist.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ResourceNotFoundError({ resource: 'User' });
      }
      throw err;
    }
  }

  async deleteById(id: string): Promise<void> {
    await prisma.watchlist.delete({ where: { id } });
  }

  async findById(id: string): Promise<Watchlist | null> {
    return prisma.watchlist.findUnique({ where: { id } });
  }

  async findByMovieAndUser(movieId: string, userId: string): Promise<Watchlist | null> {
    return prisma.watchlist.findFirst({ where: { movieId, userId } });
  }

  async getAll({
    userId,
    filter,
    orderBy,
    page = 1,
    limit,
  }: {
    userId: string;
    filter?: { title?: string };
    orderBy?: {
      field: 'createdAt' | 'title' | 'voteAverage';
      direction: 'asc' | 'desc';
    };
    page?: number;
    limit?: number;
  }): Promise<Watchlist[]> {
    return prisma.watchlist.findMany({
      where: {
        userId,
        movie: filter?.title
          ? { title: { contains: filter.title, mode: 'insensitive' } }
          : undefined,
      },
      include: { movie: true },
      orderBy: orderBy
        ? orderBy.field === 'title'
          ? { movie: { title: orderBy.direction } }
          : { [orderBy.field]: orderBy.direction }
        : { createdAt: 'desc' },
      ...(limit !== undefined && {
        skip: (page - 1) * limit,
        take: limit,
      }),
    });
  }
}
