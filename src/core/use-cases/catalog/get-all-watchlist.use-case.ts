import type { Watchlist } from 'generated/prisma';

import type { WatchlistRepository } from '@/infrastructure/database/repositories/watchlist.repository';

interface GetAllWatchlistRequest {
  userId: string;
  filter?: { title?: string };
  orderBy?: {
    field: 'createdAt' | 'title' | 'voteAverage';
    direction: 'asc' | 'desc';
  };
  page?: number;
  limit?: number;
}

export class GetAllWatchlistUseCase {
  constructor(private readonly watchlistRepository: WatchlistRepository) {}

  async execute(params: GetAllWatchlistRequest): Promise<Watchlist[]> {
    return this.watchlistRepository.getAll(params);
  }
}
