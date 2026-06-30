/** Confirmed implementation link (`GET .../implementation-review`). */
export interface ImplementationLinkDto {
  readonly specId: string
  readonly file: string
  readonly fileLinkExplicit: boolean
  readonly symbols?: readonly string[]
}

/** Tracked implementation file with review state. */
export interface TrackedImplementationFileDto {
  readonly file: string
  readonly state: 'open' | 'resolved' | 'ignored' | 'removed'
}

/** Manifest implementation-tracking projection. */
export interface ImplementationTrackingDto {
  readonly trackedFiles: readonly TrackedImplementationFileDto[]
  readonly links: readonly ImplementationLinkDto[]
}

/** `GET /v1/changes/{name}/implementation-review` wire shape. */
export interface ImplementationReviewDto {
  readonly implementationTracking: ImplementationTrackingDto
  readonly specIds: readonly string[]
}

/** `PATCH /v1/changes/{name}/spec-dependencies` wire shape. */
export interface UpdateSpecDependenciesResultDto {
  readonly specId: string
  readonly dependsOn: readonly string[]
}

/** `PATCH /v1/changes/{name}/implementation-tracking` wire shape. */
export interface UpdateImplementationTrackingResultDto {
  readonly implementationTracking: ImplementationTrackingDto
}
