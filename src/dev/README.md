# Mock UI Development

Lightweight local development setup for testing UI changes without Docker or real disks.

## Quick Start

Terminal 1 - Start mock API server:
```bash
bun run web:mock
```

Terminal 2 - Start Vite dev server:
```bash
bun run web:dev
```

Open http://localhost:3000

## What's Mocked

- **GET /api/disks** - Returns 3 mock disks with realistic sizes
- **GET /api/scan-patterns** - Returns Movies/TV/Anime/Music folders
- **POST /api/plan** - Returns mock plan with 42 files to move
- **POST /api/apply** - Simulates successful execution
- **GET /api/show** - Returns mock plan script

## Editing Mock Data

Edit `mock-data.ts` to change:
- Disk sizes and free space
- Folder patterns and children
- Plan results and projections

Changes are reflected immediately with HMR.

## Benefits

- No Docker rebuilds
- No real disk access
- Consistent test data
- Fast iteration (<100ms feedback)
- Same API contract as production
