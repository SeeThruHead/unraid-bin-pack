import type { FileEntry } from "./FileEntry"

export interface FolderGroup {
  readonly folderPath: string
  readonly files: readonly FileEntry[]
  readonly totalBytes: number
  readonly largestFileBytes: number
  readonly keepTogether: boolean
}

export interface FolderGroupOptions {
  readonly minSplitSizeBytes: number
  readonly folderThreshold: number
}

const DEFAULT_OPTIONS: FolderGroupOptions = {
  minSplitSizeBytes: 1024 * 1024 * 1024,
  folderThreshold: 0.9,
}

export const groupByImmediateFolder = (
  files: readonly FileEntry[],
  options: FolderGroupOptions = DEFAULT_OPTIONS
): FolderGroup[] => {
  const groups = files.reduce((acc, file) => {
    const lastSlash = file.relativePath.lastIndexOf("/")
    const folder = lastSlash === -1 ? "" : file.relativePath.slice(0, lastSlash)
    const existing = acc.get(folder) ?? []
    acc.set(folder, [...existing, file])
    return acc
  }, new Map<string, FileEntry[]>())

  return Array.from(groups.entries()).map(([folderPath, folderFiles]) => {
    const totalBytes = folderFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
    const largestFileBytes = Math.max(...folderFiles.map((f) => f.sizeBytes))

    const keepTogether =
      totalBytes < options.minSplitSizeBytes ||
      largestFileBytes / totalBytes >= options.folderThreshold

    return {
      folderPath,
      files: folderFiles,
      totalBytes,
      largestFileBytes,
      keepTogether,
    }
  })
}

export const groupByTopLevelFolder = (files: readonly FileEntry[]): FolderGroup[] => {
  const groups = files.reduce((acc, file) => {
    const firstSlash = file.relativePath.indexOf("/")
    const folder = firstSlash === -1 ? "" : file.relativePath.slice(0, firstSlash)
    const existing = acc.get(folder) ?? []
    acc.set(folder, [...existing, file])
    return acc
  }, new Map<string, FileEntry[]>())

  return Array.from(groups.entries()).map(([folderPath, folderFiles]) => {
    const totalBytes = folderFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
    const largestFileBytes = Math.max(...folderFiles.map((f) => f.sizeBytes))
    return {
      folderPath,
      files: folderFiles,
      totalBytes,
      largestFileBytes,
      keepTogether: true,
    }
  })
}

export const sortBySize = (folders: readonly FolderGroup[]): FolderGroup[] =>
  [...folders].sort((a, b) => b.totalBytes - a.totalBytes)
