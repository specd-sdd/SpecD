import type { GraphHealthWarningDto } from '@specd/client'

/**
 *
 */
export interface GraphStatusDto {
  readonly lastIndexedAt: string | null
  readonly lastIndexedRef: string | null
  readonly fileCount: number
  readonly documentCount: number
  readonly symbolCount: number
  readonly specCount: number
  readonly graphFingerprint: string | null
  readonly stale: boolean | null
  readonly currentRef: string | null
  readonly fingerprintMismatch: boolean | null
  readonly warnings: readonly GraphHealthWarningDto[]
}
