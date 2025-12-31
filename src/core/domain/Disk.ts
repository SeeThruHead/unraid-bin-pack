export interface Disk {
  readonly path: string;
  readonly totalBytes: number;
  readonly freeBytes: number;
}

export type DiskStats = Disk;

export const usedBytes = (disk: Disk): number => disk.totalBytes - disk.freeBytes;

export const usagePercent = (disk: Disk): number =>
  disk.totalBytes === 0 ? 0 : (usedBytes(disk) / disk.totalBytes) * 100;

export const canFit = (disk: Disk, bytes: number, threshold: number): boolean =>
  disk.freeBytes - bytes >= threshold;
