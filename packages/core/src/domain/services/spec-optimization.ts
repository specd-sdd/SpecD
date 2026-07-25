import { z } from 'zod'

const HASH_RE = /^sha256:[0-9a-f]{64}$/

/** One artifact baseline entry captured when an optimization field was authored. */
export interface PersistedArtifactStateEntry {
  readonly hash: string
  readonly lastModified: string
}

/** Artifact filename → baseline entry map for one optimization field. */
export type PersistedArtifactState = Readonly<Record<string, PersistedArtifactStateEntry>>

/** One archived implementation link at the port/application boundary. */
export interface PersistedImplementationLink {
  readonly file: string
  readonly symbols?: readonly string[] | undefined
}

/** Schema identity recorded with a persisted optimization baseline. */
export interface PersistedSchemaIdentity {
  readonly name: string
  readonly version: number
}

/** One persisted LLM optimization field with its authoring baseline. */
export interface PersistedOptimizationField {
  readonly value: string
  readonly schema: PersistedSchemaIdentity
  readonly artifactState: PersistedArtifactState
}

/** Optional per-spec optimization block stored in `spec-lock.json`. */
export interface PersistedSpecOptimizations {
  readonly optimizedDescription?: PersistedOptimizationField
  readonly optimizedContext?: PersistedOptimizationField
}

const persistedSchemaIdentitySchema = z.object({
  name: z.string().min(1),
  version: z.number().int().nonnegative(),
})

const persistedArtifactStateEntrySchema = z.object({
  hash: z.string().regex(HASH_RE),
  lastModified: z.string().min(1),
})

const persistedArtifactStateSchema = z.record(z.string().min(1), persistedArtifactStateEntrySchema)

const persistedOptimizationFieldSchema = z.object({
  value: z.string().min(1),
  schema: persistedSchemaIdentitySchema,
  artifactState: persistedArtifactStateSchema,
})

const persistedSpecOptimizationsSchema = z
  .object({
    optimizedDescription: persistedOptimizationFieldSchema.optional(),
    optimizedContext: persistedOptimizationFieldSchema.optional(),
  })
  .strict()
  .refine((val) => val.optimizedDescription !== undefined || val.optimizedContext !== undefined, {
    message: 'optimizations must contain at least one field',
  })

export const persistedSchemaIdentityZodSchema = persistedSchemaIdentitySchema
export const persistedOptimizationFieldZodSchema = persistedOptimizationFieldSchema
export const persistedSpecOptimizationsZodSchema = persistedSpecOptimizationsSchema

/**
 * Returns artifact-state keys sorted filename-ascending for deterministic serialization.
 *
 * @param artifactState - Artifact baseline map.
 * @returns Sorted artifact filenames.
 */
export function sortArtifactStateKeys(artifactState: PersistedArtifactState): readonly string[] {
  return Object.keys(artifactState).sort()
}

/**
 * Builds a filename-ascending artifact-state map from entries.
 *
 * @param artifactState - Artifact baseline map.
 * @returns Normalized artifact baseline map.
 */
export function normalizeArtifactState(
  artifactState: PersistedArtifactState,
): PersistedArtifactState {
  const sorted: Record<string, PersistedArtifactStateEntry> = {}
  for (const key of sortArtifactStateKeys(artifactState)) {
    sorted[key] = artifactState[key]!
  }
  return sorted
}

/**
 * Normalizes optimizations: sorts each field's artifact state and omits an empty block.
 *
 * @param optimizations - Raw persisted optimizations block.
 * @returns Normalized block, or `undefined` when empty.
 */
export function normalizePersistedSpecOptimizations(
  optimizations: PersistedSpecOptimizations,
): PersistedSpecOptimizations | undefined {
  const normalized: {
    optimizedDescription?: PersistedOptimizationField
    optimizedContext?: PersistedOptimizationField
  } = {}

  if (optimizations.optimizedDescription !== undefined) {
    normalized.optimizedDescription = {
      ...optimizations.optimizedDescription,
      artifactState: normalizeArtifactState(optimizations.optimizedDescription.artifactState),
    }
  }
  if (optimizations.optimizedContext !== undefined) {
    normalized.optimizedContext = {
      ...optimizations.optimizedContext,
      artifactState: normalizeArtifactState(optimizations.optimizedContext.artifactState),
    }
  }

  if (normalized.optimizedDescription === undefined && normalized.optimizedContext === undefined) {
    return undefined
  }

  return normalized
}
