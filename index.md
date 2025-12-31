# Unraid Bin Pack

A CLI tool for consolidating files across Unraid disk arrays using efficient bin-packing algorithms.

## Quick Start

```bash
# Run interactive consolidation
unraid-bin-pack plan interactive

# Plan consolidation with specific options
unraid-bin-pack plan --min-space 100GB --min-file-size 10GB
```

## Core Concepts

### WorldView

The [WorldView](./src/domain/WorldView.md) represents the current state of your disk array - all disks and all files at a point in time. It's the primary input to the consolidation algorithms.

### Consolidation

The [SimpleConsolidator](./src/services/BinPack/SimpleConsolidator.md) uses bin-packing algorithms to find optimal file combinations to move from fuller disks to emptier ones, with the goal of completely emptying source disks.

### Move Plans

A [MovePlan](./src/domain/MovePlan.md) is the output - a set of file moves that achieve your consolidation goals. Plans can be executed directly or exported as bash scripts.

## Architecture

### Domain Layer

Core types and business logic:

- **[WorldView](./src/domain/WorldView.md)** - Disk and file state
- **[MovePlan](./src/domain/MovePlan.md)** - File move operations
- **[FileFilter](./src/domain/FileFilter.md)** - File filtering logic
- **[FileEntry](./src/domain/FileEntry.md)** - File metadata
- **[DiskProjection](./src/domain/DiskProjection.md)** - Disk space projections
- **[FolderGroup](./src/domain/FolderGroup.md)** - Folder-based grouping

### Services

Infrastructure and algorithms:

#### Core Algorithm
- **[SimpleConsolidator](./src/services/BinPack/SimpleConsolidator.md)** - Main consolidation algorithm
- **[MoveGenerator](./src/services/BinPack/MoveGenerator.md)** - Bin-packing implementation

#### Data Collection
- **[ScannerService](./src/services/ScannerService/ScannerService.md)** - Scans disks and creates WorldView
- **[DiskService](./src/services/DiskService/DiskService.md)** - Disk metadata operations
- **[DiskStatsService](./src/services/DiskStatsService/DiskStatsService.md)** - Disk space statistics
- **[FileStatService](./src/services/FileStatService/FileStatService.md)** - File metadata operations
- **[GlobService](./src/services/GlobService/GlobService.md)** - File discovery

#### Execution
- **[PlanGenerator](./src/services/PlanGenerator/PlanGenerator.md)** - Generates consolidation plans
- **[PlanScriptGenerator](./src/services/PlanScriptGenerator/PlanScriptGenerator.md)** - Exports plans as bash scripts
- **[TransferService](./src/services/TransferService/TransferService.md)** - Executes file transfers

#### Infrastructure
- **[LoggerService](./src/services/LoggerService/LoggerService.md)** - Structured logging
- **[ShellService](./src/services/ShellService/ShellService.md)** - Shell command execution
- **[TerminalUIService](./src/services/TerminalUIService/TerminalUIService.md)** - Interactive prompts

### CLI Layer

Command-line interface:

- **[Handler](./src/cli/handler.md)** - Command handlers
- **[Interactive](./src/cli/interactive.md)** - Interactive mode
- **[Options](./src/cli/options.md)** - CLI option definitions
- **[Errors](./src/cli/errors.md)** - Error handling and formatting

## Workflow

1. **Scan** - ScannerService discovers all disks and files
2. **Filter** - Apply size and path filters to files
3. **Rank** - Rank disks by fullness
4. **Pack** - Find optimal file combinations using bin-packing
5. **Plan** - Generate MovePlan with selected moves
6. **Execute** - Run transfers via bash script or TransferService

## Effect.js

This project uses [Effect](https://effect.website/) for:
- Type-safe error handling
- Dependency injection via services
- Composable operations
- Structured logging

All major operations return `Effect<Success, Error, Requirements>` types that can be composed and executed.
