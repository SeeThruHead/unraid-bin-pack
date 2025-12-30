import type { FileEntry } from "@domain/FileEntry"
import { groupFilesIntoBuckets, sampleFromAllBuckets } from "@domain/FileOrderStrategy"
import { scoreCombination, findBestScored, type ScoredCandidate } from "@domain/ScoringStrategy"
import { generateCombinations } from "../../lib/combinatorics"

const filesThatFit = (files: readonly FileEntry[], maxSize: number): readonly FileEntry[] =>
  files.filter(file => file.sizeBytes <= maxSize)

const combinationsThatFit = (
  combinations: readonly (readonly FileEntry[])[],
  maxSize: number
): readonly (readonly FileEntry[])[] =>
  combinations.filter(combo =>
    combo.reduce((sum, file) => sum + file.sizeBytes, 0) <= maxSize
  )

export const findBestSingleFile = (
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string
): ScoredCandidate | null => {
  const fitting = filesThatFit(files, availableBytes)
  const scored = fitting.map(file => scoreCombination([file], availableBytes, targetDisk))
  return findBestScored(scored)
}

export const findBestCombinationForDisk = (
  files: readonly FileEntry[],
  availableBytes: number,
  targetDisk: string,
  maxCombinationSize: number
): ScoredCandidate | null => {
  const fitting = filesThatFit(files, availableBytes)
  if (fitting.length === 0) return null

  const bestSingle = findBestSingleFile(fitting, availableBytes, targetDisk)

  const buckets = groupFilesIntoBuckets(fitting)
  const sampledFiles = sampleFromAllBuckets(buckets)

  const allCandidates: ScoredCandidate[] = bestSingle ? [bestSingle] : []

  for (let size = 2; size <= Math.min(maxCombinationSize, sampledFiles.length); size++) {
    const combinations = generateCombinations(sampledFiles, size)
    const fittingCombos = combinationsThatFit(combinations, availableBytes)
    const scored = fittingCombos.map(combo =>
      scoreCombination(combo, availableBytes, targetDisk)
    )
    allCandidates.push(...scored)
  }

  return findBestScored(allCandidates)
}
