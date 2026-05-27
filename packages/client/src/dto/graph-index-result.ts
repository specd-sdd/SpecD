/** One workspace summary from `POST /v1/graph/index`. */
export interface WorkspaceGraphIndexBreakdownDto {
  readonly name: string
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly filesSkipped: number
  readonly filesRemoved: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
}

/** One per-file indexing error from `POST /v1/graph/index`. */
export interface GraphIndexErrorDto {
  readonly filePath: string
  readonly message: string
}

/** `POST /v1/graph/index` wire shape. */
export interface GraphIndexResultDto {
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly filesRemoved: number
  readonly filesSkipped: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
  readonly errors: readonly GraphIndexErrorDto[]
  readonly duration: number
  readonly workspaces: readonly WorkspaceGraphIndexBreakdownDto[]
  readonly vcsRef: string | null
  readonly graphFingerprint: string
  readonly fullRebuildReason: string | null
}
