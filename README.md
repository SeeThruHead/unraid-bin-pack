# Unraid Bin-Pack

Consolidate files across Unraid disks using bin-packing algorithms. Move files from a "spillover" disk to fill other disks efficiently.

## Table of Contents

- [Quick Start](#quick-start)
- [Commands](#commands)
- [Safety Features](#safety-features)
- [Algorithm](#algorithm)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)

## Quick Start

### Easy Install (Recommended)

Generate a wrapper script with one command:

```bash
curl -fsSL https://raw.githubusercontent.com/SeeThruHead/unraid-bin-pack/main/install.sh | bash
```

This will prompt you for mount points and create a `./unraid-bin-pack` script. Then use it like:

```bash
# Create a plan
./unraid-bin-pack plan --path-filter "/Movies,/TV,/Anime"

# Review the plan
./unraid-bin-pack show

# Test with dry-run
./unraid-bin-pack apply --dry-run

# Execute the plan
./unraid-bin-pack apply
```

### Docker Web Interface (Recommended)

Run the web UI as a persistent service:

```bash
docker run -d \
  --name unraid-bin-pack-web \
  -p 3001:3001 \
  -v /mnt:/mnt:ro \
  -v /mnt/user/appdata/unraid-bin-pack:/config \
  seethruhead/unraid-bin-pack:web
```

Then access the UI at **http://your-server-ip:3001**

### Manual Docker CLI Usage

```bash
# Create a plan (auto-discovers disks at /mnt/disk*)
docker run --rm -v /mnt:/mnt -v /mnt/user/appdata/unraid-bin-pack:/config seethruhead/unraid-bin-pack plan

# Execute the plan
docker run --rm -v /mnt:/mnt -v /mnt/user/appdata/unraid-bin-pack:/config seethruhead/unraid-bin-pack apply

# View the plan
docker run --rm -v /mnt:/mnt -v /mnt/user/appdata/unraid-bin-pack:/config seethruhead/unraid-bin-pack show
```

**Note:** Plans created via CLI can be applied via web UI and vice versa - they share the same `/config/plan.sh` file.

By default, `plan` will:

- Auto-discover disks at `/mnt/disk*`
- Consolidate files from the **least full** disk to other disks
- Only move files under `/media/Movies`, `/media/TV`, `/media/Anime` (configurable with `--path-filter`)

### Build from Source

```bash
bun install
bun run src/main.ts plan  # auto-discover
# or specify explicitly:
bun run src/main.ts plan --src /mnt/disk3 --dest /mnt/disk1,/mnt/disk2
```

## Commands

### `web` - Start web interface

Starts the web UI server for browser-based plan management.

```bash
unraid-bin-pack web [options]

Options:
  --port <number>  Port for web server (default: 3001)
```

The web interface provides:

- Clean disk selection with card-based layout
- Pattern-based folder selection (matches folders across all disks)
- File type filtering with "Everything" option
- Visual plan creation and review
- One-click plan execution with dry-run support
- Real-time progress feedback

### `plan` - Generate a move plan

Scans disks and computes optimal file placement using consolidation algorithm.

```bash
unraid-bin-pack plan [options]

Options:
  --src <path>                   Source disk(s) to move files from (comma-separated, auto-selects least full if not set)
  --dest <paths>                 Comma-separated destination disk paths (auto-discovers at /mnt/disk* if not set)
  --min-space <size>             Min free space per disk (default: 50MB)
  --min-file-size <size>         Min file size to move (default: 1MB)
  --path-filter <paths>          Path prefixes to include (default: /media/Movies,/media/TV,/media/Anime)
  --min-split-size <sz>          Min folder size to split (default: 1GB)
  --move-as-folder-threshold <n> Ratio for keeping folders together (default: 0.9)
  --plan-file <path>             Where to save the plan script (default: /config/plan.sh)
  --include <patterns>           File patterns to include (e.g., '*.mkv,*.mp4')
  --exclude <patterns>           Patterns to exclude (e.g., '.DS_Store,@eaDir')
  --force                        Overwrite existing partial plan without prompting
  --debug                        Enable verbose debug logging
```

### `apply` - Execute a saved plan

Executes the move plan script, transferring files using rsync.

```bash
unraid-bin-pack apply [options]

Options:
  --plan-file <path>       Plan script to execute (default: /config/plan.sh)
  --dry-run                Show what would happen without moving files
  --concurrency <n>        Parallel transfers (default: 4)
```

### `show` - Display saved plan

Shows the current plan script.

```bash
unraid-bin-pack show [options]

Options:
  --plan-file <path>       Plan script to display (default: /config/plan.sh)
```

## Safety Features

1. **Plan before apply** - Always generates a plan file you can review
2. **Validation** - Checks source files exist, disk space available, no conflicts
3. **Dry-run mode** - Test apply without moving anything
4. **Atomic moves** - Uses rsync with `--remove-source-files` for reliable transfers
5. **Conflict detection** - Won't overwrite existing files at destination
6. **Resume support** - Interrupted transfers can be resumed; progress is persisted
7. **Partial plan warning** - Warns if trying to create new plan over partial execution

## Algorithm

Uses **disk-by-disk consolidation** with smart file combination:

1. Ranks disks by fullness (least full first)
2. For each source disk:
   - Finds the best **combination** of files that fills destination disks efficiently
   - Considers multiple files together (e.g., 345MB + 200MB) for better packing
   - Uses bucketing and sampling to handle large file counts efficiently
   - Moves files and removes disk from destination pool
3. Repeats until no more files can be moved

### Key Features

- **Combination packing**: Finds multiple files that fit together better than single large files
- **File filtering**: Only considers files ≥ 1MB by default, matching path prefixes
- **Progressive consolidation**: Works through disks from least to most full
- **Efficient matching**: Uses size-based buckets and sampling for performance

## Architecture

The project follows a **layered architecture** with strict dependency rules, built on [Effect-TS](https://effect.website/) for type-safe, composable effects.

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  main.ts, cli/handler.ts, cli/options.ts, cli/errors.ts    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                          │
│  DiskService, ScannerService, SimpleConsolidator,           │
│  TransferService, LoggerService                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                      │
│  GlobService, FileStatService, DiskStatsService,            │
│  ShellService                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                          │
│  Disk, FileEntry, FolderGroup, MovePlan, WorldView          │
└─────────────────────────────────────────────────────────────┘
```

### Layers Explained

| Layer              | Purpose                                              | Dependencies           |
| ------------------ | ---------------------------------------------------- | ---------------------- |
| **CLI**            | Parse arguments, orchestrate commands, format output | Services               |
| **Services**       | Business logic (scanning, packing, transferring)     | Infrastructure, Domain |
| **Infrastructure** | External I/O (filesystem, shell, storage)            | Domain                 |
| **Domain**         | Pure data types and domain logic                     | None                   |

### Key Patterns

#### Effect-TS Services

Each service is defined as a **tagged service** with explicit dependencies:

```typescript
// Service interface
export interface DiskService {
  readonly discover: (paths: string[]) => Effect.Effect<Disk[], DiskError>
}

// Service tag for dependency injection
export class DiskServiceTag extends Context.Tag("DiskService")<
  DiskServiceTag,
  DiskService
>() {}

// Implementation as Effect Layer
export const DiskServiceLive = Layer.effect(
  DiskServiceTag,
  Effect.gen(function* () {
    const diskStats = yield* DiskStatsServiceTag  // Inject dependency
    return { discover: ... }
  })
)
```

#### Typed Errors

All errors are discriminated unions using `Data.TaggedError`:

```typescript
export class DiskNotFound extends Data.TaggedError("DiskNotFound")<{
  readonly path: string;
}> {}

export class DiskPermissionDenied extends Data.TaggedError("DiskPermissionDenied")<{
  readonly path: string;
}> {}

export type DiskError = DiskNotFound | DiskPermissionDenied | DiskNotMountPoint;
```

This enables exhaustive error handling and user-friendly messages.

#### Plan Scripts

Plans are generated as executable bash scripts using `PlanScriptGenerator`:

| File      | Format      | Features                                              |
| --------- | ----------- | ----------------------------------------------------- |
| `plan.sh` | Bash script | Human-readable, rsync commands, idempotent, auditable |

The script contains:

- Metadata header (generated date, source disk, file counts)
- Batched rsync commands (grouped by target disk)
- Parallel execution with background processes (`&` and `wait`)
- Automatic resume support (rsync is idempotent)

## Directory Structure

```
src/
├── main.ts                          # CLI entry point
├── cli/
│   ├── handler.ts                   # Command handlers (runPlan, runApply, runShow)
│   ├── options.ts                   # CLI option definitions
│   └── errors.ts                    # Error formatting for CLI output
├── services/
│   ├── DiskService.ts               # Disk discovery and validation
│   ├── ScannerService.ts            # File scanning
│   ├── SimpleConsolidator.ts        # Disk-by-disk consolidation algorithm
│   ├── TransferService.ts           # Rsync-based file transfer
│   └── LoggerService.ts             # Formatted console output
├── infra/
│   ├── GlobService.ts               # File globbing (Bun.Glob)
│   ├── FileStatService.ts           # File stat operations
│   ├── DiskStatsService.ts          # Disk space queries
│   └── ShellService.ts              # Shell command execution
├── domain/
│   ├── Disk.ts                      # Disk type
│   ├── FileEntry.ts                 # File metadata type
│   ├── FolderGroup.ts               # Folder grouping logic
│   ├── MovePlan.ts                  # Move plan type
│   └── WorldView.ts                 # Disk + file state snapshot
├── lib/
│   └── parseSize.ts                 # Human-readable size parsing
├── test/
│   └── TestContext.ts               # Test utilities and mocks
└── integration/
    └── handlers.test.ts             # End-to-end handler tests
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Docker (for containerized deployment)

### Setup

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Run tests
bun test

# Run both
bun run check

# Run locally
bun run src/main.ts plan --help
```

### Build Docker Images

```bash
# Build CLI image
docker build -t seethruhead/unraid-bin-pack:latest .

# Build web server image
docker build -f Dockerfile.web-v2 -t seethruhead/unraid-bin-pack:web .

# Push both images
docker push seethruhead/unraid-bin-pack:latest
docker push seethruhead/unraid-bin-pack:web

# Or use test tags for testing
docker build -t seethruhead/unraid-bin-pack:test .
docker build -f Dockerfile.web-v2 -t seethruhead/unraid-bin-pack:test-web .
docker push seethruhead/unraid-bin-pack:test
docker push seethruhead/unraid-bin-pack:test-web
```

## Testing

The project has comprehensive test coverage across all layers.

### Test Categories

| Category              | Files                       | Purpose                              |
| --------------------- | --------------------------- | ------------------------------------ |
| **Unit**              | `*.test.ts` in same dir     | Test individual modules in isolation |
| **Integration**       | `integration/*.test.ts`     | Test handler flows with mocked I/O   |
| **Infra Integration** | `infra.integration.test.ts` | Test real filesystem operations      |

### Running Tests

```bash
# All tests
bun test

# Specific file
bun test src/services/BinPackService.test.ts

# Watch mode
bun test --watch
```

### Test Utilities

The `src/test/TestContext.ts` provides a comprehensive mock environment:

```typescript
const ctx = createTestContext()

// Set up virtual filesystem
ctx.addDisk("/mnt/disk1", { free: 50_000_000_000, total: 100_000_000_000 })
ctx.addFile("/mnt/spillover/movie.mkv", 5_000_000_000)

// Run handler with mocked services
await pipe(
  runPlan({ ... }),
  Effect.provide(buildTestLayer(ctx)),
  Effect.runPromise
)

// Assert on calls
expect(ctx.calls.planStorage.filter(c => c.method === "save")).toHaveLength(1)
```

## Contributing

### Code Style

- **TypeScript strict mode** - No `any`, explicit types for public APIs
- **Effect-TS idioms** - Use `Effect.gen`, `pipe`, tagged errors
- **Functional patterns** - Prefer `map`/`filter`/`reduce` over loops
- **Immutability** - No mutations outside of local algorithm state

### Adding a New Service

1. Define the interface in a new file under `services/` or `infra/`
2. Create a `Context.Tag` for dependency injection
3. Implement as a `Layer.effect` or `Layer.succeed`
4. Add typed errors using `Data.TaggedError`
5. Write unit tests with mocked dependencies
6. Wire into `AppLive` layer in `handler.ts`

Example skeleton:

```typescript
// 1. Errors
export class MyServiceError extends Data.TaggedError("MyServiceError")<{
  readonly reason: string
}> {}

// 2. Interface
export interface MyService {
  readonly doThing: (input: string) => Effect.Effect<Output, MyServiceError>
}

// 3. Tag
export class MyServiceTag extends Context.Tag("MyService")<
  MyServiceTag,
  MyService
>() {}

// 4. Implementation
export const MyServiceLive = Layer.effect(
  MyServiceTag,
  Effect.gen(function* () {
    const dep = yield* SomeDependencyTag
    return {
      doThing: (input) => Effect.try({ ... })
    }
  })
)
```

### Error Handling Guidelines

1. **Never throw** - Return `Effect.fail` with typed errors
2. **Specific errors** - Create distinct error types for different failure modes
3. **User-friendly messages** - Add formatting in `cli/errors.ts`
4. **Preserve context** - Include relevant data (paths, sizes) in error types

### Pull Request Checklist

- [ ] All tests pass (`bun test`)
- [ ] Type check passes (`bun run typecheck`)
- [ ] New code has tests
- [ ] Errors are typed and formatted for CLI
- [ ] No `console.log` - use `Effect.Console`
- [ ] Documentation updated if adding features

### Commit Messages

Follow conventional commits:

```
feat: add SQLite plan storage backend
fix: handle permission denied during scan
refactor: extract folder grouping to domain
test: add integration tests for resume flow
docs: update architecture section in README
```

## License

MIT
