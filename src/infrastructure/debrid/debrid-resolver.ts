import type { RealDebridClient } from '@/infrastructure/real-debrid/real-debrid.client';
import type { TorBoxClient } from '@/infrastructure/torbox/torbox.client';

export interface ResolvedMagnet {
  url: string;
  filename: string;
  container: 'mp4' | 'mkv';
}

// Tries TorBox first (looser DMCA-hash filtering per user's own testing), falls
// back to Real-Debrid when TorBox has nothing for this magnet — either because
// it's not configured (no TORBOX_API_KEY) or because it returned null.
export class DebridResolver {
  constructor(
    private readonly torBoxClient: TorBoxClient | null,
    private readonly realDebridClient: RealDebridClient,
  ) {}

  async resolveMagnetToUrl(
    magnet: string,
    infoHash: string,
    episodeHint?: { season: number; episode: number },
  ): Promise<ResolvedMagnet | null> {
    if (this.torBoxClient) {
      const result = await this.torBoxClient.resolveMagnetToUrl(magnet, infoHash, episodeHint);
      if (result) return result;
    }

    return this.realDebridClient.resolveMagnetToUrl(magnet, infoHash, episodeHint);
  }
}
