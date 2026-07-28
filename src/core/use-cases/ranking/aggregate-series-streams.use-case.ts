import type { StreamEntity } from '@/core/entities/stream.entity';
import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import { ResourceNotFoundError } from '@/shared/errors';

import { buildEpisodeQuery } from './build-dfindexer-query';
import { rankCandidates } from './calculate-stream-score.use-case';
import { isBrowserCompatibleRelease, parseAudio, parseCodec, parseLanguage, parseQuality } from './parse-dfindexer-release';

const TOP_N_TO_RESOLVE = 8;

export class AggregateSeriesStreamsUseCase {
  constructor(
    private readonly dfindexerClient: DfindexerClient,
    private readonly realDebridClient: RealDebridClient,
    private readonly seriesRepository: SeriesRepository,
  ) {}

  async execute(seriesId: string, season: number, episode: number, preferLang: 'pt' | 'en' = 'pt'): Promise<StreamEntity[]> {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) throw new ResourceNotFoundError({ resource: 'Series' });

    const query = buildEpisodeQuery(series.title, season, episode);
    const rawCandidates = await this.dfindexerClient.searchAll(query);
    const compatible = rawCandidates.filter(isBrowserCompatibleRelease);
    const ranked = rankCandidates(compatible, preferLang, series.imdbId ?? undefined).slice(0, TOP_N_TO_RESOLVE);

    const resolved = await Promise.allSettled(
      ranked.map((c) => this.realDebridClient.resolveMagnetToUrl(c.magnet_link, c.info_hash, { season, episode })),
    );

    const streams: StreamEntity[] = [];
    resolved.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const candidate = ranked[index];
      streams.push({
        id: candidate.info_hash,
        movieId: seriesId,
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
