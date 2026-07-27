import { redis } from '@/infrastructure/cache/redis';

import type { RdTorrentFile, RdTorrentInfo, RdUnrestrictedLink } from './real-debrid.types';

const API_BASE = 'https://api.real-debrid.com/rest/1.0';
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 3000;
const LINK_CACHE_TTL_SECONDS = 4 * 60 * 60; // RD unrestricted links expire — same TTL the old proxy cache used
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi'];

function cacheKey(infoHash: string): string {
  return `rd:link:${infoHash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function pickFile(files: RdTorrentFile[], episodeHint?: { season: number; episode: number }): RdTorrentFile | null {
  const videoFiles = files.filter((f) => isVideoFile(f.path));
  if (videoFiles.length === 0) return null;

  if (episodeHint) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const pattern = new RegExp(`s${pad(episodeHint.season)}e${pad(episodeHint.episode)}`, 'i');
    const matched = videoFiles.filter((f) => pattern.test(f.path));
    if (matched.length > 0) {
      return matched.reduce((a, b) => (b.bytes > a.bytes ? b : a));
    }
  }

  return videoFiles.reduce((a, b) => (b.bytes > a.bytes ? b : a));
}

export class RealDebridClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Real-Debrid API error ${res.status} on ${path}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async addMagnet(magnet: string): Promise<{ id: string }> {
    const body = new URLSearchParams({ magnet });
    return this.request<{ id: string }>('/torrents/addMagnet', { method: 'POST', body });
  }

  async selectFiles(torrentId: string, fileIds: string[]): Promise<void> {
    const body = new URLSearchParams({ files: fileIds.join(',') });
    await this.request<void>(`/torrents/selectFiles/${torrentId}`, { method: 'POST', body });
  }

  async getTorrentInfo(torrentId: string): Promise<RdTorrentInfo> {
    return this.request<RdTorrentInfo>(`/torrents/info/${torrentId}`);
  }

  async unrestrictLink(link: string): Promise<RdUnrestrictedLink> {
    const body = new URLSearchParams({ link });
    return this.request<RdUnrestrictedLink>('/unrestrict/link', { method: 'POST', body });
  }

  async resolveMagnetToUrl(
    magnet: string,
    infoHash: string,
    episodeHint?: { season: number; episode: number },
  ): Promise<{ url: string; filename: string; container: 'mp4' | 'mkv' } | null> {
    const cached = await redis.get(cacheKey(infoHash));
    if (cached) return JSON.parse(cached) as { url: string; filename: string; container: 'mp4' | 'mkv' };

    try {
      const { id } = await this.addMagnet(magnet);
      let info = await this.getTorrentInfo(id);

      if (info.status === 'waiting_files_selection') {
        const file = pickFile(info.files, episodeHint);
        if (!file) return null;
        await this.selectFiles(id, [String(file.id)]);
      }

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        info = await this.getTorrentInfo(id);
        if (info.status === 'downloaded' && info.links.length > 0) break;
        if (info.status === 'error' || info.status === 'dead' || info.status === 'virus' || info.status === 'magnet_error') return null;
        await sleep(POLL_INTERVAL_MS);
      }

      if (info.status !== 'downloaded' || info.links.length === 0) return null;

      const unrestricted = await this.unrestrictLink(info.links[0]);
      const container: 'mp4' | 'mkv' = unrestricted.filename.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mkv';
      const result = { url: unrestricted.download, filename: unrestricted.filename, container };

      await redis.set(cacheKey(infoHash), JSON.stringify(result), 'EX', LINK_CACHE_TTL_SECONDS);
      return result;
    } catch {
      return null;
    }
  }
}
