import { Options } from "@effect/cli";

export const src = Options.text("src").pipe(
  Options.withDescription("Source disk to move files from. Auto-selects least full if not set."),
  Options.optional
);

export const dest = Options.text("dest").pipe(
  Options.withDescription("Destination disk paths (comma-separated). Auto-discovers if not set."),
  Options.optional
);

export const minSpace = Options.text("min-space").pipe(
  Options.withDescription("Min free space to leave on each disk (e.g., 50MB, 1GB)"),
  Options.optional
);

export const minFileSize = Options.text("min-file-size").pipe(
  Options.withDescription("Min file size to move (e.g., 1MB, 500KB)"),
  Options.optional
);

export const pathFilter = Options.text("path-filter").pipe(
  Options.withDescription("Path prefixes to include (e.g., '/media/Movies,/media/TV')"),
  Options.optional
);

export const include = Options.text("include").pipe(
  Options.withDescription("File patterns to include (e.g., '*.mkv,*.mp4')"),
  Options.optional
);

export const exclude = Options.text("exclude").pipe(
  Options.withDescription("Patterns to exclude (e.g., '.DS_Store,@eaDir')"),
  Options.optional
);

export const minSplitSize = Options.text("min-split-size").pipe(
  Options.withDescription("Folders smaller than this stay together (e.g., 1GB)"),
  Options.optional
);

export const moveAsFolderThreshold = Options.text("move-as-folder-threshold").pipe(
  Options.withDescription("Keep folder together if largest file is this % of total (0.0-1.0)"),
  Options.optional
);

export const concurrency = Options.integer("concurrency").pipe(
  Options.withDescription("Parallel transfers (default: 4)"),
  Options.withDefault(4)
);

export const dryRun = Options.boolean("dry-run").pipe(
  Options.withDescription("Preview transfers without executing"),
  Options.withDefault(false)
);

export const debug = Options.boolean("debug").pipe(
  Options.withDescription("Enable verbose debug logging"),
  Options.withDefault(false)
);

export const planFile = Options.file("plan-file").pipe(
  Options.withDescription("Path to plan script"),
  Options.optional
);

export const force = Options.boolean("force").pipe(
  Options.withDescription("Overwrite existing plan without prompting"),
  Options.withDefault(false)
);

export const port = Options.integer("port").pipe(
  Options.withDescription("Port for web server"),
  Options.withDefault(3001)
);

export interface PlanOptions {
  readonly src: string | undefined;
  readonly dest: string | undefined;
  readonly minSpace: string | undefined;
  readonly minFileSize: string | undefined;
  readonly pathFilter: string | undefined;
  readonly include: string | undefined;
  readonly exclude: string | undefined;
  readonly minSplitSize: string | undefined;
  readonly moveAsFolderThreshold: string | undefined;
  readonly planFile: string | undefined;
  readonly force: boolean;
  readonly debug?: boolean;
}

export interface ApplyOptions {
  readonly planFile: string | undefined;
  readonly concurrency: number;
  readonly dryRun: boolean;
}
