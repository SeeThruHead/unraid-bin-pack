export const mockDisks = [
  {
    path: '/mnt/disk1',
    totalBytes: 4000000000000, // 4TB
    freeBytes: 500000000000,   // 500GB
    totalGB: 3725.29,
    freeGB: 465.66,
    usedPct: 87.5,
  },
  {
    path: '/mnt/disk2',
    totalBytes: 4000000000000,
    freeBytes: 1500000000000, // 1.5TB
    totalGB: 3725.29,
    freeGB: 1396.98,
    usedPct: 62.5,
  },
  {
    path: '/mnt/disk3',
    totalBytes: 8000000000000, // 8TB
    freeBytes: 6000000000000,  // 6TB
    totalGB: 7450.58,
    freeGB: 5587.94,
    usedPct: 25.0,
  },
]

export const mockPatterns = [
  {
    pattern: '/Movies',
    name: 'Movies',
    children: [
      'Action Movies (2023)',
      'Comedy Films (2022)',
      'Drama Collection (2024)',
      'Sci-Fi Classics (2021)',
    ],
  },
  {
    pattern: '/TV',
    name: 'TV',
    children: [
      'Breaking Bad (2008)',
      'Game of Thrones (2011)',
      'The Office (2005)',
      'Stranger Things (2016)',
    ],
  },
  {
    pattern: '/Anime',
    name: 'Anime',
    children: [
      'Attack on Titan (2013)',
      'Death Note (2006)',
      'One Piece (1999)',
      'Cowboy Bebop (1998)',
    ],
  },
  {
    pattern: '/Music',
    name: 'Music',
    children: [
      'Rock',
      'Jazz',
      'Classical',
      'Electronic',
    ],
  },
]

export const mockPlanResult = {
  script: `#!/bin/bash
#
# Unraid Bin-Pack Plan
# Generated: 2025-12-30
#
# Source disk: /mnt/disk1
# Total files: 42
# Total size: 125.5 GB
# Concurrency: 4
#

set -e

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "/config/plan.log"
}

log "Starting plan execution..."
log "Batch 1: Transferring 15 files (45.2 GB) from /mnt/disk1 to /mnt/disk3"
log "Batch 2: Transferring 27 files (80.3 GB) from /mnt/disk1 to /mnt/disk2"
log "All transfers completed successfully!"
`,
  stats: {
    movesPlanned: 42,
    bytesConsolidated: 134744072192, // ~125.5GB
  },
  diskProjections: [
    {
      path: '/mnt/disk1',
      totalBytes: 4000000000000,
      currentFree: 500000000000,
      freeAfter: 634744072192, // 500GB + 125.5GB
    },
    {
      path: '/mnt/disk2',
      totalBytes: 4000000000000,
      currentFree: 1500000000000,
      freeAfter: 1413678387200, // 1.5TB - 80.3GB
    },
    {
      path: '/mnt/disk3',
      totalBytes: 8000000000000,
      currentFree: 6000000000000,
      freeAfter: 5951465684992, // 6TB - 45.2GB
    },
  ],
}
