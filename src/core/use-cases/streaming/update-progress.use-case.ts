import type { MediaProgressRepository } from '@/infrastructure/database/repositories/media-progress.repository';
import type { PlaybackSessionRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import { ResourceNotFoundError } from '@/shared/errors';

interface UpdateProgressRequest {
  sessionId: string;
  userId: string;
  movieId: string;
  progressSecs: number;
}

export class UpdateProgressUseCase {
  constructor(
    private readonly playbackSessionRepository: PlaybackSessionRepository,
    private readonly mediaProgressRepository: MediaProgressRepository,
  ) {}

  async execute({ sessionId, userId, movieId, progressSecs }: UpdateProgressRequest): Promise<void> {
    const session = await this.playbackSessionRepository.findById(sessionId);
    if (!session) throw new ResourceNotFoundError({ resource: 'Playback session' });

    await Promise.all([
      this.playbackSessionRepository.updateProgress(sessionId, progressSecs),
      this.mediaProgressRepository.upsert(userId, movieId, progressSecs),
    ]);
  }
}
