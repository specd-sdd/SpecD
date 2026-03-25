import { z } from 'zod'

/**
 * Workspace name: lowercase, starts with letter, letters/digits/hyphens.
 * Capability path segment: lowercase, starts with letter/digit/underscore, letters/digits/underscores/hyphens.
 */
const WORKSPACE_RE = /^[a-z][a-z0-9-]*$/
const CAP_SEGMENT_RE = /^[a-z0-9_][a-z0-9_-]*$/
const HASH_RE = /^sha256:[0-9a-f]{64}$/

/** Validates a spec ID: `capPath` or `workspace:capPath`. */
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

/** Lenient schema for reading `metadata.json` — used by {@link parseMetadata}. */
export const specMetadataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    dependsOn: z.array(z.string()).optional(),
    contentHashes: z.record(z.string(), z.string()).optional(),
    rules: z
      .array(
        z.object({
          requirement: z.string(),
          rules: z.array(z.string()),
        }),
      )
      .optional(),
    constraints: z.array(z.string()).optional(),
    scenarios: z
      .array(
        z.object({
          requirement: z.string(),
          name: z.string(),
          given: z.array(z.string()).optional(),
          when: z.array(z.string()).optional(),
          then: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    context: z.array(z.string()).optional(),
    generatedBy: z.enum(['core', 'agent']).optional(),
  })
  .passthrough()

/**
 * Strict schema for writing `metadata.json` — used by {@link SaveSpecMetadata}.
 * `title` and `description` are required; other fields are optional but validated when present.
 */
export const strictSpecMetadataSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    keywords: z
      .array(
        z
          .string()
          .min(1)
          .regex(/^[a-z][a-z0-9-]*$/, { message: 'must be lowercase with hyphens only' }),
      )
      .optional(),
    dependsOn: z.array(specIdString).optional(),
    contentHashes: z
      .record(
        z.string(),
        z.string().regex(HASH_RE, { message: 'must match sha256:<64 hex chars>' }),
      )
      .refine((r) => Object.keys(r).length > 0, { message: 'must have at least one entry' }),
    rules: z
      .array(
        z.object({
          requirement: z.string().min(1),
          rules: z.array(z.string().min(1)).nonempty(),
        }),
      )
      .optional(),
    constraints: z.array(z.string().min(1)).nonempty().optional(),
    scenarios: z
      .array(
        z.object({
          requirement: z.string().min(1),
          name: z.string().min(1),
          given: z.array(z.string()).optional(),
          when: z.array(z.string()).optional(),
          then: z.array(z.string()).nonempty(),
        }),
      )
      .optional(),
    context: z.array(z.string().min(1)).optional(),
    generatedBy: z.enum(['core', 'agent']).optional(),
  })
  .passthrough()

/** Parsed `metadata.json` content. */
export interface SpecMetadata {
  readonly title?: string
  readonly description?: string
  readonly keywords?: string[]
  readonly dependsOn?: string[]
  readonly contentHashes?: Record<string, string>
  readonly rules?: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }>
  readonly constraints?: string[]
  readonly scenarios?: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
  readonly context?: string[]
  readonly generatedBy?: 'core' | 'agent'
  readonly originalHash?: string
}
