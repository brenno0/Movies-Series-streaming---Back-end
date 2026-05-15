import { FileMetadataPrismaRepository } from '@/infrastructure/database/repositories/file-metadata.repository';
import { MediaProgressPrismaRepository } from '@/infrastructure/database/repositories/media-progress.repository';
import { PlaybackSessionPrismaRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import { EndPlaybackUseCase } from '../streaming/end-playback.use-case';
import { StartPlaybackUseCase } from '../streaming/start-playback.use-case';
import { UpdateProgressUseCase } from '../streaming/update-progress.use-case';

export function makeStartPlayback() {
  return new StartPlaybackUseCase(
    new PlaybackSessionPrismaRepository(),
    new FileMetadataPrismaRepository(),
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
