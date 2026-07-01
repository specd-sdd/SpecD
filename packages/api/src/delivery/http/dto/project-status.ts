import type { GraphHealthWarningDto } from '@specd/client'

/**
 *
 */
export interface ProjectStatusDto {
  readonly activeChanges: number
  readonly drafts: number
  readonly discarded: number
  readonly archived: number
  readonly specsByWorkspace: Record<string, number>
  readonly graph: {
    readonly lastIndexedAt: string | null
    readonly lastIndexedRef: string | null
    readonly stale: boolean | null
    readonly currentRef: string | null
    readonly fingerprintMismatch: boolean | null
    readonly fileCount: number | null
    readonly documentCount: number | null
    readonly symbolCount: number | null
    readonly specCount: number | null
    readonly warnings: readonly GraphHealthWarningDto[]
  }
  readonly approvals: { readonly specEnabled: boolean; readonly signoffEnabled: boolean }
}
