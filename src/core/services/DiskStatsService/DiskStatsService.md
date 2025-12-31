# DiskStatsService

Retrieve disk space statistics.

## Overview

DiskStatsService fetches disk space information (total, free, used bytes) for disk paths using the `check-disk-space` library.

## Service Interface

```typescript
interface DiskStatsService {
  readonly getStats: (path: string) => Effect<DiskStats, DiskStatsError>;
}

interface DiskStats {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly usedBytes: number;
}
```

## Usage

```typescript
import { Effect } from "effect";
import { DiskStatsServiceTag } from "@services/DiskStatsService";

const program = Effect.gen(function* () {
  const diskStats = yield* DiskStatsServiceTag;

  const stats = yield* diskStats.getStats("/mnt/disk1");

  console.log(`Total: ${stats.totalBytes} bytes`);
  console.log(`Free: ${stats.freeBytes} bytes`);
  console.log(`Used: ${stats.usedBytes} bytes`);

  const usagePercent = (stats.usedBytes / stats.totalBytes) * 100;
  console.log(`Usage: ${usagePercent.toFixed(1)}%`);
});
```

## Error Handling

```typescript
const program = Effect.gen(function* () {
  const diskStats = yield* DiskStatsServiceTag;

  const stats = yield* diskStats.getStats("/mnt/disk1").pipe(
    Effect.catchTag("DiskStatsError", (error) => {
      console.error(`Failed to get stats: ${error.message}`);
      return Effect.succeed({
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0
      });
    })
  );

  return stats;
});
```

## See Also

- [DiskService](../DiskService/DiskService.md) - Disk validation
- [Disk](../../domain/Disk.md) - Disk utility functions
- [WorldView](../../domain/WorldView.md) - Uses disk stats
