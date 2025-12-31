export interface FileEntry {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly diskPath: string;
}

export const destinationPath = (file: FileEntry, destDiskPath: string): string =>
  `${destDiskPath}/${file.relativePath}`;
