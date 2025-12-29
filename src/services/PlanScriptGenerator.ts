/**
 * PlanScriptGenerator - generates executable bash scripts for file moves
 *
 * Instead of storing plans in SQLite, we generate a bash script with rsync commands.
 * Benefits:
 * - Human readable and auditable
 * - No domain-specific knowledge needed (just rsync)
 * - Resume works naturally (rsync is idempotent)
 * - Version control friendly
 * - Can be edited manually if needed
 */

import { Effect } from "effect"
import type { FileMove } from "../domain/MovePlan"
import type { DiskStats } from "../domain/Disk"

// =============================================================================
// Types
// =============================================================================

export interface PlanScriptOptions {
  readonly moves: readonly FileMove[]
  readonly sourceDisk: string
  readonly diskStats: Record<string, DiskStats>
  readonly concurrency: number
}

interface Batch {
  readonly sourceDisk: string
  readonly targetDisk: string
  readonly files: readonly string[] // relative paths
  readonly sizeBytes: number
}

// =============================================================================
// Batch grouping
// =============================================================================

/**
 * Group moves by target disk for batched rsync commands
 */
const groupByTargetDisk = (moves: readonly FileMove[]): Batch[] => {
  const batches = new Map<string, { files: string[]; sizeBytes: number; sourceDisk: string }>()

  for (const move of moves) {
    if (move.status !== "pending") continue

    const target = move.targetDiskPath
    const existing = batches.get(target)

    if (existing) {
      existing.files.push(move.file.relativePath)
      existing.sizeBytes += move.file.sizeBytes
    } else {
      batches.set(target, {
        files: [move.file.relativePath],
        sizeBytes: move.file.sizeBytes,
        sourceDisk: move.file.diskPath,
      })
    }
  }

  return Array.from(batches.entries()).map(([targetDisk, { files, sizeBytes, sourceDisk }]) => ({
    sourceDisk,
    targetDisk,
    files,
    sizeBytes,
  }))
}

// =============================================================================
// Script generation
// =============================================================================

/**
 * Format bytes as human readable size
 */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/**
 * Generate bash script header with metadata
 */
const generateHeader = (options: PlanScriptOptions): string => {
  const pendingMoves = options.moves.filter((m) => m.status === "pending")
  const totalBytes = pendingMoves.reduce((sum, m) => sum + m.file.sizeBytes, 0)
  const now = new Date().toISOString().split("T")[0]

  return `#!/bin/bash
#
# Unraid Bin-Pack Plan
# Generated: ${now}
#
# Source disk: ${options.sourceDisk}
# Total files: ${pendingMoves.length}
# Total size: ${formatBytes(totalBytes)}
# Concurrency: ${options.concurrency}
#

set -e  # Exit on error

`
}

/**
 * Generate rsync command for a batch
 */
const generateBatchCommand = (batch: Batch, index: number): string => {
  const src = batch.sourceDisk.endsWith("/") ? batch.sourceDisk : `${batch.sourceDisk}/`
  const dst = batch.targetDisk.endsWith("/") ? batch.targetDisk : `${batch.targetDisk}/`

  const fileList = batch.files.join("\n")

  return `# Batch ${index + 1}: ${batch.sourceDisk} -> ${batch.targetDisk} (${batch.files.length} files, ${formatBytes(batch.sizeBytes)})
rsync -a --remove-source-files --files-from=<(cat <<'EOF'
${fileList}
EOF
) "${src}" "${dst}" &

`
}

/**
 * Generate the complete bash script
 */
export const generate = (options: PlanScriptOptions): Effect.Effect<string> =>
  Effect.sync(() => {
    const batches = groupByTargetDisk(options.moves)

    if (batches.length === 0) {
      return `#!/bin/bash
# No pending moves
exit 0
`
    }

    let script = generateHeader(options)

    // Generate rsync commands for each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      if (!batch) continue
      script += generateBatchCommand(batch, i)
    }

    // Add wait to synchronize all background processes
    script += "wait\n"

    return script
  })

// =============================================================================
// Public API
// =============================================================================

export const PlanScriptGenerator = {
  generate,
}
