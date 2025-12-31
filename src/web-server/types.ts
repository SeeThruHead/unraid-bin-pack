import type { SSEStreamingApi } from 'hono/streaming'

export interface DiskResponse {
  path: string
  totalBytes: number
  freeBytes: number
  totalGB: number
  freeGB: number
  usedPct: number
}

export interface PatternResponse {
  pattern: string
  name: string
  children: string[]
}

export interface DiskProjection {
  path: string
  totalBytes: number
  currentFree: number
  freeAfter: number
}

export interface PlanStats {
  movesPlanned: number
  bytesConsolidated: number
}

export interface PlanResponse {
  script: string
  stats: PlanStats
  diskProjections: DiskProjection[]
}

export type SSEStreamAPI = SSEStreamingApi
