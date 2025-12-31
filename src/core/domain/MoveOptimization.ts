import type { FileMove } from "./MovePlan";

export const optimizeMoveChains = (moves: readonly FileMove[]): readonly FileMove[] => {
  const destToSource = new Map<string, string>();
  const sourceToDest = new Map<string, string>();

  for (const move of moves) {
    if (move.status === "pending") {
      destToSource.set(move.destinationPath, move.file.absolutePath);
      sourceToDest.set(move.file.absolutePath, move.destinationPath);
    }
  }

  const withResolvedSources = moves.map((move) => {
    if (move.status !== "pending") return move;

    const originalSource = destToSource.get(move.file.absolutePath);

    if (originalSource) {
      const originalDiskPath = originalSource.match(/^(\/mnt\/disk\d+)/)?.[1] ?? move.file.diskPath;

      return {
        ...move,
        file: {
          ...move.file,
          absolutePath: originalSource,
          diskPath: originalDiskPath
        }
      };
    }

    return move;
  });

  const withoutRedundantMoves = withResolvedSources.filter((move) => {
    if (move.status !== "pending") return true;

    if (sourceToDest.has(move.destinationPath)) return false;

    const sourceDisk = move.file.diskPath;
    const targetDisk = move.targetDiskPath;
    if (sourceDisk === targetDisk) return false;

    return true;
  });

  return withoutRedundantMoves;
};
