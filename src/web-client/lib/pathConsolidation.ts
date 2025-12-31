import type { PatternResponse } from "../types";

interface ProcessedPatterns {
  parentToChildren: Map<string, string[]>;
  allParents: Set<string>;
}

const patternsCache = new WeakMap<PatternResponse[], ProcessedPatterns>();

function getProcessedPatterns(patterns: PatternResponse[]): ProcessedPatterns {
  const cached = patternsCache.get(patterns);
  if (cached) {
    return cached;
  }

  const processed = patterns.reduce(
    (acc, pattern) => {
      acc.allParents.add(pattern.pattern);
      const childPaths = pattern.children.map((child) => `${pattern.pattern}/${child}`);
      acc.parentToChildren.set(pattern.pattern, childPaths);
      return acc;
    },
    { parentToChildren: new Map<string, string[]>(), allParents: new Set<string>() }
  );

  patternsCache.set(patterns, processed);
  return processed;
}

const consolidateCache = new Map<string, string[]>();
const expandCache = new Map<string, string[]>();
const MAX_CACHE_SIZE = 100;

function getCacheKey(paths: string[], patterns: PatternResponse[]): string {
  const sorted = paths.length < 20 ? paths.slice().sort() : paths;
  const patternsKey = patterns.length;
  const pathsKey =
    sorted.length < 20
      ? sorted.join("|")
      : `${sorted.length}:${sorted[0]}:${sorted[sorted.length - 1]}`;
  return `${patternsKey}:${pathsKey}`;
}

function limitCacheSize(cache: Map<string, string[]>) {
  if (cache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(cache.keys()).slice(0, 20);
    for (const key of keysToDelete) {
      cache.delete(key);
    }
  }
}

export function consolidatePaths(checkedPaths: string[], patterns: PatternResponse[]): string[] {
  const cacheKey = getCacheKey(checkedPaths, patterns);
  const cached = consolidateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { parentToChildren, allParents } = getProcessedPatterns(patterns);
  const checkedSet = new Set(checkedPaths);

  const consolidated = Array.from(allParents).flatMap((parentPath) => {
    const childPaths = parentToChildren.get(parentPath) ?? [];
    const parentSelected = checkedSet.has(parentPath);

    if (parentSelected) {
      return [parentPath];
    } else if (childPaths.length > 0) {
      const allSelected = childPaths.every((child) => checkedSet.has(child));

      if (allSelected) {
        return [parentPath];
      } else {
        return childPaths.filter((child) => checkedSet.has(child));
      }
    }
    return [];
  });

  consolidateCache.set(cacheKey, consolidated);
  limitCacheSize(consolidateCache);
  return consolidated;
}

export function expandPaths(consolidatedPaths: string[], patterns: PatternResponse[]): string[] {
  const cacheKey = getCacheKey(consolidatedPaths, patterns);
  const cached = expandCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { parentToChildren, allParents } = getProcessedPatterns(patterns);
  const pathSet = new Set(consolidatedPaths);
  const expanded: string[] = [];

  for (const parentPath of allParents) {
    const childPaths = parentToChildren.get(parentPath) ?? [];

    if (pathSet.has(parentPath)) {
      expanded.push(parentPath);
      for (const child of childPaths) {
        expanded.push(child);
      }
    } else {
      for (const child of childPaths) {
        if (pathSet.has(child)) {
          expanded.push(child);
        }
      }
    }
  }

  expandCache.set(cacheKey, expanded);
  limitCacheSize(expandCache);
  return expanded;
}
