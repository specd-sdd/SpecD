/**
 *
 */
export interface ArtifactListEntryDto {
  readonly filename: string
  readonly type: string
  readonly state: string
  readonly displayStatus: string
}

/**
 *
 */
export interface ArtifactListDto {
  readonly artifacts: readonly ArtifactListEntryDto[]
}
