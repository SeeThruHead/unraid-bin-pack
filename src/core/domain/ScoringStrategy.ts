import type { FileEntry } from "./FileEntry";

export interface ScoredCandidate {
  readonly files: readonly FileEntry[];
  readonly totalBytes: number;
  readonly targetDisk: string;
  readonly wastedSpace: number;
  readonly score: number;
}

export const calculateUtilizationScore = (totalBytes: number, availableBytes: number): number =>
  totalBytes / availableBytes;

export const scoreCombination = (
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string
): ScoredCandidate => {
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const wastedSpace = availableBytes - totalBytes;
  const score = calculateUtilizationScore(totalBytes, availableBytes);

  return {
    files,
    totalBytes,
    targetDisk,
    wastedSpace,
    score
  };
};

export const findBestScored = (candidates: readonly ScoredCandidate[]): ScoredCandidate | null =>
  candidates.length === 0
    ? null
    : candidates.reduce((best, current) => (current.score > best.score ? current : best));
