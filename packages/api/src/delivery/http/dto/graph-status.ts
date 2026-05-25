/**
 *
 */
export interface GraphStatusDto {
  readonly lastIndexedAt: string | null
  readonly lastIndexedRef: string | null
  readonly fileCount: number
  readonly symbolCount: number
  readonly specCount: number
  readonly graphFingerprint: string | null
  readonly stale: boolean | null
}
