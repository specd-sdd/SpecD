/**
 *
 */
export interface ArtifactListEntryDto {
  readonly filename: string
  readonly type: string
  readonly hasTasks: boolean
  readonly totalTasks?: number
  readonly completedTasks?: number
  readonly state: string
  readonly displayStatus: string
}

/**
 *
 */
export interface ArtifactListDto {
  readonly artifacts: readonly ArtifactListEntryDto[]
}
