import type { StreamEntity } from '@/core/entities/stream.entity';
import type { AddonRegistryRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import { AddonUnavailableError } from '@/shared/errors';

interface AddonStreamResponse {
  url: string;
  quality: StreamEntity['quality'];
  codec: StreamEntity['codec'];
  bitrate: number;
  seeds: number;
}

async function fetchStreamsFromAddon(
  addonUrl: string,
  movieId: string,
): Promise<AddonStreamResponse[]> {
  const url = `${addonUrl}/stream/movie/${movieId}.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new AddonUnavailableError(addonUrl);
    const data = await res.json() as { streams?: AddonStreamResponse[] };
    return data.streams ?? [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new AddonUnavailableError(addonUrl);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export class AggregateStreamsUseCase {
  constructor(private readonly addonRepository: AddonRegistryRepository) {}

  async execute(movieId: string): Promise<StreamEntity[]> {
    const addons = await this.addonRepository.findAll(true);
    const results: StreamEntity[] = [];

    const settled = await Promise.allSettled(
      addons.map((addon) => fetchStreamsFromAddon(addon.url, movieId)),
    );

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const addon = addons[index];
        result.value.forEach((s, i) => {
          results.push({
            id: `${addon.id}-${i}`,
            movieId,
            url: s.url,
            quality: s.quality,
            codec: s.codec,
            bitrate: s.bitrate,
            seeds: s.seeds,
            addonSource: addon.name,
          });
        });
      }
    });

    return results;
  }
}
