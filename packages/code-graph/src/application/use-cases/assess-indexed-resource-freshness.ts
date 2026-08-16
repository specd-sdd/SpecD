import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { computeContentHash } from './compute-content-hash.js'
import {
  FreshnessState,
  IndexedInputKind,
  type IndexedInputObservation,
  type IndexedResourceFreshnessResult,
  type IndexedResourceKey,
  type MarkIndexedInputStaleInput,
  type UpdateIndexedInputObservationInput,
} from '../../domain/value-objects/indexed-input-freshness.js'

/** Persistence surface required by exact-resource freshness assessment. */
export interface IndexedInputFreshnessStore {
  getIndexedInputObservations(
    resources: readonly IndexedResourceKey[],
  ): Promise<readonly IndexedInputObservation[]>
  markIndexedInputsStale(updates: readonly MarkIndexedInputStaleInput[]): Promise<void>
  updateIndexedInputObservations(
    updates: readonly UpdateIndexedInputObservationInput[],
  ): Promise<void>
  markWorkspacesAndGraphStaleSinceLastIndex(workspaces: readonly string[]): Promise<void>
}

/** Input for batch exact-resource freshness assessment. */
export interface AssessIndexedResourceFreshnessInput {
  readonly resources: readonly IndexedResourceKey[]
  readonly workspaceRoots: ReadonlyMap<string, string>
  readonly repositoryRevisions?: ReadonlyMap<string, string>
  /** Forces filesystem candidates selected by an external change detector through content CAS. */
  readonly forceFilesystemHash?: boolean
}

/** Assesses only the persisted inputs that produced requested graph resources. */
export class AssessIndexedResourceFreshness {
  /**
   * Creates an exact-resource freshness assessor.
   * @param store - Observation and monotonic-cache persistence.
   */
  constructor(private readonly store: IndexedInputFreshnessStore) {}

  /**
   * Assesses a deduplicated resource batch with stamp fast paths and content CAS updates.
   * @param input - Resources, workspace roots, and optional repository revisions.
   * @returns One deterministic tri-state result per requested resource.
   */
  async execute(
    input: AssessIndexedResourceFreshnessInput,
  ): Promise<readonly IndexedResourceFreshnessResult[]> {
    const resources = deduplicateResources(input.resources)
    if (resources.length === 0) return []

    let observations: readonly IndexedInputObservation[]
    try {
      observations = await this.store.getIndexedInputObservations(resources)
    } catch {
      return resources.map((resource) => unknownResult(resource, 'OBSERVATION_READ_FAILED'))
    }

    const byResource = new Map<string, IndexedInputObservation[]>()
    for (const observation of observations) {
      const existing = byResource.get(resourceKey(observation)) ?? []
      existing.push(observation)
      byResource.set(resourceKey(observation), existing)
    }

    const staleUpdates: MarkIndexedInputStaleInput[] = []
    const refreshUpdates: UpdateIndexedInputObservationInput[] = []
    const staleWorkspaces = new Set<string>()
    const results: IndexedResourceFreshnessResult[] = []

    for (const resource of resources) {
      const resourceObservations = byResource.get(resourceKey(resource)) ?? []
      if (resourceObservations.length === 0) {
        results.push(unknownResult(resource, 'OBSERVATION_MISSING'))
        continue
      }

      const assessments = await Promise.all(
        resourceObservations.map((observation) =>
          assessObservation(observation, input, staleUpdates, refreshUpdates),
        ),
      )
      const state = aggregateStates(assessments.map((assessment) => assessment.state))
      const reasons = [
        ...new Set(
          assessments
            .filter((assessment) => assessment.state !== FreshnessState.Current)
            .map((assessment) => assessment.reason),
        ),
      ].sort()
      if (state === FreshnessState.Stale) staleWorkspaces.add(resource.workspace)
      results.push({ ...resource, state, reasons })
    }

    if (refreshUpdates.length > 0) {
      await this.store.updateIndexedInputObservations(refreshUpdates)
    }
    if (staleUpdates.length > 0) {
      await this.store.markIndexedInputsStale(staleUpdates)
      await this.store.markWorkspacesAndGraphStaleSinceLastIndex([...staleWorkspaces].sort())
    }
    return results
  }
}

/** Internal tri-state assessment for one physical observation. */
interface ObservationAssessment {
  readonly state: FreshnessState
  readonly reason: string
}

/**
 * Assesses one observation and accumulates guarded persistence updates.
 * @param observation - Persisted evidence to assess.
 * @param input - Batch assessment context.
 * @param staleUpdates - Guarded stale updates to accumulate.
 * @param refreshUpdates - Equal-content stamp updates to accumulate.
 * @returns Tri-state assessment for the observation.
 */
async function assessObservation(
  observation: IndexedInputObservation,
  input: AssessIndexedResourceFreshnessInput,
  staleUpdates: MarkIndexedInputStaleInput[],
  refreshUpdates: UpdateIndexedInputObservationInput[],
): Promise<ObservationAssessment> {
  if (observation.stale) {
    return { state: FreshnessState.Stale, reason: 'INPUT_KNOWN_STALE' }
  }
  if (observation.inputKind === IndexedInputKind.Repository) {
    const currentRevision = input.repositoryRevisions?.get(repositoryRevisionKey(observation))
    if (currentRevision === undefined) {
      return { state: FreshnessState.Unknown, reason: 'REPOSITORY_REVISION_UNKNOWN' }
    }
    if (currentRevision === observation.lastObservedRevision) {
      return { state: FreshnessState.Current, reason: 'REPOSITORY_REVISION_MATCH' }
    }
    staleUpdates.push(toStaleUpdate(observation))
    return { state: FreshnessState.Stale, reason: 'REPOSITORY_REVISION_CHANGED' }
  }

  const workspaceRoot = input.workspaceRoots.get(observation.workspace)
  if (workspaceRoot === undefined) {
    return { state: FreshnessState.Unknown, reason: 'WORKSPACE_ROOT_UNKNOWN' }
  }
  const absoluteInput = resolveConfinedInput(workspaceRoot, observation.inputLocator)
  if (absoluteInput === null) {
    return { state: FreshnessState.Unknown, reason: 'INPUT_LOCATOR_INVALID' }
  }

  try {
    const currentStat = await stat(absoluteInput)
    if (
      input.forceFilesystemHash !== true &&
      currentStat.mtimeMs === observation.lastObservedMtime &&
      currentStat.size === observation.lastObservedSize
    ) {
      return { state: FreshnessState.Current, reason: 'FILESYSTEM_STAMP_MATCH' }
    }
    const content = await readFile(absoluteInput, 'utf8')
    if (computeContentHash(content) !== observation.indexedContentHash) {
      staleUpdates.push(toStaleUpdate(observation))
      return { state: FreshnessState.Stale, reason: 'CONTENT_HASH_CHANGED' }
    }
    refreshUpdates.push({
      ...toStaleUpdate(observation),
      lastObservedMtime: currentStat.mtimeMs,
      lastObservedSize: currentStat.size,
    })
    return { state: FreshnessState.Current, reason: 'CONTENT_HASH_MATCH' }
  } catch (error: unknown) {
    if (isMissingInputError(error)) {
      staleUpdates.push(toStaleUpdate(observation))
      return { state: FreshnessState.Stale, reason: 'INPUT_MISSING' }
    }
    return { state: FreshnessState.Unknown, reason: 'INPUT_READ_FAILED' }
  }
}

/**
 * Converts persisted evidence to a compare-and-set guard.
 * @param observation - Persisted observation.
 * @returns Compare-and-set stale update.
 */
function toStaleUpdate(observation: IndexedInputObservation): MarkIndexedInputStaleInput {
  return {
    workspace: observation.workspace,
    resourceKind: observation.resourceKind,
    resourceId: observation.resourceId,
    inputKind: observation.inputKind,
    inputLocator: observation.inputLocator,
    expectedIndexedContentHash: observation.indexedContentHash,
    ...(observation.lastObservedRevision === undefined
      ? {}
      : { expectedRevision: observation.lastObservedRevision }),
    expectedGeneration: observation.generation,
  }
}

/**
 * Resolves a non-absolute persisted locator without allowing root escape.
 * @param root - Absolute workspace root.
 * @param locator - Persisted non-absolute locator.
 * @returns Confined absolute path or null.
 */
function resolveConfinedInput(root: string, locator: string): string | null {
  if (locator.length === 0 || isAbsolute(locator)) return null
  const absolute = resolve(root, locator.replaceAll('\\', '/'))
  const relativePath = relative(resolve(root), absolute).replaceAll('\\', '/')
  if (relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    return null
  }
  return absolute
}

/**
 * Aggregates resource states with stale taking precedence over unknown.
 * @param states - Resource states.
 * @returns Aggregate freshness state.
 */
function aggregateStates(states: readonly FreshnessState[]): FreshnessState {
  if (states.includes(FreshnessState.Stale)) return FreshnessState.Stale
  if (states.includes(FreshnessState.Unknown)) return FreshnessState.Unknown
  return FreshnessState.Current
}

/**
 * Deduplicates and deterministically orders logical resource identities.
 * @param resources - Resource identities.
 * @returns Unique deterministic resources.
 */
function deduplicateResources(resources: readonly IndexedResourceKey[]): IndexedResourceKey[] {
  return [...new Map(resources.map((resource) => [resourceKey(resource), resource])).values()].sort(
    (left, right) => resourceKey(left).localeCompare(resourceKey(right)),
  )
}

/**
 * Produces an unambiguous resource identity key.
 * @param resource - Resource identity.
 * @returns Stable compound key.
 */
function resourceKey(resource: IndexedResourceKey): string {
  return JSON.stringify([resource.workspace, resource.resourceKind, resource.resourceId])
}

/**
 * Produces the caller-facing lookup key for repository evidence.
 * @param observation - Repository observation.
 * @returns Revision lookup key.
 */
function repositoryRevisionKey(observation: IndexedInputObservation): string {
  return `${observation.workspace}:${observation.inputLocator}`
}

/**
 * Builds a deterministic unknown result for unavailable evidence.
 * @param resource - Resource identity.
 * @param reason - Unknown reason code.
 * @returns Unknown resource result.
 */
function unknownResult(
  resource: IndexedResourceKey,
  reason: string,
): IndexedResourceFreshnessResult {
  return { ...resource, state: FreshnessState.Unknown, reasons: [reason] }
}

/**
 * Identifies a missing filesystem input without masking other I/O errors.
 * @param error - Filesystem error.
 * @returns Whether the input is missing.
 */
function isMissingInputError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}
