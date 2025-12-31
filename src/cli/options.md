# CLI Options

Command-line option definitions for unraid-bin-pack.

## Overview

This module defines all CLI options using @effect/cli, providing type-safe command-line parsing with descriptions and defaults.

## Plan Options

Options for the `plan` command.

### Source and Destination

```typescript
export const src = Options.text("src").pipe(
  Options.withDescription("Source disk to move files from. Auto-selects least full if not set."),
  Options.optional
)

export const dest = Options.text("dest").pipe(
  Options.withDescription("Destination disk paths (comma-separated). Auto-discovers if not set."),
  Options.optional
)
```

**CLI Usage:**
```bash
--src /mnt/disk1
--dest /mnt/disk2,/mnt/disk3,/mnt/disk4
```

### Space Constraints

```typescript
export const minSpace = Options.text("min-space").pipe(
  Options.withDescription("Min free space to leave on each disk (e.g., 50MB, 1GB)"),
  Options.optional
)

export const minFileSize = Options.text("min-file-size").pipe(
  Options.withDescription("Min file size to move (e.g., 1MB, 500KB)"),
  Options.optional
)
```

**CLI Usage:**
```bash
--min-space 100GB
--min-file-size 5MB
```

Supports human-readable sizes: `KB`, `MB`, `GB`, `TB`

### File Filtering

```typescript
export const pathFilter = Options.text("path-filter").pipe(
  Options.withDescription("Path prefixes to include (e.g., '/media/Movies,/media/TV')"),
  Options.optional
)

export const include = Options.text("include").pipe(
  Options.withDescription("File patterns to include (e.g., '*.mkv,*.mp4')"),
  Options.optional
)

export const exclude = Options.text("exclude").pipe(
  Options.withDescription("Patterns to exclude (e.g., '.DS_Store,@eaDir')"),
  Options.optional
)
```

**CLI Usage:**
```bash
--path-filter /media/Movies,/media/TV
--include *.mkv,*.mp4
--exclude .DS_Store,@eaDir,.Trashes
```

### Folder Handling

```typescript
export const minSplitSize = Options.text("min-split-size").pipe(
  Options.withDescription("Folders smaller than this stay together (e.g., 1GB)"),
  Options.optional
)

export const moveAsFolderThreshold = Options.text("move-as-folder-threshold").pipe(
  Options.withDescription("Keep folder together if largest file is this % of total (0.0-1.0)"),
  Options.optional
)
```

**CLI Usage:**
```bash
--min-split-size 2GB
--move-as-folder-threshold 0.85
```

### Plan Configuration

```typescript
export const planFile = Options.file("plan-file").pipe(
  Options.withDescription("Path to plan script"),
  Options.optional
)

export const force = Options.boolean("force").pipe(
  Options.withDescription("Overwrite existing plan without prompting"),
  Options.withDefault(false)
)

export const debug = Options.boolean("debug").pipe(
  Options.withDescription("Enable verbose debug logging"),
  Options.withDefault(false)
)
```

**CLI Usage:**
```bash
--plan-file /custom/path/plan.sh
--force
--debug
```

## Apply Options

Options for the `apply` command.

```typescript
export const concurrency = Options.integer("concurrency").pipe(
  Options.withDescription("Parallel transfers (default: 4)"),
  Options.withDefault(4)
)

export const dryRun = Options.boolean("dry-run").pipe(
  Options.withDescription("Preview transfers without executing"),
  Options.withDefault(false)
)
```

**CLI Usage:**
```bash
--concurrency 8
--dry-run
--plan-file /config/plan.sh
```

## TypeScript Interfaces

### PlanOptions

```typescript
export interface PlanOptions {
  readonly src: string | undefined
  readonly dest: string | undefined
  readonly minSpace: string | undefined
  readonly minFileSize: string | undefined
  readonly pathFilter: string | undefined
  readonly include: string | undefined
  readonly exclude: string | undefined
  readonly minSplitSize: string | undefined
  readonly moveAsFolderThreshold: string | undefined
  readonly planFile: string | undefined
  readonly force: boolean
  readonly debug?: boolean
}
```

### ApplyOptions

```typescript
export interface ApplyOptions {
  readonly planFile: string | undefined
  readonly concurrency: number
  readonly dryRun: boolean
}
```

## Usage Examples

### Command Definition

```typescript
import { Command, Options } from '@effect/cli'
import * as Opts from './options'

const planCommand = Command.make(
  'plan',
  {
    src: Opts.src,
    dest: Opts.dest,
    minSpace: Opts.minSpace,
    minFileSize: Opts.minFileSize,
    pathFilter: Opts.pathFilter,
    include: Opts.include,
    exclude: Opts.exclude,
    minSplitSize: Opts.minSplitSize,
    moveAsFolderThreshold: Opts.moveAsFolderThreshold,
    planFile: Opts.planFile,
    force: Opts.force,
    debug: Opts.debug,
  },
  (options) => runPlan(options)
)
```

### Option Parsing

Options are automatically parsed by @effect/cli:

```bash
# Command line
unraid-bin-pack plan --src /mnt/disk1 --min-space 100GB --force --debug

# Parsed to PlanOptions
{
  src: '/mnt/disk1',
  dest: undefined,      // Will auto-discover
  minSpace: '100GB',
  minFileSize: undefined, // Will use default
  pathFilter: undefined,
  include: undefined,
  exclude: undefined,
  minSplitSize: undefined,
  moveAsFolderThreshold: undefined,
  planFile: undefined,  // Will use /config/plan.sh
  force: true,
  debug: true
}
```

## Complete Examples

### Minimal Plan

```bash
# Auto-discover everything
unraid-bin-pack plan
```

Equivalent to:
```typescript
{
  src: undefined,
  dest: undefined,
  minSpace: undefined,
  minFileSize: undefined,
  pathFilter: undefined,
  include: undefined,
  exclude: undefined,
  minSplitSize: undefined,
  moveAsFolderThreshold: undefined,
  planFile: undefined,
  force: false,
  debug: false
}
```

### Full Configuration

```bash
unraid-bin-pack plan \
  --src /mnt/disk1 \
  --dest /mnt/disk2,/mnt/disk3,/mnt/disk4 \
  --min-space 100GB \
  --min-file-size 10MB \
  --path-filter /media/Movies,/media/TV \
  --include *.mkv,*.mp4 \
  --exclude .DS_Store,@eaDir \
  --min-split-size 2GB \
  --move-as-folder-threshold 0.9 \
  --plan-file /config/custom-plan.sh \
  --force \
  --debug
```

### Apply Command

```bash
# Execute with defaults
unraid-bin-pack apply

# Custom concurrency and dry-run
unraid-bin-pack apply --concurrency 8 --dry-run

# Custom plan file
unraid-bin-pack apply --plan-file /custom/plan.sh
```

## Option Types

### Text Options

Return `string | undefined`:
- `src`, `dest`, `minSpace`, `minFileSize`
- `pathFilter`, `include`, `exclude`
- `minSplitSize`, `moveAsFolderThreshold`

### File Options

Return file path `string | undefined`:
- `planFile`

### Boolean Options

Return `boolean` (have defaults):
- `force` (default: `false`)
- `dryRun` (default: `false`)
- `debug` (default: `false`)

### Integer Options

Return `number` (have defaults):
- `concurrency` (default: `4`)

## See Also

- [handler.md](./handler.md) - Uses PlanOptions and ApplyOptions
- [interactive.md](./interactive.md) - Prompts for PlanOptions
- [optionParsing.ts](./optionParsing.ts) - Parses string options to domain types
- @effect/cli documentation
