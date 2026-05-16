import type { PlaybackSessionRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import type { AddonRegistryRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import { GetBestStreamUseCase } from '../ranking/get-best-stream.use-case';

interface StartPlaybackRequest {
  userId: string;
  movieId: string;
}

interface StartPlaybackResponse {
  sessionId: string;
  streamUrl: string;
  quality: string;
  source: string;
}

export class StartPlaybackUseCase {
  private getBestStream: GetBestStreamUseCase;

  constructor(
    private readonly playbackSessionRepository: PlaybackSessionRepository,
    addonRepository: AddonRegistryRepository,
    moviesRepository: MoviesRepository,
  ) {
    this.getBestStream = new GetBestStreamUseCase(addonRepository, moviesRepository);
  }

  async execute({ userId, movieId }: StartPlaybackRequest): Promise<StartPlaybackResponse> {
    const { best } = await this.getBestStream.execute(movieId);

    const session = await this.playbackSessionRepository.create({
      userId,
      movieId,
    });

    return {
      sessionId: session.id,
      streamUrl: best.url,
      quality: best.quality,
      source: best.addonSource,
    };
  }
}
