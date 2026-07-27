export type ScraperType = 'starck' | 'rede' | 'tfilme' | 'comand' | 'bludv';

export interface DfindexerResult {
  title: string;
  title_processed: string;
  title_translated_processed: string;
  original_title: string;
  magnet_link: string;
  magnet_original: string;
  magnet_processed: string;
  info_hash: string;
  details: string;
  date: string;
  size: string;
  seed_count: number;
  leech_count: number;
  imdb: string;
  legend: string;
  audio: string[];
  has_legenda: boolean;
  similarity: number;
  year: string;
  trackers: string[];
}

export interface DfindexerCandidate extends DfindexerResult {
  scraperSource: ScraperType;
}
