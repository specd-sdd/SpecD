import { z } from 'zod'
import { InvalidSpecLockError } from '../errors/invalid-spec-lock-error.js'
import { isFullyQualifiedSpecId } from './parse-spec-id.js'
import {
  type PersistedSpecOptimizations,
  persistedSpecOptimizationsZodSchema,
} from './spec-optimization.js'

const HASH_RE = /^sha256:[0-9a-f]{64}$/

/**
 * Strict fully-qualified spec-id validator for `spec-lock.json` dependency entries.
 */
const specIdString = z.string().refine(isFullyQualifiedSpecId, {
  message: 'must be a fully-qualified valid spec ID (workspace:capabilityPath)',
})

/**
 * Optional location context attached when reading a lock from disk.
 */
export interface SpecLockContext {
  readonly specId: string
  readonly location: string
}

/**
 * Options controlling how {@link parseSpecLock} validates `dependsOn`.
 */
export interface ParseSpecLockOptions {
  /**
   * When `true`, tolerate invalid `dependsOn` entries as given while still
   * validating every other field strictly. Used only by dependency-repair
   * mutations and the optimistic-concurrency check of `writePersistedState`.
   */
  readonly lenientDependsOn?: boolean
}

/**
 * Parsed `spec-lock.json` sidecar payload.
 */
export interface SpecLockData {
  readonly schema: {
    readonly name: string
    readonly version: number
  }
  readonly dependsOn: readonly string[]
  readonly implementation: readonly SpecLockImplementationEntry[]
  readonly optimizations?: PersistedSpecOptimizations | undefined
  readonly originalHash?: string | undefined
}

/** One archived implementation link persisted in `spec-lock.json`. */
export interface SpecLockImplementationEntry {
  readonly file: string
  readonly symbols?: readonly string[] | undefined
}

const implementationSchema = z
  .array(
    z
      .object({
        file: z.string().min(1),
        symbols: z.array(z.string().min(1)).nonempty().optional(),
      })
      .strict(),
  )
  .default([])

const lockBaseFields = {
  schema: z.object({
    name: z.string().min(1),
    version: z.number().int().nonnegative(),
  }),
  implementation: implementationSchema,
  optimizations: persistedSpecOptimizationsZodSchema.optional(),
  originalHash: z.string().regex(HASH_RE).optional(),
}

/**
 * Runtime schema for `spec-lock.json` (strict `dependsOn`).
 */
export const specLockSchema = z.object({
  ...lockBaseFields,
  dependsOn: z.array(specIdString),
})

/**
 * Runtime schema for lenient `dependsOn` reads — every other field stays strict.
 */
const specLockSchemaLenientDependsOn = z.object({
  ...lockBaseFields,
  dependsOn: z.array(z.string()),
})

/**
 * Parses raw `spec-lock.json` content into validated sidecar data.
 *
 * @param content - Raw JSON sidecar content
 * @param context - Optional spec ID and file location for typed error messages
 * @param options - Optional parse flags (`lenientDependsOn`)
 * @returns Parsed and validated sidecar data
 * @throws {InvalidSpecLockError} When the content is not valid JSON or fails the schema
 */
export function parseSpecLock(
  content: string,
  context?: SpecLockContext,
  options?: ParseSpecLockOptions,
): SpecLockData {
  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new InvalidSpecLockError(context?.specId, context?.location, '', 'is not valid JSON')
  }
  const schema =
    options?.lenientDependsOn === true ? specLockSchemaLenientDependsOn : specLockSchema
  try {
    return schema.parse(parsed) as SpecLockData
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issue = err.issues[0]
      const fieldPath = issue?.path.join('.') ?? ''
      const reason = issue?.message ?? 'failed validation'
      let rejectedValue: string | undefined
      if (
        issue?.path[0] === 'dependsOn' &&
        typeof issue.path[1] === 'number' &&
        typeof parsed === 'object' &&
        parsed !== null &&
        'dependsOn' in parsed &&
        Array.isArray(parsed.dependsOn)
      ) {
        const candidate: unknown = parsed.dependsOn[issue.path[1]]
        if (typeof candidate === 'string') rejectedValue = candidate
      }
      throw new InvalidSpecLockError(
        context?.specId,
        context?.location,
        fieldPath,
        reason,
        rejectedValue,
      )
    }
    throw err
  }
}
