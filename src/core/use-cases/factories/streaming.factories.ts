import { MediaProgressPrismaRepository } from '@/infrastructure/database/repositories/media-progress.repository';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';
import { PlaybackSessionPrismaRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import { EndPlaybackUseCase } from '../streaming/end-playback.use-case';
import { StartPlaybackUseCase } from '../streaming/start-playback.use-case';
import { UpdateProgressUseCase } from '../streaming/update-progress.use-case';
import { makeDfindexerClient, makeRealDebridClient } from './ranking.factories';

export function makeStartPlayback() {
  return new StartPlaybackUseCase(
    new PlaybackSessionPrismaRepository(),
    makeDfindexerClient(),
    makeRealDebridClient(),
    new MoviesPrismaRepository(),
  );
}

export function makeUpdateProgress() {
  return new UpdateProgressUseCase(
    new PlaybackSessionPrismaRepository(),
    new MediaProgressPrismaRepository(),
  );
}

export function makeEndPlayback() {
  return new EndPlaybackUseCase(new PlaybackSessionPrismaRepository());
}
