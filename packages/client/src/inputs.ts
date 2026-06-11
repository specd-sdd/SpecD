/** Body for `POST /v1/changes`. */
export interface CreateChangeInput {
  readonly name: string
  readonly description?: string
  readonly specIds?: readonly string[]
  readonly schemaName?: string
  readonly schemaVersion?: string
  readonly invalidationPolicy?: string
}

/** Query for `GET .../status`. */
export interface GetChangeStatusOptions {
  readonly ifModifiedSince?: string
  readonly refreshImplementation?: boolean
  readonly signal?: AbortSignal
}

/** Body for `PUT .../artifacts/{filename}`. */
export interface SaveChangeArtifactInput {
  readonly content: string
  readonly originalHash: string
  readonly force?: boolean
}

/** Body for `POST .../validate` (mirrors API `specId` / `artifactId` query and body). */
export interface ValidateChangeInput {
  /** Spec in change scope, encoded as `workspace:capability-path`. */
  readonly specId?: string
  /** When set, only this schema artifact type is validated. */
  readonly artifactId?: string
  readonly signal?: AbortSignal
}

/** Body for `POST .../validate-all` (DAG batch; mirrors CLI `change validate --all`). */
export interface ValidateChangeBatchInput {
  /** When set, only this schema artifact type is validated across the batch schedule. */
  readonly artifactId?: string
  readonly signal?: AbortSignal
}

/** Body for `POST .../transition`. */
export interface TransitionChangeInput {
  readonly targetState: string
  readonly reason?: string
}

/** Body for `PATCH /v1/changes/{name}`. */
export interface PatchChangeInput {
  readonly description?: string
  readonly addSpecIds?: readonly string[]
  readonly removeSpecIds?: readonly string[]
  readonly invalidationPolicy?: string
}

/** Query for change context / preview. */
export interface ChangeContextQuery {
  readonly step?: string
  readonly artifactType?: string
  /** When omitted, API defaults to true (seed change `specIds`). Pass `false` to disable. */
  readonly includeChangeSpecs?: boolean
  readonly followDeps?: boolean
  readonly depth?: number
  readonly fingerprint?: string
  readonly signal?: AbortSignal
}

/** Query for `GET .../changes/:name/preview`. */
export interface PreviewChangeQuery {
  readonly specId: string
  readonly signal?: AbortSignal
}

/** Body for `POST .../changes/:name/preview` (draft-aware spec-preview). */
export interface PreviewChangeDraftInput {
  readonly specId: string
  readonly artifactOverrides?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

/** Body for `POST .../changes/:name/artifacts/:filename/outline`. */
export interface OutlineChangeArtifactInput {
  readonly content?: string
  readonly signal?: AbortSignal
}

/** Body for `POST .../workspaces/:ws/specs/:path/outline`. */
export interface OutlineSpecDraftInput {
  readonly filename: string
  readonly content: string
  readonly signal?: AbortSignal
}

/** Query for graph search. */
export interface GraphSearchInput {
  readonly q: string
  readonly workspace?: string
  readonly kinds?: readonly string[]
  readonly filePattern?: string
  readonly excludePaths?: readonly string[]
  readonly excludeWorkspaces?: readonly string[]
  readonly symbols?: boolean
  readonly specs?: boolean
  readonly documents?: boolean
  readonly limit?: number
  readonly signal?: AbortSignal
}

/** Query for graph impact. */
export interface GraphImpactInput {
  readonly symbol?: string
  readonly file?: string
  readonly spec?: string
  readonly direction?: 'dependents' | 'dependencies' | 'upstream' | 'downstream' | 'both'
  readonly depth?: number
  readonly signal?: AbortSignal
}

/** Body for `POST /v1/graph/index`. */
export interface GraphIndexInput {
  readonly force?: boolean
  readonly signal?: AbortSignal
}

/** Body for `PATCH /v1/changes/{name}/spec-dependencies`. */
export interface UpdateSpecDependenciesInput {
  readonly specId: string
  readonly add?: readonly string[]
  readonly remove?: readonly string[]
  readonly set?: readonly string[]
}

/** Body for `PATCH /v1/changes/{name}/implementation-tracking`. */
export interface UpdateImplementationTrackingInput {
  readonly action: 'add' | 'remove' | 'ignore' | 'resolve'
  readonly file: string
  readonly specId?: string
  readonly symbols?: readonly string[]
}

/** Overlap report entry. */
export interface ChangeOverlapEntryDto {
  readonly specId: string
  readonly changes: readonly { readonly name: string; readonly state: string }[]
}

/** `GET /v1/changes/overlaps` wire shape. */
export interface ChangeOverlapsDto {
  readonly hasOverlap: boolean
  readonly entries: readonly ChangeOverlapEntryDto[]
}
