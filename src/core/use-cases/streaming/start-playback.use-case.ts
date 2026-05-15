import type { FileMetadataRepository } from '@/infrastructure/database/repositories/file-metadata.repository';
import type { PlaybackSessionRepository } from '@/infrastructure/database/repositories/playback-session.repository';
import { downloadFromDrive } from '@/infrastructure/storage/google-drive.adapter';
import { hlsOutputPath, hlsPlaylistPath } from '@/infrastructure/storage/local-ssd.adapter';
import { generateHLS } from '@/infrastructure/video/ffmpeg.wrapper';

interface StartPlaybackRequest {
  userId: string;
  movieId: string;
}

interface StartPlaybackResponse {
  sessionId: string;
  playlistUrl: string;
}

export class StartPlaybackUseCase {
  constructor(
    private readonly playbackSessionRepository: PlaybackSessionRepository,
    private readonly fileMetadataRepository: FileMetadataRepository,
  ) {}

  async execute({ userId, movieId }: StartPlaybackRequest): Promise<StartPlaybackResponse> {
    let fileMeta = await this.fileMetadataRepository.findByMovieId(movieId);

    if (!fileMeta || fileMeta.status !== 'ready') {
      fileMeta = await this.fileMetadataRepository.create({
        movie: { connect: { id: movieId } },
        status: 'processing',
      });

      if (fileMeta.driveFileId) {
        const rawPath = `/tmp/nbflix-raw/${movieId}.mp4`;
        await downloadFromDrive(fileMeta.driveFileId, rawPath);
        const outputDir = hlsOutputPath(movieId);
        await generateHLS(rawPath, outputDir);
      }

      fileMeta = await this.fileMetadataRepository.updateStatus(fileMeta.id, 'ready');
    } else {
      await this.fileMetadataRepository.updateLastAccessed(fileMeta.id);
    }

    const session = await this.playbackSessionRepository.create({
      userId,
      movieId,
      fileMetaId: fileMeta.id,
    });

    const playlistUrl = `/stream/${movieId}/index.m3u8`;

    return { sessionId: session.id, playlistUrl };
  }
}
