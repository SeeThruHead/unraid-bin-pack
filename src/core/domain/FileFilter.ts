import type { FileEntry } from "./FileEntry";

export interface FileFilterCriteria {
  readonly minSizeBytes?: number;
  readonly pathPrefixes?: readonly string[];
}

export const filterFilesBySize = (
  files: readonly FileEntry[],
  minSizeBytes: number
): readonly FileEntry[] => files.filter((file) => file.sizeBytes >= minSizeBytes);

export const filterFilesByPathPrefix = (
  files: readonly FileEntry[],
  pathPrefixes: readonly string[]
): readonly FileEntry[] =>
  files.filter((file) =>
    pathPrefixes.some((prefix) => {
      const diskMatch = file.absolutePath.match(/^\/mnt\/disk\d+(.*)$/);
      if (diskMatch?.[1]) {
        return diskMatch[1].startsWith(prefix);
      }
      return file.absolutePath.startsWith(prefix);
    })
  );

export const applyFileFilters = (
  files: readonly FileEntry[],
  criteria: FileFilterCriteria
): readonly FileEntry[] => {
  const afterSizeFilter =
    criteria.minSizeBytes && criteria.minSizeBytes > 0
      ? filterFilesBySize(files, criteria.minSizeBytes)
      : files;

  const afterPathFilter =
    criteria.pathPrefixes && criteria.pathPrefixes.length > 0
      ? filterFilesByPathPrefix(afterSizeFilter, criteria.pathPrefixes)
      : afterSizeFilter;

  return afterPathFilter;
};
