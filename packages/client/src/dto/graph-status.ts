/** `GET /v1/graph/status` wire shape. */
export interface GraphStatusDto {
  readonly indexed: boolean
  readonly stale: boolean
  readonly fingerprint?: string
  readonly symbolCount?: number
  readonly fileCount?: number
}
