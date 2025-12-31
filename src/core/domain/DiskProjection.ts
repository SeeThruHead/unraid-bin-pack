import type { FileMove } from "./MovePlan";

export interface DiskSnapshot {
  readonly path: string;
  readonly totalBytes: number;
  readonly freeBytes: number;
}

export interface DiskProjectionResult {
  readonly initial: readonly DiskSnapshot[];
  readonly final: readonly DiskSnapshot[];
  readonly evacuatedCount: number;
}

const calculateDiskFreeChanges = (moves: readonly FileMove[]): Map<string, number> => {
  const changes = new Map<string, number>();

  for (const move of moves) {
    const sourceDisk = move.file.diskPath;
    const targetDisk = move.targetDiskPath;

    changes.set(sourceDisk, (changes.get(sourceDisk) ?? 0) + move.file.sizeBytes);
    changes.set(targetDisk, (changes.get(targetDisk) ?? 0) - move.file.sizeBytes);
  }

  return changes;
};

const applyChangesToDisks = (
  disks: readonly DiskSnapshot[],
  changes: Map<string, number>
): readonly DiskSnapshot[] =>
  disks.map((disk) => ({
    ...disk,
    freeBytes: disk.freeBytes + (changes.get(disk.path) ?? 0)
  }));

const countEvacuatedDisks = (
  initial: readonly DiskSnapshot[],
  final: readonly DiskSnapshot[]
): number => {
  return initial.filter((initialDisk) => {
    const finalDisk = final.find((d) => d.path === initialDisk.path);
    if (!finalDisk) return false;

    const initialUsed = initialDisk.totalBytes - initialDisk.freeBytes;
    const finalUsed = finalDisk.totalBytes - finalDisk.freeBytes;

    return initialUsed > 0 && finalUsed === 0;
  }).length;
};

export const projectDiskStates = (
  initialDisks: readonly DiskSnapshot[],
  moves: readonly FileMove[]
): DiskProjectionResult => {
  const changes = calculateDiskFreeChanges(moves);
  const finalDisks = applyChangesToDisks(initialDisks, changes);
  const evacuatedCount = countEvacuatedDisks(initialDisks, finalDisks);

  return {
    initial: initialDisks,
    final: finalDisks,
    evacuatedCount
  };
};
