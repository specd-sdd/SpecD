import { PersistedSpecStateSchemaReplacementError } from '../errors/persisted-spec-state-schema-replacement-error.js'
import {
  type PersistedImplementationLink,
  type PersistedSchemaIdentity,
  type PersistedSpecOptimizations,
  normalizePersistedSpecOptimizations,
} from './spec-optimization.js'

export type { PersistedImplementationLink } from './spec-optimization.js'

/** Complete persisted state snapshot including the lock-file content hash. */
export interface PersistedSpecStateSnapshot {
  readonly schema: PersistedSchemaIdentity
  readonly dependsOn: readonly string[]
  readonly implementation: readonly PersistedImplementationLink[]
  readonly optimizations?: PersistedSpecOptimizations
  readonly originalHash: string
}

/** Complete persisted state to write; identical shape minus read-only originalHash. */
export type PersistedSpecState = Omit<PersistedSpecStateSnapshot, 'originalHash'>

/** Base state for patch application: either an existing snapshot or initial schema/deps. */
export type PersistedSpecStateBase =
  | {
      readonly kind: 'existing'
      readonly state: PersistedSpecStateSnapshot
    }
  | {
      readonly kind: 'initial'
      readonly schema: PersistedSchemaIdentity
      readonly dependsOn: readonly string[]
    }

/** Partial update applied to a persisted spec state base. */
export interface PersistedSpecStatePatch {
  readonly dependsOn?: readonly string[]
  readonly implementation?: readonly PersistedImplementationLink[]
  readonly optimizations?: PersistedSpecOptimizations | null
  /** @internal Guard — schema replacement is rejected on existing bases. */
  readonly schema?: PersistedSchemaIdentity
}

/** Options for {@link applyPersistedSpecStatePatch}. */
export interface ApplyPersistedSpecStatePatchOptions {
  readonly specId?: string
}

/**
 * Pure construction of complete persisted state from a base plus patch.
 * Never reads artifacts, repositories, metadata, or the filesystem.
 *
 * @param base - Existing snapshot or initial schema/deps.
 * @param patch - Fields to merge into the base.
 * @param options - Optional spec id for error messages.
 * @returns The merged persisted state without `originalHash`.
 * @throws {PersistedSpecStateSchemaReplacementError} When `patch.schema` is set on an existing base.
 */
export function applyPersistedSpecStatePatch(
  base: PersistedSpecStateBase,
  patch: PersistedSpecStatePatch,
  options: ApplyPersistedSpecStatePatchOptions = {},
): PersistedSpecState {
  if (base.kind === 'existing' && patch.schema !== undefined) {
    const specId = options.specId ?? 'unknown'
    throw new PersistedSpecStateSchemaReplacementError(specId)
  }

  if (base.kind === 'initial') {
    const optimizations =
      patch.optimizations === null
        ? undefined
        : patch.optimizations !== undefined
          ? normalizePersistedSpecOptimizations(patch.optimizations)
          : undefined

    const state: PersistedSpecState = {
      schema: base.schema,
      dependsOn: patch.dependsOn ?? base.dependsOn,
      implementation: patch.implementation ?? [],
    }
    if (optimizations !== undefined) {
      return { ...state, optimizations }
    }
    return state
  }

  const { state } = base
  const optimizations =
    patch.optimizations === null
      ? undefined
      : patch.optimizations !== undefined
        ? normalizePersistedSpecOptimizations(patch.optimizations)
        : state.optimizations

  const next: PersistedSpecState = {
    schema: state.schema,
    dependsOn: patch.dependsOn ?? state.dependsOn,
    implementation: patch.implementation ?? state.implementation,
  }
  if (optimizations !== undefined) {
    return { ...next, optimizations }
  }
  return next
}
