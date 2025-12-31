import type { UseFormReturnType } from '@mantine/form'
import type { DiskResponse, PatternResponse, PlanResponse, DiskProjection } from '../web-server/types'

export interface PlanFormValues {
  destDisks: string[]
  sourceDisk: string
  pathFilters: string[]
  minSpace: string
  minFileSize: string
  include: string[]
  includeCustom: string
  exclude: string[]
  excludeCustom: string
  minSplitSize: string
  moveAsFolderThreshold: string
  debug: boolean
  force: boolean
}

export type PlanForm = UseFormReturnType<PlanFormValues>

export type { DiskResponse, PatternResponse, PlanResponse, DiskProjection }
