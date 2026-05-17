export interface StreamEntity {
  id: string;
  movieId: string;
  url: string;
  quality: '4K' | '1080p' | '720p' | '480p';
  codec: 'h264' | 'hevc' | 'av1';
  container: 'mp4' | 'mkv';
  audio: 'aac' | 'ac3' | 'dts' | 'unknown';
  language: 'pt' | 'en' | 'multi' | 'unknown' | 'other';
  bitrate: number;
  seeds: number;
  addonSource: string;
  score?: number;
}
