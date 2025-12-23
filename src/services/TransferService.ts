/**
 * TransferService - handles parallel file transfers.
 *
 * This module defines the TransferService interface and provides
 * an rsync-based implementation (RsyncTransferService).
 */

import { Context, Data, Effect, Layer, pipe } from "effect"
import { ShellServiceTag } from "../infra/ShellService"
import type { FileMove, MovePlan } from "../domain/MovePlan"

// =============================================================================
// Service errors - all possible failure modes
// =============================================================================

export class TransferSourceNotFound extends Data.TaggedError("TransferSourceNotFound")<{
  readonly path: string
}> {}

export class TransferSourcePermissionDenied extends Data.TaggedError("TransferSourcePermissionDenied")<{
  readonly path: string
}> {}

export class TransferDestinationPermissionDenied extends Data.TaggedError("TransferDestinationPermissionDenied")<{
  readonly path: string
}> {}

export class TransferDiskFull extends Data.TaggedError("TransferDiskFull")<{
  readonly path: string
}> {}

export class TransferBackendUnavailable extends Data.TaggedError("TransferBackendUnavailable")<{
  readonly reason: string
}> {}

export class TransferFailed extends Data.TaggedError("TransferFailed")<{
  readonly source: string
  readonly destination: string
  readonly reason: string
}> {}

export type TransferError =
  | TransferSourceNotFound
  | TransferSourcePermissionDenied
  | TransferDestinationPermissionDenied
  | TransferDiskFull
  | TransferBackendUnavailable
  | TransferFailed

// =============================================================================
// Types
// =============================================================================

export interface TransferResult {
  readonly move: FileMove
  readonly success: boolean
  readonly error?: string
}

export interface TransferReport {
  readonly results: readonly TransferResult[]
  readonly successful: number
  readonly failed: number
  readonly skipped: number
}

export interface TransferOptions {
  readonly dryRun: boolean
  readonly concurrency: number
  readonly preserveAttrs: boolean
  readonly deleteSource: boolean
  readonly onProgress?: (completed: number, total: number, current: FileMove) => void
}

// =============================================================================
// Service interface
// =============================================================================

export interface TransferService {
  /** Execute all moves from a plan */
  readonly executeAll: (
    plan: MovePlan,
    options: TransferOptions
  ) => Effect.Effect<TransferReport, TransferError>
}

export class TransferServiceTag extends Context.Tag("TransferService")<
  TransferServiceTag,
  TransferService
>() {}

// =============================================================================
// Batch types
// =============================================================================

interface DiskBatch {
  readonly sourceDisk: string
  readonly targetDisk: string
  readonly moves: readonly FileMove[]
  readonly relativePaths: readonly string[]
}

// =============================================================================
// Rsync command generation
// =============================================================================

/**
 * Build a batched rsync command using --files-from.
 * This is more efficient for many files going to the same target disk.
 */
const buildBatchedRsyncCommand = (
  sourceDisk: string,
  targetDisk: string,
  filesFromPath: string,
  options: { preserveAttrs: boolean; deleteSource: boolean; dryRun: boolean }
): string => {
  const flags = [
    "-a", // archive mode
    ...(options.deleteSource && !options.dryRun ? ["--remove-source-files"] : []),
    ...(options.dryRun ? ["--dry-run", "-v"] : []), // verbose for dry-run output
  ]

  // Ensure trailing slashes for directory rsync
  const src = sourceDisk.endsWith("/") ? sourceDisk : `${sourceDisk}/`
  const dst = targetDisk.endsWith("/") ? targetDisk : `${targetDisk}/`

  return `rsync ${flags.join(" ")} --files-from="${filesFromPath}" "${src}" "${dst}"`
}

/**
 * Group moves by target disk for batched transfer.
 */
const groupMovesByTargetDisk = (moves: readonly FileMove[]): DiskBatch[] => {
  const batches = moves.reduce((acc, move) => {
    const target = move.targetDiskPath
    const existing = acc.get(target)
    if (existing) {
      acc.set(target, { moves: [...existing.moves, move], sourceDisk: existing.sourceDisk })
    } else {
      acc.set(target, { moves: [move], sourceDisk: move.file.diskPath })
    }
    return acc
  }, new Map<string, { moves: FileMove[]; sourceDisk: string }>())

  return Array.from(batches.entries()).map(([targetDisk, { moves: batchMoves, sourceDisk }]) => ({
    sourceDisk,
    targetDisk,
    moves: batchMoves,
    relativePaths: batchMoves.map((m) => m.file.relativePath),
  }))
}

// =============================================================================
// Rsync implementation
// =============================================================================

/**
 * RsyncTransferService - TransferService implementation using rsync.
 *
 * Features:
 * - Batched transfers per target disk using --files-from
 * - Parallel execution across target disks
 * - Atomic moves with rsync --remove-source-files
 */
export const RsyncTransferService = Layer.effect(
  TransferServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellServiceTag

    /**
     * Execute a batch of moves to a single target disk using --files-from.
     */
    const executeBatch = (
      batch: DiskBatch,
      options: TransferOptions
    ): Effect.Effect<TransferResult[], never> => {
      // Create temp file with relative paths
      const tempFile = `/tmp/rsync-files-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
      const filesContent = batch.relativePaths.join("\n")

      return pipe(
        // Write files-from list
        shell.exec(`cat > "${tempFile}" << 'EOF'\n${filesContent}\nEOF`),
        Effect.flatMap(() => {
          const command = buildBatchedRsyncCommand(
            batch.sourceDisk,
            batch.targetDisk,
            tempFile,
            {
              preserveAttrs: options.preserveAttrs,
              deleteSource: options.deleteSource,
              dryRun: options.dryRun,
            }
          )

          return shell.exec(command)
        }),
        Effect.flatMap((result) => {
          // Clean up temp file
          return pipe(
            shell.exec(`rm -f "${tempFile}"`),
            Effect.map(() => result)
          )
        }),
        Effect.map((result): TransferResult[] => {
          if (result.exitCode !== 0) {
            // Batch failed - mark all moves as failed
            return batch.moves.map((move) => ({
              move,
              success: false,
              error: `rsync batch failed (exit ${result.exitCode}): ${result.stderr}`,
            }))
          }

          // Batch succeeded - mark all moves as successful
          return batch.moves.map((move) => ({
            move,
            success: true,
          }))
        }),
        Effect.catchAll((e) =>
          Effect.succeed(
            batch.moves.map((move) => ({
              move,
              success: false,
              error: e.message,
            }))
          )
        )
      )
    }

    const executeAll: TransferService["executeAll"] = (plan, options) => {
      const pendingMoves = plan.moves.filter((m) => m.status === "pending")
      const skippedMoves = plan.moves.filter((m) => m.status === "skipped")

      // In dry-run mode, just return preview results without executing
      if (options.dryRun) {
        const results: TransferResult[] = [
          ...pendingMoves.map((move) => ({
            move,
            success: true, // Would succeed (dry-run)
          })),
          ...skippedMoves.map((move) => ({
            move,
            success: false,
            error: move.reason,
          })),
        ]

        return Effect.succeed({
          results,
          successful: pendingMoves.length,
          failed: 0,
          skipped: skippedMoves.length,
        } as TransferReport)
      }

      if (pendingMoves.length === 0) {
        return Effect.succeed({
          results: skippedMoves.map((move) => ({
            move,
            success: false,
            error: move.reason,
          })),
          successful: 0,
          failed: 0,
          skipped: skippedMoves.length,
        } as TransferReport)
      }

      // Group moves by target disk for batched transfer
      const batches = groupMovesByTargetDisk(pendingMoves)

      // Execute batches in parallel (one per target disk)
      return pipe(
        Effect.forEach(batches, (batch) => executeBatch(batch, options), {
          concurrency: options.concurrency,
        }),
        Effect.map((batchResults): TransferReport => {
          // Flatten batch results
          const pendingResults = batchResults.flat()

          // Call progress callback for completed moves
          if (options.onProgress) {
            const completed = pendingResults.length
            const total = pendingMoves.length
            const lastMove = pendingMoves[pendingMoves.length - 1]
            if (lastMove) {
              options.onProgress(completed, total, lastMove)
            }
          }

          const skippedResults: TransferResult[] = skippedMoves.map((move) => ({
            move,
            success: false,
            error: move.reason,
          }))

          const allResults = [...pendingResults, ...skippedResults]
          const successful = pendingResults.filter((r) => r.success).length
          const failed = pendingResults.filter((r) => !r.success).length

          return {
            results: allResults,
            successful,
            failed,
            skipped: skippedMoves.length,
          }
        })
      )
    }

    return { executeAll }
  })
)
