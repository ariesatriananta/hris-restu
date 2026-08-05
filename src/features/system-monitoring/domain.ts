export type CronRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

export interface CronRunSummary {
  reason?: string
  contracts?: {
    activated?: number
    expired?: number
    activatedEmployees?: number
    inactivatedEmployees?: number
    legacyConflicts?: number
    skippedConflicts?: number
  }
  scheduledMutations?: {
    due?: number
    applied?: number
    failed?: number
    skipped?: number
  }
  scheduledStatusChanges?: {
    due?: number
    applied?: number
    failed?: number
    skipped?: number
  }
}

export interface CronRun {
  uid: string
  jobCode: string
  businessDate: string
  status: CronRunStatus
  summary?: CronRunSummary | null
  errorMessage?: string | null
  startedAt: string
  finishedAt?: string | null
  durationMs?: number | null
}

export interface CronRunOverview {
  lastRun?: CronRun | null
  lastSucceededAt?: string | null
  runningCount: number
  failedLast24Hours: number
}

export interface CronRunListResult {
  items: CronRun[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
  overview: CronRunOverview
}

export interface CronRunListParams {
  page: number
  pageSize: number
  status?: CronRunStatus
}

export interface ContractReconcileResult {
  status: 'SUCCEEDED' | 'SKIPPED'
  runUid: string
  reason?: string
  activated?: number
  expired?: number
}
