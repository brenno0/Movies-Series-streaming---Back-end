import { prisma } from '@/lib/prisma';
import type { Prisma, Watchlist } from 'generated/prisma';

import type { WatchListRepository } from '../watchList-repository';

export class WatchListPrismaRepository implements WatchListRepository {
  async create(data: Prisma.WatchlistUncheckedCreateInput): Promise<Watchlist> {
    const watchListMovie = await prisma.watchlist.create({
      data,
    });

    return watchListMovie;
  }

  async deleteById(id: string): Promise<void> {
    await prisma.watchlist.delete({
      where: {
        id,
      },
    });
  }

  async findMovieByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<Watchlist | null> {
    const watchList = await prisma.watchlist.findFirst({
      where: {
        movieId: id,
        userId,
      },
    });

    return watchList;
  }

  async getAll({
    userId,
    limit = 10,
    page = 1,
    orderBy,
    params,
  }: {
    userId: string;
    params?: { title?: string };
    orderBy?: {
      field: 'createdAt' | 'title' | 'voteAverage';
      direction: 'asc' | 'desc';
    };
    page?: number;
    limit?: number;
  }): Promise<Watchlist[]> {
    return await prisma.watchlist.findMany({
      where: {
        userId,
        movie: params?.title
          ? {
              title: { contains: params.title, mode: 'insensitive' },
            }
          : undefined,
      },
      include: {
        movie: true,
      },
      orderBy: orderBy
        ? orderBy.field === 'title'
          ? { movie: { title: orderBy.direction } }
          : { [orderBy.field]: orderBy.direction }
        : { createdAt: 'desc' }, // padrão
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findById(id: string): Promise<Watchlist | null> {
    const watchList = await prisma.watchlist.findUnique({
      where: {
        id,
      },
    });

    return watchList;
  }
}
