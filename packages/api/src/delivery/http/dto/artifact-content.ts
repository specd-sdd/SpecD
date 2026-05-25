/**
 *
 */
export interface ArtifactContentDto {
  readonly content: string
  readonly originalHash: string
  readonly contentHash?: string
  readonly updatedAt?: string
}
