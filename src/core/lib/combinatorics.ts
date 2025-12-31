export const generateCombinations = <T>(
  array: readonly T[],
  k: number
): readonly (readonly T[])[] => {
  if (k === 0) return [[]]
  if (k > array.length) return []
  if (k === 1) return array.map(item => [item])

  const results: T[][] = []

  const backtrack = (start: number, current: T[]) => {
    if (current.length === k) {
      results.push([...current])
      return
    }

    for (let i = start; i < array.length; i++) {
      const item = array[i]
      if (item !== undefined) {
        current.push(item)
        backtrack(i + 1, current)
        current.pop()
      }
    }
  }

  backtrack(0, [])
  return results
}
