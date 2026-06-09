/**
 *
 */
export interface ChangeStatusDto {
  readonly name: string
  readonly state: string
  readonly updatedAt: string
  readonly unchanged?: boolean
  readonly specIds?: readonly string[]
  readonly blockers?: readonly { readonly code: string; readonly message: string }[]
  readonly nextAction?: {
    readonly targetStep: string
    readonly actionType: string
    readonly reason: string
    readonly command: string | null
  }
  readonly totalTasks?: number
  readonly completedTasks?: number
  readonly artifacts?: readonly {
    readonly type: string
    readonly hasTasks: boolean
    readonly totalTasks?: number
    readonly completedTasks?: number
    readonly state: string
    readonly effectiveStatus: string
    readonly displayStatus: string
    readonly files: readonly {
      readonly key: string
      readonly filename: string
      readonly state: string
      readonly hasDrift: boolean
      readonly displayStatus: string
    }[]
  }[]
  readonly review?: {
    readonly required: boolean
    readonly route: string | null
    readonly reason: string | null
  }
  readonly lifecycle?: {
    readonly validTransitions: readonly string[]
    readonly availableTransitions: readonly string[]
    readonly changePath: string
  }
}
