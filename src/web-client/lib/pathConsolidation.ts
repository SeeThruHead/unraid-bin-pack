import type { PatternResponse } from '../types'

export const consolidatePaths = (checkedPaths: string[], patterns: PatternResponse[]): string[] => {
  const checkedSet = new Set(checkedPaths)
  const consolidated: string[] = []

  for (const pattern of patterns) {
    const parentPath = pattern.pattern
    const childPaths = pattern.children.map(child => `${pattern.pattern}/${child}`)

    const allChildrenSelected = childPaths.length > 0 && childPaths.every(child => checkedSet.has(child))
    const parentSelected = checkedSet.has(parentPath)

    if (parentSelected || allChildrenSelected) {
      consolidated.push(parentPath)
    } else {
      consolidated.push(...childPaths.filter(child => checkedSet.has(child)))
    }
  }

  return consolidated
}

export const expandPaths = (consolidatedPaths: string[], patterns: PatternResponse[]): string[] => {
  const pathSet = new Set(consolidatedPaths)
  const expanded: string[] = []

  for (const pattern of patterns) {
    const parentPath = pattern.pattern
    const childPaths = pattern.children.map(child => `${pattern.pattern}/${child}`)

    if (pathSet.has(parentPath)) {
      expanded.push(parentPath)
      expanded.push(...childPaths)
    } else {
      expanded.push(...childPaths.filter(child => pathSet.has(child)))
    }
  }

  return expanded
}
