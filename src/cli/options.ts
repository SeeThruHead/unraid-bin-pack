/**
 * CLI Options for Unraid Bin-Pack
 *
 * Sane defaults optimized for typical Unraid setups:
 * - Disks at /mnt/disk1, /mnt/disk2, etc.
 * - Media files (movies, TV, music)
 * - General files (documents, backups, etc.)
 */

import { Options } from "@effect/cli"

// =============================================================================
// Plan Command Options
// =============================================================================

/**
 * Source disk - files will be moved FROM this disk.
 * If not provided, auto-selects the least full disk (most free space).
 *
 * @example "/mnt/disk3"
 */
export const src = Options.text("src").pipe(
  Options.withDescription("Source disk to move files from. Auto-selects least full if not set."),
  Options.optional
)

/**
 * Destination disks - files will be moved TO these disks.
 * If not provided, auto-discovers disks at /mnt/disk*.
 *
 * @example "/mnt/disk1,/mnt/disk2"
 */
export const dest = Options.text("dest").pipe(
  Options.withDescription("Destination disk paths (comma-separated). Auto-discovers if not set."),
  Options.optional
)

/**
 * Minimum free space to maintain on each target disk after moves.
 * Prevents filling disks completely.
 *
 * Accepts human-readable sizes: 50MB, 1GB, 500K, etc.
 *
 * @default "50MB"
 */
export const threshold = Options.text("threshold").pipe(
  Options.withDescription("Min free space per disk (e.g., 50MB, 1GB)"),
  Options.withDefault("50MB")
)

/**
 * Bin-packing algorithm:
 * - best-fit: Place on disk with least remaining space that fits (fills disks efficiently)
 * - first-fit: Place on first disk that fits (faster, less optimal)
 *
 * @default "best-fit"
 */
export const algorithm = Options.choice("algorithm", ["best-fit", "first-fit"]).pipe(
  Options.withDescription("Packing algorithm: best-fit (efficient) or first-fit (fast)"),
  Options.withDefault("best-fit" as const)
)

/**
 * File patterns to include (comma-separated globs).
 * Only folders containing matching files will be considered.
 * The entire folder moves together, including non-matching files.
 *
 * @example "*.mkv,*.mp4" - only move video folders
 * @example "*.flac,*.mp3" - only move music folders
 */
export const include = Options.text("include").pipe(
  Options.withDescription("File patterns to include (e.g., '*.mkv,*.mp4')"),
  Options.optional
)

/**
 * Patterns to exclude from scanning (comma-separated).
 *
 * @example ".DS_Store,*.tmp,@eaDir"
 */
export const exclude = Options.text("exclude").pipe(
  Options.withDescription("Patterns to exclude (e.g., '.DS_Store,@eaDir')"),
  Options.optional
)

// =============================================================================
// Folder Grouping Options
// =============================================================================

/**
 * Folders smaller than this size are never split.
 * Keeps small projects/folders together on the same disk.
 *
 * Accepts human-readable sizes: 500MB, 1GB, etc.
 *
 * @default "1GB"
 */
export const minSplitSize = Options.text("min-split-size").pipe(
  Options.withDescription("Folders smaller than this stay together (e.g., 1GB)"),
  Options.withDefault("1GB")
)

/**
 * If the largest file in a folder is >= this percentage of the folder size,
 * the folder is treated as a unit (movie-like) and not split.
 *
 * @example 0.9 means if one file is 90%+ of the folder, keep together
 * @default 0.9
 */
export const folderThreshold = Options.text("folder-threshold").pipe(
  Options.withDescription("Keep folder together if largest file is this % of total (0.0-1.0)"),
  Options.withDefault("0.9")
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
export const concurrency = Options.integer("concurrency").pipe(
  Options.withDescription("Parallel transfers (default: 4)"),
  Options.withDefault(4)
)

/**
 * Show what would be transferred without actually doing it.
 * Runs rsync with --dry-run flag.
 */
export const dryRun = Options.boolean("dry-run").pipe(
  Options.withDescription("Preview transfers without executing"),
  Options.withDefault(false)
)

// =============================================================================
// Shared Options
// =============================================================================

/**
 * Path to the plan file. Used to save (plan) or load (apply) the move plan.
 *
 * @default /mnt/user/appdata/unraid-bin-pack/plan.db (sqlite) or plan.json (json)
 */
export const planFile = Options.file("plan-file").pipe(
  Options.withDescription("Path to plan file"),
  Options.optional
)

/**
 * Force overwrite of existing plan, even if partially executed.
 * Use with caution - will lose progress on incomplete plans.
 */
export const force = Options.boolean("force").pipe(
  Options.withDescription("Overwrite existing plan without prompting"),
  Options.withDefault(false)
)

/**
 * Storage backend for plan files.
 * - json: Human-readable JSON files (default)
 * - sqlite: SQLite database (atomic updates, better for large plans)
 *
 * @default "sqlite"
 */
export const storage = Options.choice("storage", ["json", "sqlite"]).pipe(
  Options.withDescription("Storage backend: json or sqlite"),
  Options.withDefault("sqlite" as const)
)

// =============================================================================
// Types
// =============================================================================

export interface PlanOptions {
  readonly src: string | undefined         // auto-select least full if undefined
  readonly dest: string | undefined        // auto-discover if undefined
  readonly threshold: string               // parsed with parseSize()
  readonly algorithm: "best-fit" | "first-fit"
  readonly include: string | undefined
  readonly exclude: string | undefined
  readonly minSplitSize: string            // parsed with parseSize()
  readonly folderThreshold: string         // parsed with parseFloat()
  readonly planFile: string | undefined
  readonly force: boolean                  // overwrite existing partial plan
  readonly storage: "json" | "sqlite"
}

export interface ApplyOptions {
  readonly planFile: string | undefined
  readonly concurrency: number
  readonly dryRun: boolean
  readonly storage: "json" | "sqlite"
}

// =============================================================================
// Defaults Summary (for documentation)
// =============================================================================

/**
 * Default values optimized for Unraid:
 *
 * --src              (auto)   Least full disk at /mnt/disk*
 * --dest             (auto)   All other disks at /mnt/disk*
 * --threshold        50MB     Keep 50MB free on each disk
 * --algorithm        best-fit Fill disks efficiently
 * --min-split-size   1GB      Never split folders < 1GB
 * --folder-threshold 0.9      Keep folder if one file is 90%+
 * --concurrency      4        4 parallel transfers
 */
