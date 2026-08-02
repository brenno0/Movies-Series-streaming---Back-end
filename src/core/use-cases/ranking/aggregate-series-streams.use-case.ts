import type { StreamEntity } from '@/core/entities/stream.entity';
import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';
import type { BetorClient } from '@/infrastructure/betor/betor.client';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { DebridResolver } from '@/infrastructure/debrid/debrid-resolver';
import type { TmdbClient } from '@/infrastructure/tmdb/tmdb.client';
import { ResourceNotFoundError } from '@/shared/errors';

import { rankCandidates } from './calculate-stream-score.use-case';
import { isBrowserCompatibleRelease, parseAudio, parseCodec, parseLanguage, parseQuality } from './parse-dfindexer-release';
import { resolveBatched } from './resolve-batched';

const TOP_N_TO_RESOLVE = 20;

export class AggregateSeriesStreamsUseCase {
  constructor(
    private readonly dfindexerClient: DfindexerClient,
    private readonly debridResolver: DebridResolver,
    private readonly seriesRepository: SeriesRepository,
    private readonly betorClient: BetorClient,
    private readonly tmdbClient: TmdbClient | null,
  ) {}

  async execute(seriesId: string, season: number, episode: number, preferLang: 'pt' | 'en' = 'pt'): Promise<StreamEntity[]> {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) throw new ResourceNotFoundError({ resource: 'Series' });

    // series.title is the localized PT-BR title (e.g. "Uma Família da Pesada"), but
    // release names use the international one ("Family Guy") — same mismatch as movies.
    const originalTitle = (await this.tmdbClient?.getOriginalTitle(series.tmdbId, 'tv')) ?? series.title;

    const betorCandidates = await this.betorClient.searchSeason(originalTitle, season, series.imdbId ?? undefined);
    const rawCandidates = betorCandidates.length > 0 ? betorCandidates : await this.dfindexerClient.searchAllSeason(originalTitle, season);
    const compatible = rawCandidates.filter(isBrowserCompatibleRelease);
    const ranked = rankCandidates(compatible, preferLang, series.imdbId ?? undefined).slice(0, TOP_N_TO_RESOLVE);
    const source = betorCandidates.length > 0 ? 'betor' : 'fanout';
    console.log(`[aggregate-series] series=${seriesId} s=${season} e=${episode} source=${source} raw=${rawCandidates.length} compatible=${compatible.length} ranked=${ranked.length}`);

    const resolvedBatch = await resolveBatched(ranked, (c) => this.debridResolver.resolveMagnetToUrl(c.magnet_link, c.info_hash, { season, episode }));

    const streams: StreamEntity[] = resolvedBatch.map(({ candidate, resolved }) => ({
      id: candidate.info_hash,
      movieId: seriesId,
      url: resolved.url,
      quality: parseQuality(candidate),
      codec: parseCodec(candidate),
      container: resolved.container,
      audio: parseAudio(candidate),
      language: parseLanguage(candidate),
      bitrate: 0,
      seeds: candidate.seed_count,
      scraperSource: candidate.scraperSource,
    }));

    return streams;
  }
}
