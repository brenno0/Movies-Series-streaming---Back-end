import type { StreamEntity } from '@/core/entities/stream.entity';
import type { AddonRegistryRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import type { SeriesRepository } from '@/infrastructure/database/repositories/series.repository';
import { AddonUnavailableError, ResourceNotFoundError } from '@/shared/errors';

interface TorrentioStream {
  name?: string;
  title?: string;
  url?: string;
  behaviorHints?: { filename?: string; bingeGroup?: string };
}

function parseQuality(name: string, filename: string): StreamEntity['quality'] {
  const src = `${name} ${filename}`.toLowerCase();
  if (src.includes('2160p') || src.includes('4k') || src.includes('uhd')) return '4K';
  if (src.includes('1080p')) return '1080p';
  if (src.includes('720p')) return '720p';
  return '480p';
}

function parseCodec(filename: string): StreamEntity['codec'] {
  const f = filename.toLowerCase();
  if (f.includes('av1')) return 'av1';
  if (f.includes('hevc') || f.includes('h265') || f.includes('x265')) return 'hevc';
  return 'h264';
}

function parseSeeds(title: string): number {
  const match = title.match(/👤\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseAudio(filename: string, name = '', title = ''): 'aac' | 'ac3' | 'dts' | 'unknown' {
  const lower = `${name} ${title} ${filename}`.toLowerCase();
  if (lower.includes('truehd') || lower.includes('atmos')) return 'dts';
  if (lower.includes('dts')) return 'dts';
  if (lower.includes('eac3') || lower.includes('ddp') || lower.includes('dd+')) return 'ac3';
  if (/\bdd[257][\.\s]?[012]\b/.test(lower) && !lower.includes('aac')) return 'ac3';
  if (lower.includes('ac3') || lower.includes('dolby digital')) return 'ac3';
  if (lower.includes('aac')) return 'aac';
  if (/\b[57]\.1\b/.test(lower) && !lower.includes('aac')) return 'ac3';
  return 'unknown';
}

function parseLanguage(name: string, title: string, filename: string): StreamEntity['language'] {
  const raw = `${name} ${title} ${filename}`;
  const src = raw.toLowerCase();
  if (
    src.includes('dublado') || src.includes('pt-br') || src.includes('ptbr') ||
    src.includes('português') || src.includes('portugues') || src.includes('[pt]') ||
    src.includes('(pt)') || src.includes('.pt.') ||
    raw.includes('🇧🇷') || raw.includes('🇵🇹')
  ) return 'pt';
  if (src.includes('dual.audio') || src.includes('multi')) return 'multi';
  // dual without PT context = likely ES/LAT dual audio, treat as other
  if (src.includes('dual') && !src.includes('dublado') && !src.includes('pt-br') && !src.includes('ptbr')) return 'other';
  if (src.includes('dual')) return 'multi';
  if (/[Ѐ-ӿ]/.test(raw)) return 'other';
  if (
    src.includes('dubbing.pl') || src.includes('[pl]') || src.includes('(pl)') || src.includes('lektor') ||
    src.includes('deutsch') || src.includes('[de]') || src.includes('(de)') ||
    src.includes('castellano') || src.includes('español') || src.includes('[es]') || src.includes('(es)') ||
    src.includes('truefrench') || src.includes('[fr]') || src.includes('(fr)') ||
    src.includes('italiano') || src.includes('[it]') || src.includes('(it)') ||
    src.includes('turkish') || src.includes('[tr]') || src.includes('(tr)') ||
    src.includes('arabic') || src.includes('[ar]') ||
    src.includes('korean') || src.includes('[ko]') ||
    src.includes('japanese') || src.includes('[ja]') ||
    src.includes('[hr]') || src.includes('(hr)') || src.includes('[sr]') || src.includes('(sr)') ||
    src.includes('[cs]') || src.includes('[sk]') || src.includes('[hu]') || src.includes('[ro]') ||
    src.includes('lektor') || src.includes('napisy') || src.includes('skakutavci')
  ) return 'other';
  return 'unknown';
}

function isBrowserCompatible(name: string, title: string, filename: string): boolean {
  const src = `${name} ${title} ${filename}`.toLowerCase();
  if (src.includes('camrip') || src.includes('cam-rip') || src.includes('hdcam') ||
      src.includes('dcprip') || src.includes('dcp-rip') || / dcp /i.test(` ${src} `) ||
      src.includes('line audio') || src.includes('telesync') || src.includes('telecine') ||
      src.includes('screener') || src.includes('ts ') || / ts\./i.test(src)) return false;
  const lower = filename.toLowerCase().replace(/([hx])\.26([45])/g, '$126$2');
  if (!lower.endsWith('.mp4') && !lower.endsWith('.mkv')) return false;
  const isHevc = lower.includes('hevc') || lower.includes('h265') || lower.includes('x265');
  const isH264 = lower.includes('h264') || lower.includes('x264') || lower.includes('avc');
  if (isHevc && !isH264) return false;
  const is4K = lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd');
  if (is4K && !isH264) return false;
  const audio = parseAudio(filename, name, title);
  if (audio === 'ac3' || audio === 'dts') return false;
  const isPtBr = lower.includes('dublado') || lower.includes('pt-br') || lower.includes('ptbr');
  if (lower.endsWith('.mkv') && audio !== 'aac' && !isPtBr) return false;
  return true;
}

async function fetchStreamsFromAddon(
  addonUrl: string,
  imdbId: string,
  season: number,
  episode: number,
): Promise<TorrentioStream[]> {
  const url = `${addonUrl}/stream/series/${imdbId}:${season}:${episode}.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new AddonUnavailableError(addonUrl);
    const data = await res.json() as { streams?: TorrentioStream[] };
    return data.streams ?? [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new AddonUnavailableError(addonUrl);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export class AggregateSeriesStreamsUseCase {
  constructor(
    private readonly addonRepository: AddonRegistryRepository,
    private readonly seriesRepository: SeriesRepository,
  ) {}

  async execute(seriesId: string, season: number, episode: number): Promise<StreamEntity[]> {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) throw new ResourceNotFoundError({ resource: 'Series' });
    if (!series.imdbId) throw new ResourceNotFoundError({ resource: 'Series IMDB ID' });

    const addons = await this.addonRepository.findAll(true);
    const results: StreamEntity[] = [];

    const settled = await Promise.allSettled(
      addons.map((addon) => fetchStreamsFromAddon(addon.url, series.imdbId!, season, episode)),
    );

    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const addon = addons[index];

      result.value.forEach((s, i) => {
        if (!s.url) return;
        const filename = s.behaviorHints?.filename ?? '';
        const name = s.name ?? '';
        const title = s.title ?? '';
        if (!isBrowserCompatible(name, title, filename)) return;

        results.push({
          id: `${addon.id}-${i}`,
          movieId: seriesId,
          url: s.url,
          quality: parseQuality(name, filename),
          codec: parseCodec(filename),
          container: filename.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mkv',
          audio: parseAudio(filename),
          language: parseLanguage(name, title, filename),
          bitrate: 0,
          seeds: parseSeeds(title),
          addonSource: addon.name,
        });
      });
    });

    return results;
  }
}
