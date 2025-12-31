# FileFilter

File filtering functions for selecting which files should be candidates for consolidation.

## Types

### FileFilterCriteria

```typescript
interface FileFilterCriteria {
  readonly minSizeBytes?: number         // Minimum file size filter
  readonly pathPrefixes?: readonly string[]  // Path prefix filter
}
```

## Functions

### `filterFilesBySize(files, minSizeBytes)`

Filters files to only include those >= the minimum size.

```typescript
const large Files = filterFilesBySize(files, 10_000_000_000) // >= 10GB
```

**Use case:** Exclude small files from consolidation to reduce the number of operations.

### `filterFilesByPathPrefix(files, pathPrefixes)`

Filters files to only include those under the specified path prefixes.

```typescript
const mediaFiles = filterFilesByPathPrefix(files, ['/movies', '/tv'])
```

**Path matching:**
- Paths are relative to disk mount (e.g., `/mnt/disk1/movies` → `/movies`)
- Multiple prefixes are OR'd (matches ANY prefix)

**Use case:** Consolidate specific content types (e.g., only movies, not documents).

### `applyFileFilters(files, criteria)`

Applies multiple filters based on criteria. Filters are applied in order: size first, then path.

```typescript
const filtered = applyFileFilters(files, {
  minSizeBytes: 10_000_000_000,
  pathPrefixes: ['/movies'],
})
```

## Examples

### Filter by Size

Only include files >= 10GB:

<<< @/src/domain/FileFilter.example.ts#filterBySize

### Filter by Path Prefix

Only include movies and TV shows:

<<< @/src/domain/FileFilter.example.ts#filterByPath

### Apply Multiple Filters

Large movie files only:

<<< @/src/domain/FileFilter.example.ts#applyMultipleFilters

### No Filters

Empty criteria returns all files:

<<< @/src/domain/FileFilter.example.ts#noFilters

## Filter Behavior

### Size Filtering

- `minSizeBytes` not specified or `0` → No size filtering
- `minSizeBytes > 0` → Only files with `sizeBytes >= minSizeBytes`

### Path Filtering

- `pathPrefixes` not specified or empty → No path filtering
- `pathPrefixes` with values → Only files matching at least one prefix

### Combining Filters

When both filters are specified:
1. Size filter is applied first
2. Path filter is applied to the result
3. Files must pass BOTH filters

## Use Cases

### Large Files Only

```typescript
const criteria = {
  minSizeBytes: 10_000_000_000, // 10GB
}
```

Good for: Maximizing impact with fewer operations

### Specific Directories

```typescript
const criteria = {
  pathPrefixes: ['/movies', '/tv/series'],
}
```

Good for: Organizing content by type

### Large Media Files

```typescript
const criteria = {
  minSizeBytes: 5_000_000_000,     // 5GB
  pathPrefixes: ['/movies', '/tv'],
}
```

Good for: Consolidating significant media content

## See Also

- [FileEntry](./FileEntry.md) - File metadata structure
- [SimpleConsolidator](../services/BinPack/SimpleConsolidator.md) - Uses filters for consolidation
