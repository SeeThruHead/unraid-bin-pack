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

### Docker (Recommended for Unraid)

```bash
# Create a plan (auto-discovers disks at /mnt/disk*)
docker run --rm -v /mnt:/mnt seethruhead/unraid-bin-pack plan

# Test with dry-run
docker run --rm -v /mnt:/mnt seethruhead/unraid-bin-pack apply --dry-run

# Execute the plan
docker run --rm -v /mnt:/mnt seethruhead/unraid-bin-pack apply
```

By default, `plan` will:
- Auto-discover disks at `/mnt/disk*`
- Select the **least full** disk as the source (to consolidate from)
- Use all other disks as destinations

### Build from Source

```bash
bun install
bun run src/main.ts plan  # auto-discover
# or specify explicitly:
bun run src/main.ts plan --src /mnt/disk3 --dest /mnt/disk1,/mnt/disk2
```

## Commands

### `plan` - Generate a move plan

Scans the source disk and computes optimal file placement across destination disks.

```bash
unraid-bin-pack plan [options]

Options:
  --src <path>             Source disk to move files from (auto-selects least full if not set)
  --dest <paths>           Comma-separated destination disk paths (auto-discovers at /mnt/disk* if not set)
  --threshold <size>       Min free space per disk (default: 50MB)
  --algorithm <alg>        Packing algorithm: best-fit, first-fit (default: best-fit)
  --min-split-size <sz>    Min folder size to split (default: 1GB)
  --folder-threshold <n>   Ratio for keeping folders together (default: 0.9)
  --plan-file <path>       Where to save the plan (default: /mnt/user/appdata/unraid-bin-pack/plan.db)
  --exclude <patterns>     Glob patterns to exclude
  --force                  Overwrite existing partial plan without prompting
  --storage <backend>      Storage backend: sqlite (default) or json
```

### `apply` - Execute a saved plan

Executes the move plan, transferring files using rsync.

```bash
unraid-bin-pack apply [options]

Options:
  --plan-file <path>       Plan file to apply (default: /mnt/user/appdata/unraid-bin-pack/plan.db)
  --dry-run                Show what would happen without moving files
  --concurrency <n>        Parallel transfers per disk (default: 4)
  --storage <backend>      Storage backend: sqlite (default) or json
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

Uses **Best-Fit Decreasing** by default:

1. Scans source disk for files
2. Groups files by top-level folder (keeps movie/show folders together)
3. Sorts groups by size (largest first)
4. Places each on the disk with least remaining space that still fits
5. Large folders that don't fit anywhere are "exploded" into individual files

### Folder Grouping Heuristics

- **Movie-like folders**: If the largest file is ≥90% of folder size, keep together
- **Min split size**: Folders smaller than 1GB are never split
- **TV show folders**: Each season/episode group evaluated separately

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
│  DiskService, ScannerService, BinPackService, TransferService│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                      │
│  GlobService, FileStatService, DiskStatsService,            │
│  ShellService, PlanStorageService                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                          │
│  Disk, FileEntry, FolderGroup, MovePlan                     │
└─────────────────────────────────────────────────────────────┘
```

### Layers Explained

| Layer | Purpose | Dependencies |
|-------|---------|--------------|
| **CLI** | Parse arguments, orchestrate commands, format output | Services |
| **Services** | Business logic (scanning, packing, transferring) | Infrastructure, Domain |
| **Infrastructure** | External I/O (filesystem, shell, storage) | Domain |
| **Domain** | Pure data types and domain logic | None |

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
  readonly path: string
}> {}

export class DiskPermissionDenied extends Data.TaggedError("DiskPermissionDenied")<{
  readonly path: string
}> {}

export type DiskError = DiskNotFound | DiskPermissionDenied | DiskNotMountPoint
```

This enables exhaustive error handling and user-friendly messages.

#### Storage Backends

Plan storage supports multiple backends via the `PlanStorageService` interface:

| Backend | File | Use Case |
|---------|------|----------|
| `JsonPlanStorageService` | `plan.json` | Simple, human-readable |
| `SqlitePlanStorageService` | `plan.db` | Concurrent-safe, atomic updates |

Both implement the same interface:
- `save(plan, spilloverDisk, path)` - Create new plan
- `load(path)` - Load existing plan
- `exists(path)` - Check if plan exists
- `updateMoveStatus(path, source, status, error?)` - Update individual move
- `delete(path)` - Remove plan after completion

## Directory Structure

```
src/
├── main.ts                 # CLI entry point
├── cli/
│   ├── handler.ts          # Command handlers (runPlan, runApply)
│   ├── options.ts          # CLI option definitions
│   └── errors.ts           # Error formatting for CLI output
├── services/
│   ├── DiskService.ts      # Disk discovery and validation
│   ├── ScannerService.ts   # File scanning with grouping
│   ├── BinPackService.ts   # Bin-packing algorithm
│   └── TransferService.ts  # Rsync-based file transfer
├── infra/
│   ├── GlobService.ts      # File globbing (Bun.Glob)
│   ├── FileStatService.ts  # File stat operations
│   ├── DiskStatsService.ts # Disk space queries
│   ├── ShellService.ts     # Shell command execution
│   ├── PlanStorageService.ts      # JSON plan storage
│   └── SqlitePlanStorageService.ts # SQLite plan storage
├── domain/
│   ├── Disk.ts             # Disk type and utilities
│   ├── FileEntry.ts        # File metadata type
│   ├── FolderGroup.ts      # Folder grouping logic
│   └── MovePlan.ts         # Move plan type
├── lib/
│   └── parseSize.ts        # Human-readable size parsing
├── test/
│   └── TestContext.ts      # Test utilities and mocks
└── integration/
    └── handlers.test.ts    # End-to-end handler tests
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

### Build Docker Image

```bash
docker build -t unraid-bin-pack .
```

## Testing

The project has comprehensive test coverage across all layers.

### Test Categories

| Category | Files | Purpose |
|----------|-------|---------|
| **Unit** | `*.test.ts` in same dir | Test individual modules in isolation |
| **Integration** | `integration/*.test.ts` | Test handler flows with mocked I/O |
| **Infra Integration** | `infra.integration.test.ts` | Test real filesystem operations |

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
