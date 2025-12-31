import { Effect, Layer } from "effect";
import type { FileMove } from "@domain/MovePlan";
import {
  PlanGeneratorServiceTag,
  type PlanGeneratorOptions
} from "../PlanGenerator/PlanGeneratorService";

interface Batch {
  readonly sourceDisk: string;
  readonly targetDisk: string;
  readonly files: readonly string[];
  readonly sizeBytes: number;
}

const groupByTargetDisk = (moves: readonly FileMove[]): Batch[] => {
  const batches = new Map<string, { files: string[]; sizeBytes: number; sourceDisk: string }>();

  for (const move of moves) {
    if (move.status !== "pending") continue;

    const target = move.targetDiskPath;
    const existing = batches.get(target);

    if (existing) {
      existing.files.push(move.file.relativePath);
      existing.sizeBytes += move.file.sizeBytes;
    } else {
      batches.set(target, {
        files: [move.file.relativePath],
        sizeBytes: move.file.sizeBytes,
        sourceDisk: move.file.diskPath
      });
    }
  }

  return Array.from(batches.entries()).map(([targetDisk, { files, sizeBytes, sourceDisk }]) => ({
    sourceDisk,
    targetDisk,
    files,
    sizeBytes
  }));
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const generateHeader = (options: PlanGeneratorOptions): string => {
  const pendingMoves = options.moves.filter((m) => m.status === "pending");
  const totalBytes = pendingMoves.reduce((sum, m) => sum + m.file.sizeBytes, 0);
  const now = new Date().toISOString().split("T")[0];

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

set -e

# Log file for progress tracking
LOG_FILE="/config/plan.log"

# Helper function to log with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Clear previous log
> "$LOG_FILE"

log "Starting plan execution..."
log "Total files: ${pendingMoves.length}"
log "Total size: ${formatBytes(totalBytes)}"
log ""

`;
};

const generateBatchCommand = (batch: Batch, index: number): string => {
  const src = batch.sourceDisk.endsWith("/") ? batch.sourceDisk : `${batch.sourceDisk}/`;
  const dst = batch.targetDisk.endsWith("/") ? batch.targetDisk : `${batch.targetDisk}/`;

  const fileList = batch.files.join("\n");

  return `# Batch ${index + 1}: ${batch.sourceDisk} -> ${batch.targetDisk} (${batch.files.length} files, ${formatBytes(batch.sizeBytes)})
log "Batch ${index + 1}: Transferring ${batch.files.length} files (${formatBytes(batch.sizeBytes)}) from ${batch.sourceDisk} to ${batch.targetDisk}"
{
  rsync -a --remove-source-files --files-from=<(cat <<'EOF'
${fileList}
EOF
) "${src}" "${dst}" 2>&1 > /dev/null
  log "Batch ${index + 1}: Completed - ${batch.files.length} files (${formatBytes(batch.sizeBytes)})"
} &

`;
};

const generate = (options: PlanGeneratorOptions): Effect.Effect<string> =>
  Effect.sync(() => {
    const batches = groupByTargetDisk(options.moves);

    if (batches.length === 0) {
      return `#!/bin/bash
exit 0
`;
    }

    const batchCommands = batches.map(generateBatchCommand).join("");

    const script = [
      generateHeader(options),
      batchCommands,
      "wait\n",
      'log "All transfers completed successfully!"\n',
      'log ""\n'
    ].join("");

    return script;
  });

export const BashRsyncPlanGenerator = Layer.succeed(PlanGeneratorServiceTag, {
  generate
});
