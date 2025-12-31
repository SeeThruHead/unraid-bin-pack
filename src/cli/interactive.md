# Interactive Mode

Interactive terminal prompts for plan configuration.

## Overview

The interactive module provides a user-friendly CLI experience where users are guided through configuration options with prompts, defaults, and helpful context.

## Function

### interactivePlanPrompts

Guides users through all plan configuration options.

```typescript
export const interactivePlanPrompts = (discoveredDisks: ReadonlyArray<Disk>) =>
  Effect<PlanOptions, QuitException, Terminal>;
```

**Parameters:**

- `discoveredDisks` - Pre-discovered disks to show in prompts

**Returns:**

- Complete `PlanOptions` object from user input

## Prompt Flow

### 1. Disk Discovery Display

Shows discovered disks with usage statistics:

```
🔍 Discovered disks:
   /mnt/disk1: 1500.0/2000.0 GB used (75.0%), 500.0 GB free
   /mnt/disk2: 800.0/3000.0 GB used (26.7%), 2200.0 GB free
   /mnt/disk3: 2800.0/4000.0 GB used (70.0%), 1200.0 GB free
```

### 2. Source Disk Selection

```
Source disk to move files from [/mnt/disk2 - least full]:
```

- **Default:** Least full disk (most free space)
- **Optional:** Leave empty to skip source filtering

### 3. Destination Disks

```
Destination disks (comma-separated) [all 3 disks]:
```

- **Default:** All discovered disks
- **Format:** Comma-separated paths

### 4. Space Constraints

```
Min free space per disk [50MB]:
Min file size to move [1MB]:
```

Human-readable sizes (MB, GB, etc.)

### 5. Directory Tree Selection

Interactive tree UI for selecting specific paths to include:

```typescript
const selectedDirs = yield * selectDirectoriesEffect(discoveredDisks.map((d) => d.path));
```

Displays selected paths or "All paths included" if none selected.

### 6. File Patterns

```
File patterns to include (e.g., *.mkv,*.mp4, empty for all):
Patterns to exclude [.DS_Store,@eaDir,.Trashes,.Spotlight-V100]:
```

### 7. Advanced Options

```
Min folder size to allow splitting [1GB]:
Keep folder together if largest file is % of total (0.0-1.0) [0.9]:
```

### 8. Plan Configuration

```
Plan script path [/config/plan.sh]:
Force overwrite existing plan? [no]:
Enable debug logging? [no]:
```

### 9. Confirmation

```
✓ Configuration complete!
```

## Usage Example

```typescript
import { Effect, Console } from "effect";
import { interactivePlanPrompts } from "./interactive";
import { DiskServiceTag } from "@services/DiskService";

const program = Effect.gen(function* () {
  const diskService = yield* DiskServiceTag;

  // Discover disks
  const paths = yield* diskService.autoDiscover();
  const disks = yield* diskService.discover(paths);

  if (disks.length === 0) {
    yield* Console.error("No disks found");
    return;
  }

  // Run interactive prompts
  const options = yield* interactivePlanPrompts(disks);

  yield* Console.log(`Source: ${options.src ?? "auto"}`);
  yield* Console.log(`Destinations: ${options.dest ?? "all"}`);
  yield* Console.log(`Min space: ${options.minSpace ?? "50MB"}`);
  // ... use options for plan generation
});
```

## Integration with runPlan

The `runPlan` handler automatically uses interactive mode when requested:

```typescript
export const runPlan = (options: PlanOptions, isInteractive: boolean = false) =>
  Effect.gen(function* () {
    let finalOptions = options;

    if (isInteractive) {
      const discoveredDisks = yield* diskService
        .autoDiscover()
        .pipe(Effect.flatMap((paths) => diskService.discover(paths)));

      if (discoveredDisks.length === 0) {
        yield* Console.error("\n❌ No disks found at /mnt/disk*\n");
        return;
      }

      finalOptions = yield* interactivePlanPrompts(discoveredDisks);
    }

    // ... continue with finalOptions
  });
```

## Prompt Types

### Text Input

Used for: source disk, destination disks, sizes, patterns, plan path

```typescript
const src =
  yield *
  Prompt.text({
    message: "Source disk to move files from",
    default: "/mnt/disk1"
  });
```

### Confirmation

Used for: force overwrite, debug logging

```typescript
const force =
  yield *
  Prompt.confirm({
    message: "Force overwrite existing plan?",
    initial: false
  });
```

### Tree Selection

Custom directory tree selection (see `treeSelect.ts`):

```typescript
const selectedDirs = yield * selectDirectoriesEffect(diskPaths);
```

## Default Values

- **Source disk:** Least full disk (most free space)
- **Destination disks:** All discovered disks
- **Min free space:** `50MB`
- **Min file size:** `1MB`
- **Exclude patterns:** `.DS_Store,@eaDir,.Trashes,.Spotlight-V100`
- **Min split size:** `1GB`
- **Move as folder threshold:** `0.9` (90%)
- **Plan file:** `/config/plan.sh`
- **Force:** `false`
- **Debug:** `false`

## Smart Defaults

### Least Full Disk

Automatically suggests the disk with the most free space as source:

```typescript
const leastFullDisk = discoveredDisks.slice().sort((a, b) => b.freeBytes - a.freeBytes)[0];

const srcDefault = leastFullDisk?.path ?? "";
```

### Empty Input Handling

Many prompts treat empty input as "use default" or "skip this filter":

```typescript
Prompt.text({ message: "...", default: "..." }).pipe(
  Effect.map((s) => (s.trim() === "" ? undefined : s.trim()))
);
```

## User Experience

### Visual Feedback

- **Emoji indicators:** 📦 🔍 ✓ ❌
- **Clear sections:** Disk discovery, prompts, confirmation
- **Usage statistics:** Shows disk capacity and free space
- **Selected paths summary:** Displays chosen directories

### Error Handling

Returns `QuitException` if user cancels (Ctrl+C).

## CLI Command Integration

```bash
# Interactive mode
unraid-bin-pack plan --interactive

# Non-interactive with flags
unraid-bin-pack plan --src /mnt/disk1 --dest /mnt/disk2,/mnt/disk3
```

## See Also

- [handler.md](./handler.md) - Command handlers using interactive mode
- [options.md](./options.md) - PlanOptions interface
- [treeSelect.ts](./treeSelect.ts) - Directory tree selection UI
- @effect/cli - Prompt utilities
