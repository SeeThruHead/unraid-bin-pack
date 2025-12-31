# Using the Core Library

The core library (`src/core/`) provides a minimal, reusable API for consolidating files across Unraid disks. It can be used by any interface (CLI, web, API, custom implementations).

## Public API

```typescript
import {
  createPlan,
  executePlanScript,
  readPlanScript,
  AppLive,
  type PlanConfig,
  type ApplyConfig,
  type PlanResult,
  type ExecutionResult,
} from './src/core'
```

## Example: CLI Implementation

The current CLI in `src/cli/` demonstrates this pattern:

```typescript
import { createPlan, AppLive, type PlanConfig } from '@core'
import { Effect } from 'effect'

// 1. Get configuration from CLI prompts/args
const config: PlanConfig = {
  src: '/mnt/disk1',
  dest: '/mnt/disk2,/mnt/disk3',
  minSpace: '100GB',
  minFileSize: '1MB',
}

const diskPaths = ['/mnt/disk2', '/mnt/disk3']

// 2. Call core library
const program = createPlan(diskPaths, config).pipe(
  Effect.map(result => {
    // 3. Handle result (CLI saves to file, displays stats)
    console.log(`Plan created: ${result.stats.movesPlanned} moves`)
    return result.script
  }),
  Effect.provide(AppLive)
)

// 4. Run the Effect
await Effect.runPromise(program)
```

## Example: Future Web API

```typescript
// src/web/api/plan.ts
import { createPlan, AppLive, type PlanConfig } from '@core'
import { Effect } from 'effect'

export async function POST(req: Request) {
  // 1. Parse JSON body to config
  const body = await req.json()
  const config: PlanConfig = {
    src: body.src,
    dest: body.dest,
    minSpace: body.minSpace,
    minFileSize: body.minFileSize,
    pathFilter: body.pathFilter,
    include: body.include,
    exclude: body.exclude,
    debug: body.debug,
  }

  // 2. Call same core library
  const program = createPlan(body.diskPaths, config).pipe(
    Effect.map(result => ({
      success: true,
      script: result.script,
      stats: result.stats,
      moves: result.moves,
    })),
    Effect.provide(AppLive)
  )

  // 3. Return JSON response
  try {
    const result = await Effect.runPromise(program)
    return Response.json(result)
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
```

## Example: Custom Automation Script

```typescript
// my-custom-script.ts
import { createPlan, AppLive } from './src/core'
import { Effect } from 'effect'

const autoConsolidate = Effect.gen(function* () {
  // Hardcoded configuration for automation
  const config = {
    minSpace: '100GB',
    minFileSize: '10MB',
    exclude: '.DS_Store,@eaDir',
  }

  const diskPaths = ['/mnt/disk1', '/mnt/disk2', '/mnt/disk3']

  // Create plan
  const result = yield* createPlan(diskPaths, config)

  // Save to custom location
  await Bun.write('/var/log/consolidation-plan.sh', result.script)

  // Log to monitoring system
  console.log(`Consolidation plan: ${result.stats.bytesConsolidated} bytes`)

  return result
})

// Run with AppLive layer
await Effect.runPromise(autoConsolidate.pipe(Effect.provide(AppLive)))
```

## Core API Functions

### createPlan

Creates a consolidation plan using bin-packing algorithms.

```typescript
createPlan(
  diskPaths: string[] | readonly string[],
  config: PlanConfig
): Effect<PlanResult, DomainError, /* services */>
```

**Returns:** `PlanResult` with:
- `script`: Executable bash script with rsync commands
- `moves`: Array of file moves to perform
- `stats`: Statistics (bytes consolidated, moves planned, etc.)

### executePlanScript

Executes or previews a plan script.

```typescript
executePlanScript(
  scriptPath: string,
  config: ApplyConfig
): Effect<ExecutionResult, Error, FileSystem>
```

**Config:**
- `planPath`: Path to the script file
- `concurrency`: Number of parallel transfers
- `dryRun`: If true, just shows what would execute

### readPlanScript

Reads a plan script file.

```typescript
readPlanScript(
  scriptPath: string
): Effect<string, Error, FileSystem>
```

## Configuration Types

### PlanConfig

```typescript
interface PlanConfig {
  readonly src?: string              // Source disk(s) (comma-separated)
  readonly dest?: string             // Destination disk(s) (comma-separated)
  readonly minSpace?: string         // Min free space per disk (e.g., "100GB")
  readonly minFileSize?: string      // Min file size to move (e.g., "1MB")
  readonly pathFilter?: string       // Path prefixes to include (comma-separated)
  readonly include?: string          // File patterns to include (e.g., "*.mkv,*.mp4")
  readonly exclude?: string          // Patterns to exclude (e.g., ".DS_Store")
  readonly minSplitSize?: string     // Min folder size to allow splitting
  readonly moveAsFolderThreshold?: string  // Keep folder together threshold (0.0-1.0)
  readonly debug?: boolean           // Enable debug logging
}
```

### ApplyConfig

```typescript
interface ApplyConfig {
  readonly planPath: string
  readonly concurrency: number
  readonly dryRun: boolean
}
```

## Required Layer

All core functions require the `AppLive` layer to be provided:

```typescript
import { AppLive } from '@core'
import { Effect } from 'effect'

const program = createPlan(diskPaths, config).pipe(
  Effect.provide(AppLive)  // Required!
)
```

This layer provides all necessary services (disk scanning, file I/O, logging, etc.).

## Error Handling

The core library uses Effect's error handling:

```typescript
import { Effect } from 'effect'

const program = createPlan(diskPaths, config).pipe(
  Effect.catchAll(error => {
    // Handle any errors
    console.error('Plan creation failed:', error)
    return Effect.succeed(null)
  }),
  Effect.provide(AppLive)
)
```

## What's Not Exposed

The core library intentionally keeps internal implementation details private:

- Internal domain functions (usedBytes, canFit, etc.)
- Service implementations (unless needed for configuration)
- Algorithm internals

Only the minimal API needed to use the library is exposed.
