/** `GET`/`PUT` change or spec artifact body. */
export interface ArtifactContentDto {
  readonly filename: string
  readonly content: string
  readonly originalHash: string
}
