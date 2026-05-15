export type Resolution = '4K' | '1080p' | '720p' | '480p';
export type Codec = 'h264' | 'hevc' | 'av1';

export interface StreamMetadata {
  resolution: Resolution;
  codec: Codec;
  bitrate: number;
  duration?: number;
}

const RESOLUTION_SCORE: Record<Resolution, number> = {
  '4K': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
};

const CODEC_SCORE: Record<Codec, number> = {
  av1: 3,
  hevc: 2,
  h264: 1,
};

export function resolutionScore(r: Resolution): number {
  return RESOLUTION_SCORE[r];
}

export function codecScore(c: Codec): number {
  return CODEC_SCORE[c];
}
