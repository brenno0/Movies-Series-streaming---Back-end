import type { PlaybackSession, Prisma } from 'generated/prisma';

import { prisma } from '../prisma';

export interface PlaybackSessionRepository {
  create(data: Prisma.PlaybackSessionUncheckedCreateInput): Promise<PlaybackSession>;
  findById(id: string): Promise<PlaybackSession | null>;
  findActiveByUser(userId: string): Promise<PlaybackSession[]>;
  updateStatus(id: string, status: string): Promise<PlaybackSession>;
  updateProgress(id: string, progressSecs: number): Promise<PlaybackSession>;
  findEndedBefore(cutoff: Date): Promise<PlaybackSession[]>;
}

export class PlaybackSessionPrismaRepository implements PlaybackSessionRepository {
  async create(data: Prisma.PlaybackSessionUncheckedCreateInput): Promise<PlaybackSession> {
    return prisma.playbackSession.create({ data });
  }

  async findById(id: string): Promise<PlaybackSession | null> {
    return prisma.playbackSession.findUnique({ where: { id } });
  }

  async findActiveByUser(userId: string): Promise<PlaybackSession[]> {
    return prisma.playbackSession.findMany({
      where: { userId, status: { in: ['active', 'paused'] } },
    });
  }

  async updateStatus(id: string, status: string): Promise<PlaybackSession> {
    return prisma.playbackSession.update({ where: { id }, data: { status } });
  }

  async updateProgress(id: string, progressSecs: number): Promise<PlaybackSession> {
    return prisma.playbackSession.update({ where: { id }, data: { progressSecs } });
  }

  async findEndedBefore(cutoff: Date): Promise<PlaybackSession[]> {
    return prisma.playbackSession.findMany({
      where: { status: 'ended', updatedAt: { lt: cutoff } },
    });
  }
}
