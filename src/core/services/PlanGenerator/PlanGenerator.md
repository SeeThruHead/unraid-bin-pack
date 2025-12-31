# PlanGenerator

Orchestrates the consolidation process from scanning to plan generation.

## Overview

PlanGenerator is a high-level service that combines scanning, filtering, consolidation, and script generation into a single workflow.

## Service Interface

```typescript
interface PlanGeneratorService {
  readonly generate: (options: PlanGeneratorOptions) => Effect<string>
}

interface PlanGeneratorOptions {
  readonly moves: readonly FileMove[]
  readonly sourceDisk: string
  readonly diskStats: Record<string, DiskStats>
  readonly concurrency: number
}
```

## Usage

```typescript
import { Effect } from 'effect'
import { PlanGeneratorServiceTag } from '@services/PlanGenerator'

const program = Effect.gen(function* () {
  const planGenerator = yield* PlanGeneratorServiceTag

  const bashScript = yield* planGenerator.generate({
    moves: consolidationResult.moves,
    sourceDisk: '/mnt/disk1',
    diskStats: {
      '/mnt/disk1': { totalBytes: 4e12, freeBytes: 1e12 },
      '/mnt/disk2': { totalBytes: 4e12, freeBytes: 3e12 },
    },
    concurrency: 4,
  })

  // Save or execute the script
  console.log(bashScript)
})
```

## How It Works

The service generates a bash script that:
1. Uses rsync to transfer files
2. Groups files by target disk for efficiency
3. Runs transfers in parallel (up to concurrency limit)
4. Removes source files after successful transfer

## See Also

- [SimpleConsolidator](../BinPack/SimpleConsolidator.md) - Generates consolidation results
- [PlanScriptGenerator](../PlanScriptGenerator/PlanScriptGenerator.md) - Script generation implementation
- [MovePlan](../../domain/MovePlan.md) - Move plan structure
