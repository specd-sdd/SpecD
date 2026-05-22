import { z } from 'zod'

const WORKSPACE_RE = /^[a-z][a-z0-9-]*$/
const CAP_SEGMENT_RE = /^[a-z0-9_][a-z0-9_-]*$/
const HASH_RE = /^sha256:[0-9a-f]{64}$/

/**
 * Lenient spec-id validator for `spec-lock.json` dependency entries.
 *
 * Accepts either bare capability paths or fully-qualified `workspace:path`
 * identifiers so legacy and canonical forms can coexist during migration.
 */
const specIdString = z.string().refine(
  (val) => {
    const colonIdx = val.indexOf(':')
    if (colonIdx >= 0) {
      const ws = val.slice(0, colonIdx)
      const cap = val.slice(colonIdx + 1)
      return WORKSPACE_RE.test(ws) && cap.split('/').every((s) => CAP_SEGMENT_RE.test(s))
    }
    return val.split('/').every((s) => CAP_SEGMENT_RE.test(s))
  },
  { message: 'must be a valid spec ID (capabilityPath or workspace:capabilityPath)' },
)

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
  readonly originalHash?: string | undefined
}

/** One archived implementation link persisted in `spec-lock.json`. */
export interface SpecLockImplementationEntry {
  readonly file: string
  readonly symbols?: readonly string[] | undefined
}

/**
 * Runtime schema for `spec-lock.json`.
 */
export const specLockSchema: z.ZodType<SpecLockData, z.ZodTypeDef, unknown> = z.object({
  schema: z.object({
    name: z.string().min(1),
    version: z.number().int().nonnegative(),
  }),
  dependsOn: z.array(specIdString),
  implementation: z
    .array(
      z
        .object({
          file: z.string().min(1),
          symbols: z.array(z.string().min(1)).nonempty().optional(),
        })
        .strict(),
    )
    .default([]),
  originalHash: z.string().regex(HASH_RE).optional(),
})

/**
 * Parses raw `spec-lock.json` content into validated sidecar data.
 *
 * @param content - Raw JSON sidecar content
 * @returns Parsed and validated sidecar data
 */
export function parseSpecLock(content: string): SpecLockData {
  const parsed = JSON.parse(content) as unknown
  return specLockSchema.parse(parsed)
}
