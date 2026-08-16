/** Logical graph resource kinds backed by indexed inputs. */
export const IndexedResourceKind = {
  File: 'file',
  Document: 'document',
  Spec: 'spec',
} as const

/** Logical graph resource kind. */
export type IndexedResourceKind = (typeof IndexedResourceKind)[keyof typeof IndexedResourceKind]

/** Persisted input mechanisms used to derive graph resources. */
export const IndexedInputKind = {
  Filesystem: 'filesystem',
  Repository: 'repository',
} as const

/** Persisted input mechanism. */
export type IndexedInputKind = (typeof IndexedInputKind)[keyof typeof IndexedInputKind]

/** Tri-state freshness used by targeted and aggregate assessment. */
export const FreshnessState = {
  Current: 'current',
  Stale: 'stale',
  Unknown: 'unknown',
} as const

/** Tri-state freshness value. */
export type FreshnessState = (typeof FreshnessState)[keyof typeof FreshnessState]

/** Workspace assessment strategy. */
export const FreshnessMode = {
  Vcs: 'vcs',
  Filesystem: 'filesystem',
  Hybrid: 'hybrid',
} as const

/** Workspace assessment strategy. */
export type FreshnessMode = (typeof FreshnessMode)[keyof typeof FreshnessMode]

/** Stable identity for one indexed graph resource. */
export interface IndexedResourceKey {
  readonly workspace: string
  readonly resourceKind: IndexedResourceKind
  readonly resourceId: string
}

/** Backend-neutral evidence for one physical or repository input. */
export interface IndexedInputObservation extends IndexedResourceKey {
  readonly inputKind: IndexedInputKind
  readonly inputLocator: string
  readonly indexedContentHash: string
  readonly lastObservedMtime?: number
  readonly lastObservedSize?: number
  readonly lastObservedRevision?: string
  readonly generation: string
  readonly stale: boolean
}

/** Compare-and-set request that monotonically marks one indexed input stale. */
export interface MarkIndexedInputStaleInput extends IndexedResourceKey {
  readonly inputKind: IndexedInputKind
  readonly inputLocator: string
  readonly expectedIndexedContentHash: string
  readonly expectedRevision?: string
  readonly expectedGeneration: string
}

/** Compare-and-set metadata refresh for equal-content filesystem evidence. */
export interface UpdateIndexedInputObservationInput extends MarkIndexedInputStaleInput {
  readonly lastObservedMtime: number
  readonly lastObservedSize: number
}

/** Persisted monotonic freshness latches. */
export interface FreshnessLatches {
  readonly graph: boolean
  readonly workspaces: Readonly<Record<string, boolean>>
}

/** Freshness result for one exact indexed resource. */
export interface IndexedResourceFreshnessResult extends IndexedResourceKey {
  readonly state: FreshnessState
  readonly reasons: readonly string[]
}

/** Freshness projection for one configured workspace. */
export interface WorkspaceFreshnessResult {
  readonly workspace: string
  readonly state: FreshnessState
  readonly mode: FreshnessMode
  readonly knownStaleSinceLastIndex: boolean
  readonly reasons: readonly string[]
}
