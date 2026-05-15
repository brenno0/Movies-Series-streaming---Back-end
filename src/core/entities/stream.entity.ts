export interface StreamEntity {
  id: string;
  movieId: string;
  url: string;
  quality: '4K' | '1080p' | '720p' | '480p';
  codec: 'h264' | 'hevc' | 'av1';
  bitrate: number;
  seeds: number;
  addonSource: string;
  score?: number;
}
