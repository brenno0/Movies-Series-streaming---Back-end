import type { MediaProgress, Prisma } from 'generated/prisma';

import { prisma } from '../prisma';

export interface MediaProgressRepository {
  upsert(userId: string, movieId: string, progressSecs: number): Promise<MediaProgress>;
  findByUserAndMovie(userId: string, movieId: string): Promise<MediaProgress | null>;
  findAllByUser(userId: string): Promise<MediaProgress[]>;
}

export class MediaProgressPrismaRepository implements MediaProgressRepository {
  async upsert(userId: string, movieId: string, progressSecs: number): Promise<MediaProgress> {
    return prisma.mediaProgress.upsert({
      where: { userId_movieId: { userId, movieId } },
      update: { progressSecs },
      create: { userId, movieId, progressSecs },
    });
  }

  async findByUserAndMovie(userId: string, movieId: string): Promise<MediaProgress | null> {
    return prisma.mediaProgress.findUnique({
      where: { userId_movieId: { userId, movieId } },
    });
  }

  async findAllByUser(userId: string): Promise<MediaProgress[]> {
    return prisma.mediaProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
