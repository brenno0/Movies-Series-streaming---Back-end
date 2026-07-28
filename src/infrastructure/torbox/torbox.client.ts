// Verified live against the TorBox API (endpoint paths, form fields, and response
// shapes below all match what the real API returns — checked 2026-07-28).
//
// TorBox's cache is much smaller than Real-Debrid's: an uncached magnet can sit in
// "metaDL" (still resolving metadata, before any actual download progress) for way
// longer than RD's equivalent wait. Polling budget here is intentionally short —
// if TorBox hasn't produced a cached/finished torrent quickly, DebridResolver falls
// back to Real-Debrid rather than blocking the request on a slow cold TorBox fetch.
import { redis } from '@/infrastructure/cache/redis';

import type { TorBoxCreateTorrentResponse, TorBoxFile, TorBoxMyListResponse, TorBoxRequestDlResponse, TorBoxTorrentInfo } from './torbox.types';

const API_BASE = 'https://api.torbox.app/v1/api';
const POLL_ATTEMPTS = 4;
const POLL_INTERVAL_MS = 3000;
const LINK_CACHE_TTL_SECONDS = 4 * 60 * 60;
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];
const FAILED_STATES = new Set(['error', 'failed', 'stalled (no seeds)', 'stalled']);

function cacheKey(infoHash: string): string {
  return `torbox:link:${infoHash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function pickFile(files: TorBoxFile[], episodeHint?: { season: number; episode: number }): TorBoxFile | null {
  const videoFiles = files.filter((f) => isVideoFile(f.short_name || f.name));
  if (videoFiles.length === 0) return null;

  if (episodeHint) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const pattern = new RegExp(`s${pad(episodeHint.season)}e${pad(episodeHint.episode)}`, 'i');
    const matched = videoFiles.filter((f) => pattern.test(f.short_name || f.name));
    if (matched.length > 0) return matched.reduce((a, b) => (b.size > a.size ? b : a));
  }

  return videoFiles.reduce((a, b) => (b.size > a.size ? b : a));
}

export class TorBoxClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`TorBox API error ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  async createTorrent(magnet: string): Promise<{ torrentId: number }> {
    const body = new FormData();
    body.append('magnet', magnet);
    body.append('seed', '1');
    const data = await this.request<TorBoxCreateTorrentResponse>('/torrents/createtorrent', { method: 'POST', body });
    return { torrentId: data.data.torrent_id };
  }

  async getTorrentInfo(torrentId: number): Promise<TorBoxTorrentInfo | null> {
    const data = await this.request<TorBoxMyListResponse>(`/torrents/mylist?bypass_cache=true&id=${torrentId}`);
    const info = Array.isArray(data.data) ? data.data[0] : data.data;
    return info ?? null;
  }

  async requestDownloadLink(torrentId: number, fileId: number): Promise<string> {
    const data = await this.request<TorBoxRequestDlResponse>(
      `/torrents/requestdl?token=${this.apiKey}&torrent_id=${torrentId}&file_id=${fileId}&zip_link=false`,
    );
    return data.data;
  }

  async resolveMagnetToUrl(
    magnet: string,
    infoHash: string,
    episodeHint?: { season: number; episode: number },
  ): Promise<{ url: string; filename: string; container: 'mp4' | 'mkv' } | null> {
    try {
      const cached = await redis.get(cacheKey(infoHash));
      if (cached) return JSON.parse(cached) as { url: string; filename: string; container: 'mp4' | 'mkv' };

      const { torrentId } = await this.createTorrent(magnet);
      let info: TorBoxTorrentInfo | null = null;

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        info = await this.getTorrentInfo(torrentId);
        if (!info) return null;
        if (info.download_finished && info.files.length > 0) break;
        if (FAILED_STATES.has(info.download_state)) return null;
        await sleep(POLL_INTERVAL_MS);
      }

      if (!info || !info.download_finished || info.files.length === 0) return null;

      const file = pickFile(info.files, episodeHint);
      if (!file) return null;

      const url = await this.requestDownloadLink(torrentId, file.id);
      const filename = file.short_name || file.name;
      const container: 'mp4' | 'mkv' = filename.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mkv';
      const result = { url, filename, container };

      await redis.set(cacheKey(infoHash), JSON.stringify(result), 'EX', LINK_CACHE_TTL_SECONDS);
      return result;
    } catch {
      return null;
    }
  }
}
