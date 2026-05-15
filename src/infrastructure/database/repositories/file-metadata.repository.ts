import type { FileMetadata, Prisma } from 'generated/prisma';

import { prisma } from '../prisma';

export interface FileMetadataRepository {
  create(data: Prisma.FileMetadataCreateInput): Promise<FileMetadata>;
  findByMovieId(movieId: string): Promise<FileMetadata | null>;
  findById(id: string): Promise<FileMetadata | null>;
  updateLastAccessed(id: string): Promise<void>;
  updateStatus(id: string, status: string): Promise<FileMetadata>;
  findLRU(): Promise<FileMetadata | null>;
  deleteById(id: string): Promise<void>;
  findExpiredSessions(olderThanMs: number): Promise<FileMetadata[]>;
}

export class FileMetadataPrismaRepository implements FileMetadataRepository {
  async create(data: Prisma.FileMetadataCreateInput): Promise<FileMetadata> {
    return prisma.fileMetadata.create({ data });
  }

  async findByMovieId(movieId: string): Promise<FileMetadata | null> {
    return prisma.fileMetadata.findFirst({ where: { movieId } });
  }

  async findById(id: string): Promise<FileMetadata | null> {
    return prisma.fileMetadata.findUnique({ where: { id } });
  }

  async updateLastAccessed(id: string): Promise<void> {
    await prisma.fileMetadata.update({
      where: { id },
      data: { lastAccessed: new Date() },
    });
  }

  async updateStatus(id: string, status: string): Promise<FileMetadata> {
    return prisma.fileMetadata.update({ where: { id }, data: { status } });
  }

  async findLRU(): Promise<FileMetadata | null> {
    return prisma.fileMetadata.findFirst({
      where: { status: 'ready' },
      orderBy: { lastAccessed: 'asc' },
    });
  }

  async deleteById(id: string): Promise<void> {
    await prisma.fileMetadata.delete({ where: { id } });
  }

  async findExpiredSessions(olderThanMs: number): Promise<FileMetadata[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return prisma.fileMetadata.findMany({
      where: { lastAccessed: { lt: cutoff }, status: 'ready' },
    });
  }
}
