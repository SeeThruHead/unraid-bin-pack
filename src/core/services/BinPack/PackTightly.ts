import { Effect, Ref } from "effect";
import type { FileEntry } from "@domain/FileEntry";
import type { FileMove } from "@domain/MovePlan";
import { createFileMove } from "@domain/MovePlan";
import type { WorldView } from "@domain/WorldView";
import { applyMove } from "@domain/WorldView";
import { rankDisksByFullness } from "@domain/DiskRanking";
import { applyFileFilters } from "@domain/FileFilter";
import { optimizeMoveChains } from "@domain/MoveOptimization";
import {
  createInitEvent,
  createMoveEvent,
  createFailEvent,
  createNoteEvent,
  type CompactEvent
} from "./CompactEventLogger";

export interface WorldViewSnapshot {
  readonly step: number;
  readonly action: string;
  readonly metadata?: {
    readonly sourceDisk?: string;
    readonly sourceFreeGB?: number;
    readonly targetDisk?: string;
    readonly targetFreeGB?: number;
    readonly movedFile?: string;
    readonly fileSizeMB?: number;
    readonly movedCount?: number;
    readonly totalFilesOnDisk?: number;
    readonly reason?: string;
  };
}

export interface PackTightlyOptions {
  readonly minSpaceBytes: number;
  readonly minFileSizeBytes?: number;
  readonly pathPrefixes?: readonly string[];
  readonly srcDiskPaths?: readonly string[];
  readonly onWorldViewChange?: (snapshot: WorldViewSnapshot) => void;
  readonly onCompactEvent?: (event: CompactEvent) => void;
}

export interface ConsolidationResult {
  readonly moves: ReadonlyArray<FileMove>;
  readonly bytesConsolidated: number;
}

const findBestDestination = (
  file: FileEntry,
  worldView: WorldView,
  sourceDiskPath: string,
  processedDisks: Set<string>,
  minSpaceBytes: number
): string | null => {
  const candidates = worldView.disks
    .filter(
      (disk) =>
        disk.path !== sourceDiskPath &&
        !processedDisks.has(disk.path) &&
        disk.freeBytes - minSpaceBytes >= file.sizeBytes
    )
    .sort((a, b) => a.freeBytes - b.freeBytes);

  return candidates[0]?.path ?? null;
};

export const packTightly = (
  worldView: WorldView,
  options: PackTightlyOptions
): Effect.Effect<ConsolidationResult, never> =>
  Effect.gen(function* () {
    const diskPaths = worldView.disks.map((d) => d.path);

    const stepCounterRef = yield* Ref.make(0);
    const getNextStep = () => Ref.updateAndGet(stepCounterRef, (n) => n + 1);

    options.onCompactEvent?.(createInitEvent(worldView.disks));

    const totalFiles = worldView.files.length;
    const diskSummary = worldView.disks
      .map((d) => `${d.path}: ${(d.freeBytes / 1024 / 1024 / 1024).toFixed(1)}GB free`)
      .join(", ");

    options.onWorldViewChange?.({
      step: 0,
      action: `Start: ${totalFiles} files across ${worldView.disks.length} disks`,
      metadata: {
        reason: diskSummary
      }
    });

    const beforeFilterCount = worldView.files.length;
    const filteredFiles = applyFileFilters(worldView.files, {
      minSizeBytes: options.minFileSizeBytes,
      pathPrefixes: options.pathPrefixes
    });

    const filteredCount = beforeFilterCount - filteredFiles.length;
    if (filteredCount > 0) {
      yield* Effect.logDebug(`Filtered out ${filteredCount} files`);
      options.onWorldViewChange?.({
        step: yield* getNextStep(),
        action: `Filtered ${filteredCount} files (size/path filters)`
      });
    }

    const currentWorldViewRef = yield* Ref.make<WorldView>({
      ...worldView,
      files: filteredFiles
    });

    const processedDisks = new Set<string>();
    const allMoves: FileMove[] = [];

    const srcDiskSet =
      options.srcDiskPaths && options.srcDiskPaths.length > 0
        ? new Set(options.srcDiskPaths)
        : null;

    if (srcDiskSet) {
      yield* Effect.logDebug(`Limiting sources to: ${Array.from(srcDiskSet).join(", ")}`);
    }

    const processDisksRecursively = (): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        const currentWorldView = yield* Ref.get(currentWorldViewRef);

        const rankedDisks = srcDiskSet
          ? rankDisksByFullness(currentWorldView.disks, currentWorldView.files).filter((disk) =>
              srcDiskSet.has(disk.path)
            )
          : rankDisksByFullness(currentWorldView.disks, currentWorldView.files);

        const sourceDisk = rankedDisks.find((disk) => !processedDisks.has(disk.path));

        if (!sourceDisk) {
          yield* Effect.logDebug(
            `\n✓ No more unprocessed disks with files - consolidation complete`
          );
          return;
        }

        const sourceDiskPath = sourceDisk.path;

        yield* Effect.logDebug(
          `\n--- Processing ${sourceDiskPath} (${sourceDisk.usedPct.toFixed(1)}% full, ${(
            sourceDisk.freeBytes /
            1024 /
            1024
          ).toFixed(0)} MB free) ---`
        );

        const filesOnDisk = currentWorldView.files
          .filter((f) => f.diskPath === sourceDiskPath)
          .sort((a, b) => b.sizeBytes - a.sizeBytes);

        yield* Effect.logDebug(
          `  Files on disk: ${
            filesOnDisk
              .map((f) => `${f.relativePath} (${(f.sizeBytes / 1024 / 1024).toFixed(0)} MB)`)
              .join(", ") || "none"
          }`
        );

        const sourceDiskState = currentWorldView.disks.find((d) => d.path === sourceDiskPath);
        if (!sourceDiskState) {
          return yield* Effect.die(`Source disk ${sourceDiskPath} not found in WorldView`);
        }

        options.onCompactEvent?.(
          createNoteEvent(`Processing ${sourceDiskPath}: ${filesOnDisk.length} files`)
        );

        options.onWorldViewChange?.({
          step: yield* getNextStep(),
          action: `Processing ${sourceDiskPath}`,
          metadata: {
            sourceDisk: sourceDiskPath,
            sourceFreeGB: sourceDiskState.freeBytes / 1024 / 1024 / 1024,
            totalFilesOnDisk: filesOnDisk.length,
            reason: `${filesOnDisk.length} files to move (${(
              sourceDiskState.freeBytes /
              1024 /
              1024 /
              1024
            ).toFixed(1)}GB free)`
          }
        });

        const movedCountRef = yield* Ref.make(0);
        const skippedCountRef = yield* Ref.make(0);

        const maxAvailableSpace = Math.max(
          ...currentWorldView.disks
            .filter((d) => d.path !== sourceDiskPath && !processedDisks.has(d.path))
            .map((d) => d.freeBytes - options.minSpaceBytes),
          0
        );

        const processFilesOnDisk = (
          remainingFiles: readonly FileEntry[]
        ): Effect.Effect<void, never> =>
          Effect.gen(function* () {
            const [file, ...restFiles] = remainingFiles;

            if (!file) {
              return;
            }

            if (file.sizeBytes > maxAvailableSpace) {
              yield* Ref.update(skippedCountRef, (n) => n + 1);
              yield* Effect.logDebug(
                `    ⊘ ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(
                  0
                )} MB): Too large for any destination disk`
              );
              yield* processFilesOnDisk(restFiles);
              return;
            }

            const currentWorldViewState = yield* Ref.get(currentWorldViewRef);
            const destination = findBestDestination(
              file,
              currentWorldViewState,
              sourceDiskPath,
              processedDisks,
              options.minSpaceBytes
            );

            if (!destination) {
              yield* Ref.update(skippedCountRef, (n) => n + 1);
              yield* Effect.logDebug(
                `    ⊘ ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(
                  0
                )} MB): Cannot fit anywhere`
              );

              if (options.onWorldViewChange) {
                options.onCompactEvent?.(
                  createFailEvent(
                    file.relativePath,
                    sourceDiskPath,
                    "No destination disk has enough free space",
                    diskPaths
                  )
                );

                options.onWorldViewChange({
                  step: yield* getNextStep(),
                  action: `❌ Can't move ${file.relativePath}`,
                  metadata: {
                    sourceDisk: sourceDiskPath,
                    movedFile: file.relativePath,
                    fileSizeMB: file.sizeBytes / 1024 / 1024,
                    reason: "No destination disk has enough free space"
                  }
                });
              }
              yield* processFilesOnDisk(restFiles);
              return;
            }

            const destDisk = currentWorldViewState.disks.find((d) => d.path === destination);
            if (!destDisk) {
              return yield* Effect.die(`Destination disk ${destination} not found`);
            }
            const destAvailable = destDisk.freeBytes - options.minSpaceBytes;
            yield* Effect.logDebug(
              `    → ${file.relativePath} (${(file.sizeBytes / 1024 / 1024).toFixed(
                0
              )} MB) to ${destination} (has ${(destAvailable / 1024 / 1024).toFixed(
                0
              )} MB available)`
            );

            const move = createFileMove(file, destination);
            allMoves.push(move);
            yield* Ref.update(movedCountRef, (n) => n + 1);

            options.onCompactEvent?.(
              createMoveEvent(
                file.relativePath,
                sourceDiskPath,
                destination,
                file.sizeBytes,
                diskPaths
              )
            );

            const updatedWorldView = applyMove(currentWorldViewState, move);
            yield* Ref.set(currentWorldViewRef, updatedWorldView);

            const updatedSourceDisk = updatedWorldView.disks.find((d) => d.path === sourceDiskPath);
            const updatedTargetDisk = updatedWorldView.disks.find((d) => d.path === destination);
            if (!updatedSourceDisk || !updatedTargetDisk) {
              return yield* Effect.die(
                `Disk not found after move: source=${sourceDiskPath}, dest=${destination}`
              );
            }
            const currentMovedCount = yield* Ref.get(movedCountRef);

            options.onWorldViewChange?.({
              step: yield* getNextStep(),
              action: `✓ ${file.relativePath} → ${destination}`,
              metadata: {
                sourceDisk: sourceDiskPath,
                sourceFreeGB: updatedSourceDisk.freeBytes / 1024 / 1024 / 1024,
                targetDisk: destination,
                targetFreeGB: updatedTargetDisk.freeBytes / 1024 / 1024 / 1024,
                movedFile: file.relativePath,
                fileSizeMB: file.sizeBytes / 1024 / 1024,
                movedCount: currentMovedCount,
                totalFilesOnDisk: filesOnDisk.length
              }
            });

            yield* processFilesOnDisk(restFiles);
          });

        yield* processFilesOnDisk(filesOnDisk);

        const finalMovedCount = yield* Ref.get(movedCountRef);
        const finalSkippedCount = yield* Ref.get(skippedCountRef);

        if (finalMovedCount === filesOnDisk.length && filesOnDisk.length > 0) {
          yield* Effect.logDebug(`  🎉 ${sourceDiskPath} is now EMPTY!`);
        } else if (finalMovedCount > 0) {
          yield* Effect.logDebug(
            `  ⚠ ${sourceDiskPath} partially emptied (${finalMovedCount}/${filesOnDisk.length} moved, ${finalSkippedCount} too large)`
          );
        } else {
          yield* Effect.logDebug(
            `  ❌ No files could be moved from ${sourceDiskPath} (${finalSkippedCount} too large)`
          );
        }

        processedDisks.add(sourceDiskPath);

        const finalWorldView = yield* Ref.get(currentWorldViewRef);
        const finalSourceDisk = finalWorldView.disks.find((d) => d.path === sourceDiskPath);
        if (!finalSourceDisk) {
          return yield* Effect.die(`Source disk ${sourceDiskPath} not found in final WorldView`);
        }
        const isEmpty = finalMovedCount === filesOnDisk.length && filesOnDisk.length > 0;
        const statusEmoji = isEmpty ? "🎉" : finalMovedCount > 0 ? "⚠️" : "❌";
        const statusMsg = isEmpty
          ? `EMPTY!`
          : finalMovedCount > 0
            ? `Partially emptied (${finalMovedCount}/${filesOnDisk.length})`
            : `Nothing moved`;

        options.onWorldViewChange?.({
          step: yield* getNextStep(),
          action: `${statusEmoji} ${sourceDiskPath}: ${statusMsg}`,
          metadata: {
            sourceDisk: sourceDiskPath,
            sourceFreeGB: finalSourceDisk.freeBytes / 1024 / 1024 / 1024,
            movedCount: finalMovedCount,
            totalFilesOnDisk: filesOnDisk.length,
            reason:
              finalMovedCount === 0 && filesOnDisk.length > 0
                ? "No destination disk has enough free space for any files"
                : undefined
          }
        });

        yield* processDisksRecursively();
      });

    yield* processDisksRecursively();

    const optimizedMoves = optimizeMoveChains(allMoves);
    const optimizedCount = allMoves.length - optimizedMoves.length;

    if (optimizedCount > 0) {
      yield* Effect.logDebug(`\n✓ Optimized ${optimizedCount} redundant moves (collapsed chains)`);
    }

    return {
      moves: optimizedMoves,
      bytesConsolidated: optimizedMoves.reduce((sum, m) => sum + m.file.sizeBytes, 0)
    };
  });
