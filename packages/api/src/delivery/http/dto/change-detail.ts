/**
 *
 */
export interface ChangeHistoryEventDto {
  readonly type: string
  readonly at: string
  readonly by: { readonly name: string; readonly email: string }
  readonly [key: string]: unknown
}

/**
 *
 */
export interface ChangeDetailDto {
  readonly name: string
  readonly state: string
  readonly specIds: readonly string[]
  readonly specDependsOn: Record<string, readonly string[]>
  readonly schemaName: string
  readonly schemaVersion: number
  readonly description?: string
  readonly invalidationPolicy?: string
  readonly updatedAt: string
  readonly history: readonly ChangeHistoryEventDto[]
  readonly approvals: {
    readonly specApproved: boolean
    readonly signoffApproved: boolean
  }
}
