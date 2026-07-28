import type { StreamEntity } from '@/core/entities/stream.entity';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { ResourceNotFoundError } from '@/shared/errors';

import { buildMovieQuery } from './build-dfindexer-query';
import { rankCandidates } from './calculate-stream-score.use-case';
import { isBrowserCompatibleRelease, parseAudio, parseCodec, parseLanguage, parseQuality } from './parse-dfindexer-release';

const TOP_N_TO_RESOLVE = 8;

export class AggregateStreamsUseCase {
  constructor(
    private readonly dfindexerClient: DfindexerClient,
    private readonly realDebridClient: RealDebridClient,
    private readonly moviesRepository: MoviesRepository,
  ) {}

  async execute(movieId: string, preferLang: 'pt' | 'en' = 'pt'): Promise<StreamEntity[]> {
    const movie = await this.moviesRepository.findById(movieId);
    if (!movie) throw new ResourceNotFoundError({ resource: 'Movie' });

    const query = buildMovieQuery(movie.title);
    const rawCandidates = await this.dfindexerClient.searchAll(query);
    const compatible = rawCandidates.filter(isBrowserCompatibleRelease);
    const ranked = rankCandidates(compatible, preferLang, movie.imdbId ?? undefined).slice(0, TOP_N_TO_RESOLVE);
    console.log(`[aggregate] movie=${movieId} query="${query}" raw=${rawCandidates.length} compatible=${compatible.length} ranked=${ranked.length}`);

    const resolved = await Promise.allSettled(
      ranked.map((c) => this.realDebridClient.resolveMagnetToUrl(c.magnet_link, c.info_hash)),
    );

    const streams: StreamEntity[] = [];
    resolved.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const candidate = ranked[index];
      streams.push({
        id: candidate.info_hash,
        movieId,
        url: result.value.url,
        quality: parseQuality(candidate),
        codec: parseCodec(candidate),
        container: result.value.container,
        audio: parseAudio(candidate),
        language: parseLanguage(candidate),
        bitrate: 0,
        seeds: candidate.seed_count,
        scraperSource: candidate.scraperSource,
      });
    });

    return streams;
  }
}
