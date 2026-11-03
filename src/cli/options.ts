/**
 * CLI Options for Unraid Bin-Pack
 *
 * Sane defaults optimized for typical Unraid setups:
 * - Disks at /mnt/disk1, /mnt/disk2, etc.
 * - Media files (movies, TV, music)
 * - General files (documents, backups, etc.)
 */

import { Flag } from "effect/cli"

// =============================================================================
// Plan Command Options
// =============================================================================

/**
 * Source disk - files will be moved FROM this disk.
 * If not provided, auto-selects the least full disk (most free space).
 *
 * @example "/mnt/disk3"
 */
export const src = Flag.String("src").pipe(
  Flag.withDescription("Source disk to move files from. Auto-selects least full if not set."),
  Flag.optional
)

/**
 * Destination disks - files will be moved TO these disks.
 * If not provided, auto-discovers disks at /mnt/disk*.
 *
 * @example "/mnt/disk1,/mnt/disk2"
 */
export const dest = Flag.String("dest").pipe(
  Flag.withDescription("Destination disk paths (comma-separated). Auto-discovers if not set."),
  Flag.optional
)

/**
 * Minimum free space to leave on each disk after moves.
 * Prevents filling destination disks completely.
 *
 * Accepts human-readable sizes: 50MB, 1GB, 500K, etc.
 */
export const minSpace = Flag.String("min-space").pipe(
  Flag.withDescription("Min free space to leave on each disk (e.g., 50MB, 1GB)"),
  Flag.optional
)

/**
 * Minimum file size to consider for moving.
 * Files smaller than this are ignored to avoid wasting effort on tiny files.
 *
 * Accepts human-readable sizes: 1MB, 500KB, etc.
 */
export const minFileSize = Flag.String("min-file-size").pipe(
  Flag.withDescription("Min file size to move (e.g., 1MB, 500KB)"),
  Flag.optional
)

/**
 * Path prefixes to include (comma-separated).
 * Only files under these paths will be considered for consolidation.
 * Empty string means no filter (all paths).
 */
export const pathFilter = Flag.String("path-filter").pipe(
  Flag.withDescription("Path prefixes to include (e.g., '/media/Movies,/media/TV')"),
  Flag.optional
)

/**
 * File patterns to include (comma-separated globs).
 * Only folders containing matching files will be considered.
 * The entire folder moves together, including non-matching files.
 *
 * @example "*.mkv,*.mp4" - only move video folders
 * @example "*.flac,*.mp3" - only move music folders
 */
export const include = Flag.String("include").pipe(
  Flag.withDescription("File patterns to include (e.g., '*.mkv,*.mp4')"),
  Flag.optional
)

/**
 * Patterns to exclude from scanning (comma-separated).
 *
 * @example ".DS_Store,*.tmp,@eaDir"
 */
export const exclude = Flag.String("exclude").pipe(
  Flag.withDescription("Patterns to exclude (e.g., '.DS_Store,@eaDir')"),
  Flag.optional
)

// =============================================================================
// Folder Grouping Options
// =============================================================================

/**
 * Folders smaller than this size are never split.
 * Keeps small projects/folders together on the same disk.
 *
 * Accepts human-readable sizes: 500MB, 1GB, etc.
 */
export const minSplitSize = Flag.String("min-split-size").pipe(
  Flag.withDescription("Folders smaller than this stay together (e.g., 1GB)"),
  Flag.optional
)

/**
 * If the largest file in a folder is >= this percentage of the folder size,
 * the folder is treated as a unit (movie-like) and not split.
 *
 * @example 0.9 means if one file is 90%+ of the folder, keep together
 */
export const moveAsFolderThreshold = Flag.String("move-as-folder-threshold").pipe(
  Flag.withDescription("Keep folder together if largest file is this % of total (0.0-1.0)"),
  Flag.optional
)

// =============================================================================
// Apply Command Options
// =============================================================================

/**
 * Number of parallel rsync transfers.
 * Higher = faster but more disk I/O.
 *
 * @default 4
 */
export const concurrency = Flag.Int("concurrency").pipe(
  Flag.withDescription("Parallel transfers (default: 4)"),
  Flag.withDefault(4)
)

/**
 * Show what would be transferred without actually doing it.
 * Runs rsync with --dry-run flag.
 */
export const dryRun = Flag.Boolean("dry-run").pipe(
  Flag.withDescription("Preview transfers without executing"),
  Flag.withDefault(false)
)

/**
 * Enable debug logging for troubleshooting.
 */
export const debug = Flag.Boolean("debug").pipe(
  Flag.withDescription("Enable verbose debug logging"),
  Flag.withDefault(false)
)

// =============================================================================
// Shared Options
// =============================================================================

/**
 * Path to the plan script. Used to save (plan) or execute (apply) the move plan.
 *
 * @default /config/plan.sh
 */
export const planFile = Flag.File("plan-file").pipe(
  Flag.withDescription("Path to plan script"),
  Flag.optional
)

/**
 * Force overwrite of existing plan, even if partially executed.
 * Use with caution - will lose progress on incomplete plans.
 */
export const force = Flag.Boolean("force").pipe(
  Flag.withDescription("Overwrite existing plan without prompting"),
  Flag.withDefault(false)
)

// =============================================================================
// Types
// =============================================================================

export type PlanOptions = {
  readonly src: string | undefined         // auto-select least full if undefined
  readonly dest: string | undefined        // auto-discover if undefined
  readonly minSpace: string | undefined    // parsed with parseSize()
  readonly minFileSize: string | undefined // parsed with parseSize()
  readonly pathFilter: string | undefined  // comma-separated path prefixes
  readonly include: string | undefined
  readonly exclude: string | undefined
  readonly minSplitSize: string | undefined            // parsed with parseSize()
  readonly moveAsFolderThreshold: string | undefined   // parsed with parseFloat()
  readonly planFile: string | undefined
  readonly force: boolean                  // overwrite existing partial plan
  readonly debug?: boolean                 // enable debug-level logging (optional)
}

export type ApplyOptions = {
  readonly planFile: string | undefined
  readonly concurrency: number
  readonly dryRun: boolean
}

// =============================================================================
// Defaults Summary (for documentation)
// =============================================================================

/**
 * Default values optimized for Unraid:
 *
 * --src                      (auto)   Least full disk at /mnt/disk*
 * --dest                     (auto)   All other disks at /mnt/disk*
 * --min-space                50MB     Keep 50MB free on each disk
 * --min-file-size            1MB      Only move files >= 1MB
 * --path-filter              /media/* Only move files in /media/Movies,TV,Anime
 * --min-split-size           1GB      Never split folders < 1GB
 * --move-as-folder-threshold 0.9      Keep folder if one file is 90%+
 * --concurrency              4        4 parallel transfers
 */
