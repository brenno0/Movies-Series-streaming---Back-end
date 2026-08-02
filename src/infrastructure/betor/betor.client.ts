import type { DfindexerCandidate } from '@/infrastructure/dfindexer/dfindexer.types';

// catalogo.betor.top is a meta-aggregator (its own words: "agregador de agregadores")
// scraped directly here instead of through dfindexer's Python BaseScraper framework —
// no pagination/detail-page crawl needed, one search page already carries every field
// we need as HTML data-attributes on a single tag per release.
const BASE_URL = 'https://catalogo.betor.top';
const REQUEST_TIMEOUT_MS = 20000;

// Maps this site's language codes to words parseLanguage()'s legend-fallback branch
// already recognizes (see parse-dfindexer-release.ts) — keeps betor candidates flowing
// through the exact same ranking/parsing pipeline as the other 5 scrapers.
const LANGUAGE_WORD: Record<string, string> = { en: 'english', pt: 'portugues', 'pt-BR': 'portugues' };

function extractAttr(tag: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

function extractInfoHash(magnet: string): string | null {
  const match = /btih:([a-fA-F0-9]{40})/i.exec(magnet);
  return match ? match[1].toLowerCase() : null;
}

// betor's series item page (like the movie one) lists torrents for every season on one
// page — there's no per-season route (catalogo.betor.top/imdb/{id}/season/{n}/ 404s,
// verified live: always the empty not-found template, 0 rows, for every series tested).
// So we fetch the whole page and filter release names client-side instead.
function matchesSeason(title: string, season: number): boolean {
  const padded = String(season).padStart(2, '0');
  return (
    new RegExp(`\\bS${padded}(?:E\\d{2})?\\b`, 'i').test(title) ||
    new RegExp(`\\btemporada\\s*0?${season}\\b`, 'i').test(title)
  );
}

function parseRow(tag: string): DfindexerCandidate | null {
  const magnet = extractAttr(tag, 'data-torrent-magnet-uri');
  if (!magnet) return null;
  const infoHash = extractInfoHash(magnet);
  if (!infoHash) return null;

  const title = extractAttr(tag, 'data-torrent-name') ?? '';
  const languagesRaw = extractAttr(tag, 'data-torrent-languages') ?? '';
  const legend = languagesRaw
    .split(',')
    .map((code) => LANGUAGE_WORD[code.trim()] ?? code.trim())
    .join(', ');

  return {
    title,
    title_processed: title,
    title_translated_processed: title,
    original_title: title,
    magnet_link: magnet,
    magnet_original: magnet,
    magnet_processed: decodeURIComponent(magnet),
    info_hash: infoHash,
    details: extractAttr(tag, 'data-provider-url') ?? '',
    date: extractAttr(tag, 'data-torrent-inserted-at') ?? '',
    size: extractAttr(tag, 'data-torrent-size') ?? '',
    seed_count: Number.parseInt(extractAttr(tag, 'data-torrent-num-seeds') ?? '0', 10) || 0,
    leech_count: Number.parseInt(extractAttr(tag, 'data-torrent-num-peers') ?? '0', 10) || 0,
    imdb: extractAttr(tag, 'data-item-imdb-id') ?? '',
    legend,
    audio: [],
    has_legenda: false,
    // The site already did its own relevance filtering (search or exact IMDB lookup) —
    // rankCandidates drops anything below MIN_SIMILARITY, so this must clear that bar.
    similarity: 1,
    year: '',
    trackers: [],
    scraperSource: 'betor',
  };
}

function parseRows(html: string): DfindexerCandidate[] {
  const rows: DfindexerCandidate[] = [];
  const tagRegex = /<div\b[^>]*\bdata-torrent\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const candidate = parseRow(match[0]);
    if (candidate) rows.push(candidate);
  }
  return rows;
}

export class BetorClient {
  private async fetchAndParse(path: string): Promise<DfindexerCandidate[]> {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      return parseRows(await res.text());
    } catch {
      return [];
    }
  }

  // Exact IMDB lookup when we know the id — avoids the false-positive matching a plain
  // keyword search can produce (e.g. "Peaky Blinders" keyword-matching an unrelated
  // 2026 movie of the same name instead of the actual series).
  async searchMovie(title: string, imdbId?: string): Promise<DfindexerCandidate[]> {
    const path = imdbId ? `/imdb/${imdbId}/` : `/search/filmes/?q=${encodeURIComponent(title)}`;
    return this.fetchAndParse(path);
  }

  async searchSeason(title: string, season: number, imdbId?: string): Promise<DfindexerCandidate[]> {
    const path = imdbId ? `/imdb/${imdbId}/` : `/search/series/?q=${encodeURIComponent(title)}`;
    const candidates = await this.fetchAndParse(path);
    return candidates.filter((c) => matchesSeason(c.title, season));
  }
}
