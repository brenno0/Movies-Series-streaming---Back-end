import type { PlaybackSessionRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import { ResourceNotFoundError } from '@/shared/errors';

export class EndPlaybackUseCase {
  constructor(private readonly playbackSessionRepository: PlaybackSessionRepository) {}

  async execute({ sessionId }: { sessionId: string }): Promise<void> {
    const session = await this.playbackSessionRepository.findById(sessionId);
    if (!session) throw new ResourceNotFoundError({ resource: 'Playback session' });

    await this.playbackSessionRepository.updateStatus(sessionId, 'ended');
  }
}
