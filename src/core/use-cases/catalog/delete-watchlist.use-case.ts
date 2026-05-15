import type { WatchlistRepository } from '@/infrastructure/database/repositories/watchlist.repository';
import { ResourceNotFoundError } from '@/shared/errors';

export class DeleteWatchlistUseCase {
  constructor(private readonly watchlistRepository: WatchlistRepository) {}

  async execute({ id }: { id: string }): Promise<void> {
    const entry = await this.watchlistRepository.findById(id);
    if (!entry) throw new ResourceNotFoundError({ resource: 'Watchlist entry' });

    await this.watchlistRepository.deleteById(id);
  }
}
