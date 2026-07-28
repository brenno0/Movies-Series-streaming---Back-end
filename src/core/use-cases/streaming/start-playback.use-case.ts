import type { PlaybackSessionRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { DebridResolver } from '@/infrastructure/debrid/debrid-resolver';
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
    dfindexerClient: DfindexerClient,
    debridResolver: DebridResolver,
    moviesRepository: MoviesRepository,
  ) {
    this.getBestStream = new GetBestStreamUseCase(dfindexerClient, debridResolver, moviesRepository);
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
      source: best.scraperSource,
    };
  }
}
