import type { DfindexerCandidate } from '@/infrastructure/dfindexer/dfindexer.types';

export function parseQuality(candidate: DfindexerCandidate): '4K' | '1080p' | '720p' | '480p' {
  const src = (candidate.magnet_processed ?? '').toLowerCase();
  if (src.includes('2160p') || src.includes('4k') || src.includes('uhd')) return '4K';
  if (src.includes('1080p')) return '1080p';
  if (src.includes('720p')) return '720p';
  return '480p';
}

export function parseCodec(candidate: DfindexerCandidate): 'h264' | 'hevc' | 'av1' {
  const src = (candidate.magnet_processed ?? '').toLowerCase();
  if (src.includes('av1')) return 'av1';
  if (src.includes('hevc') || src.includes('h265') || src.includes('x265')) return 'hevc';
  return 'h264';
}

export function parseAudio(candidate: DfindexerCandidate): 'aac' | 'ac3' | 'dts' | 'unknown' {
  const src = `${candidate.title ?? ''} ${candidate.magnet_processed ?? ''}`.toLowerCase();
  if (src.includes('truehd') || src.includes('atmos')) return 'dts';
  if (src.includes('dts')) return 'dts';
  if (src.includes('eac3') || src.includes('ddp') || src.includes('dd+')) return 'ac3';
  if (/\bdd[257][.\s]?[012]\b/.test(src) && !src.includes('aac')) return 'ac3';
  if (src.includes('ac3') || src.includes('dolby digital')) return 'ac3';
  if (src.includes('aac')) return 'aac';
  return 'unknown';
}

export function parseLanguage(candidate: DfindexerCandidate): 'pt' | 'en' | 'multi' | 'unknown' | 'other' {
  const title = (candidate.title ?? '').toLowerCase();
  const hasBrazilian = title.includes('[brazilian]');
  const hasEng = title.includes('[eng]');
  const hasJap = title.includes('[jap]');

  if (hasBrazilian && (hasEng || hasJap)) return 'multi';
  if (hasBrazilian) return 'pt';
  if (hasJap) return 'other';
  if (hasEng) return 'en';

  // Fall back to the "legend" field (audio/subtitle language reported by the scraper).
  const legend = (candidate.legend ?? '').toLowerCase();
  if (legend.includes('português') || legend.includes('portugues')) return 'pt';
  if (legend.includes('inglês') || legend.includes('ingles') || legend.includes('english')) return 'en';

  return 'unknown';
}

// Rejects cam/telesync rips regardless of quality — same rule the old Torrentio parser used.
export function isBrowserCompatibleRelease(candidate: DfindexerCandidate): boolean {
  const src = `${candidate.title ?? ''} ${candidate.magnet_processed ?? ''}`.toLowerCase();
  if (
    src.includes('camrip') || src.includes('cam-rip') || src.includes('hdcam') ||
    src.includes('dcprip') || src.includes('dcp-rip') ||
    src.includes('telesync') || src.includes('telecine') || src.includes('screener')
  ) return false;
  return true;
}
