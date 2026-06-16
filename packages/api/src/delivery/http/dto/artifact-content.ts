/**
 *
 */
export interface ArtifactContentDto {
  readonly filename: string
  readonly content: string
  readonly originalHash: string
  readonly contentHash?: string
  readonly updatedAt?: string
}
