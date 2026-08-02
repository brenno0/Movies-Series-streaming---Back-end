import type { StreamEntity } from '@/core/entities/stream.entity';
import type { MoviesRepository } from '@/infrastructure/database/repositories/movies.repository';
import type { BetorClient } from '@/infrastructure/betor/betor.client';
import type { DfindexerClient } from '@/infrastructure/dfindexer/dfindexer.client';
import type { DebridResolver } from '@/infrastructure/debrid/debrid-resolver';
import type { TmdbClient } from '@/infrastructure/tmdb/tmdb.client';
import { ResourceNotFoundError } from '@/shared/errors';

import { buildMovieQuery } from './build-dfindexer-query';
import { rankCandidates } from './calculate-stream-score.use-case';
import { isBrowserCompatibleRelease, parseAudio, parseCodec, parseLanguage, parseQuality } from './parse-dfindexer-release';
import { resolveBatched } from './resolve-batched';

const TOP_N_TO_RESOLVE = 20;

export class AggregateStreamsUseCase {
  constructor(
    private readonly dfindexerClient: DfindexerClient,
    private readonly debridResolver: DebridResolver,
    private readonly moviesRepository: MoviesRepository,
    private readonly betorClient: BetorClient,
    private readonly tmdbClient: TmdbClient | null,
  ) {}

  async execute(movieId: string, preferLang: 'pt' | 'en' = 'pt'): Promise<StreamEntity[]> {
    const movie = await this.moviesRepository.findById(movieId);
    if (!movie) throw new ResourceNotFoundError({ resource: 'Movie' });

    // Scrapers index releases by international title (e.g. "Soul") — movie.title is
    // the localized PT-BR one (e.g. "Divertida Mente 2"'s original is "Inside Out 2").
    // Falls back to the localized title if TMDB is unreachable/unconfigured.
    const originalTitle = (await this.tmdbClient?.getOriginalTitle(movie.tmdbId, 'movie')) ?? movie.title;

    const query = buildMovieQuery(originalTitle);
    // betor first — a single exact IMDB lookup (or keyword search) usually beats fanning
    // out to all 5 scrapers. Only pay for that fan-out when betor comes back empty.
    const betorCandidates = await this.betorClient.searchMovie(originalTitle, movie.imdbId ?? undefined);
    const rawCandidates = betorCandidates.length > 0 ? betorCandidates : await this.dfindexerClient.searchAll(query);
    const compatible = rawCandidates.filter(isBrowserCompatibleRelease);
    const ranked = rankCandidates(compatible, preferLang, movie.imdbId ?? undefined).slice(0, TOP_N_TO_RESOLVE);
    const source = betorCandidates.length > 0 ? 'betor' : 'fanout';
    console.log(`[aggregate] movie=${movieId} query="${query}" source=${source} raw=${rawCandidates.length} compatible=${compatible.length} ranked=${ranked.length}`);

    const resolvedBatch = await resolveBatched(ranked, (c) => this.debridResolver.resolveMagnetToUrl(c.magnet_link, c.info_hash));

    const streams: StreamEntity[] = resolvedBatch.map(({ candidate, resolved }) => ({
      id: candidate.info_hash,
      movieId,
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
