# Disk

Core disk type and utility functions for disk space calculations.

## Type

```typescript
interface Disk {
  readonly path: string        // Disk mount path (e.g., '/mnt/disk1')
  readonly totalBytes: number  // Total disk capacity
  readonly freeBytes: number   // Available space
}

type DiskStats = Disk  // Alias for Disk
```

## Functions

### `usedBytes(disk)`

Calculates the used space on a disk.

```typescript
const disk = {
  path: '/mnt/disk1',
  totalBytes: 4_000_000_000_000,  // 4TB
  freeBytes: 1_000_000_000_000,    // 1TB free
}

const used = usedBytes(disk)
// 3_000_000_000_000 (3TB used)
```

**Formula:** `totalBytes - freeBytes`

### `usagePercent(disk)`

Calculates the percentage of disk space used.

```typescript
const disk = {
  path: '/mnt/disk1',
  totalBytes: 4_000_000_000_000,
  freeBytes: 1_000_000_000_000,
}

const pct = usagePercent(disk)
// 75.0 (75% full)
```

**Formula:** `(usedBytes / totalBytes) * 100`

**Edge case:** Returns `0` if `totalBytes === 0`

### `canFit(disk, bytes, threshold)`

Checks if a disk can fit additional bytes while maintaining a minimum free space threshold.

```typescript
const disk = {
  path: '/mnt/disk1',
  totalBytes: 4_000_000_000_000,
  freeBytes: 1_000_000_000_000,  // 1TB free
}

// Can we add 500GB while keeping 200GB free?
const fits = canFit(disk, 500_000_000_000, 200_000_000_000)
// true (1TB - 500GB = 500GB remaining, which is > 200GB threshold)

// Can we add 900GB while keeping 200GB free?
const fits2 = canFit(disk, 900_000_000_000, 200_000_000_000)
// false (1TB - 900GB = 100GB remaining, which is < 200GB threshold)
```

**Formula:** `freeBytes - bytes >= threshold`

## Usage Examples

### Checking Disk Fullness

```typescript
import { usagePercent } from '@domain/Disk'

const disks = [
  { path: '/mnt/disk1', totalBytes: 4e12, freeBytes: 500e9 },
  { path: '/mnt/disk2', totalBytes: 4e12, freeBytes: 3.5e12 },
]

disks.forEach(disk => {
  const pct = usagePercent(disk)
  console.log(`${disk.path}: ${pct.toFixed(1)}% full`)
})
// /mnt/disk1: 87.5% full
// /mnt/disk2: 12.5% full
```

### Verifying Space for Move

```typescript
import { canFit } from '@domain/Disk'

const targetDisk = {
  path: '/mnt/disk2',
  totalBytes: 4_000_000_000_000,
  freeBytes: 2_000_000_000_000,  // 2TB free
}

const fileSize = 1_500_000_000_000  // 1.5TB file
const minFreeSpace = 100_000_000_000  // Keep 100GB free

if (canFit(targetDisk, fileSize, minFreeSpace)) {
  console.log('Safe to move file')
} else {
  console.log('Not enough space')
}
```

## See Also

- [DiskState](./WorldView.md#diskstate) - Disk state in WorldView
- [DiskProjection](./DiskProjection.md) - Project future disk states
- [DiskRanking](./DiskRanking.md) - Rank disks by fullness
