import fs from 'fs/promises';
import path from 'path';

import { env } from '@/env';

export async function saveChunk(filePath: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export async function deleteChunk(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => {});
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function getDiskUsagePercent(): Promise<number> {
  const { default: checkDiskSpace } = await import('check-disk-space');
  const disk = await checkDiskSpace(env.STORAGE_PATH ?? '/');
  return Math.round(((disk.size - disk.free) / disk.size) * 100);
}

export function hlsOutputPath(movieId: string): string {
  return path.join(env.STORAGE_PATH ?? '/tmp/nbflix', movieId);
}

export function hlsPlaylistPath(movieId: string): string {
  return path.join(hlsOutputPath(movieId), 'index.m3u8');
}
