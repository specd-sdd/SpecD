import { z } from 'zod'
import { ConfigValidationError } from '../../domain/errors/config-validation-error.js'

// ---------------------------------------------------------------------------
// Zod schemas for specd.yaml validation
// ---------------------------------------------------------------------------

export const AdapterBindingRawZodSchema = z
  .object({
    adapter: z.union([
      z.string(),
      z.object({
        type: z.string(),
        config: z.record(z.unknown()).optional(),
      }),
    ]),
  })
  .catchall(z.unknown())

export const ContextEntryRawZodSchema = z.union([
  z.object({ id: z.string().optional(), file: z.string() }),
  z.object({ id: z.string().optional(), instruction: z.string() }),
])

/**
 * Validates a `contextIncludeSpecs` / `contextExcludeSpecs` pattern string.
 *
 * Valid forms (per spec):
 * - `*` — alone
 * - `workspace:*` — wildcard after workspace qualifier
 * - `prefix/*` — wildcard after path prefix ending in `/`
 * - `workspace:prefix/*` — qualified wildcard after path prefix
 * - `path/name` — exact spec (no wildcard)
 * - `workspace:path/name` — qualified exact spec
 *
 * `*` may only appear alone, after `workspace:`, or after a path prefix ending
 * in `/`. It may not appear in the middle of a path segment or in any other
 * position.
 *
 * @param pattern - The pattern string to validate
 * @param field - The config field name for error messages
 * @param configPath - Absolute path to the config file for error messages
 * @throws {ConfigValidationError} When the pattern syntax is invalid
 * @internal Exported only for tests.
 */
export function validateContextPattern(pattern: string, field: string, configPath: string): void {
  // Bare wildcard
  if (pattern === '*') return

  // Split optional workspace qualifier
  const colonIdx = pattern.indexOf(':')
  let workspace: string | null = null
  let rest: string

  if (colonIdx !== -1) {
    workspace = pattern.slice(0, colonIdx)
    rest = pattern.slice(colonIdx + 1)
  } else {
    rest = pattern
  }

  // Workspace qualifier must be a valid identifier (lowercase alphanumeric + hyphens)
  if (workspace !== null && !/^[a-z][a-z0-9-]*$/.test(workspace)) {
    throw new ConfigValidationError(
      configPath,
      `${field}: invalid workspace qualifier in pattern '${pattern}'`,
    )
  }

  // After qualifier: `*`, `prefix/*`, or `path/name`
  if (rest === '*') return

  // Check for misplaced wildcards
  if (rest.includes('*')) {
    // Only valid position: at the very end, preceded by `/`
    if (!rest.endsWith('/*') || rest.indexOf('*') !== rest.length - 1) {
      throw new ConfigValidationError(
        configPath,
        `${field}: '*' in disallowed position in pattern '${pattern}'`,
      )
    }
    // Validate the prefix before /*
    const prefix = rest.slice(0, -2)
    if (!/^[a-z_][a-z0-9_-]*(?:\/[a-z_][a-z0-9_-]*)*$/.test(prefix)) {
      throw new ConfigValidationError(
        configPath,
        `${field}: invalid path prefix in pattern '${pattern}'`,
      )
    }
    return
  }

  // Exact path — no wildcards
  if (!/^[a-z_][a-z0-9_-]*(?:\/[a-z_][a-z0-9_-]*)*$/.test(rest)) {
    throw new ConfigValidationError(configPath, `${field}: invalid pattern '${pattern}'`)
  }
}

/**
 * Validates all patterns in `contextIncludeSpecs` and `contextExcludeSpecs`
 * arrays at both project and workspace level.
 *
 * @param data - Parsed config data containing patterns to validate
 * @param data.contextIncludeSpecs - Project-level include patterns
 * @param data.contextExcludeSpecs - Project-level exclude patterns
 * @param data.workspaces - Workspace configs keyed by name
 * @param configPath - Absolute path to the config file for error messages
 */
export function validateContextPatterns(
  data: {
    readonly contextIncludeSpecs?: readonly string[] | undefined
    readonly contextExcludeSpecs?: readonly string[] | undefined
    readonly workspaces: Record<
      string,
      {
        readonly contextIncludeSpecs?: readonly string[] | undefined
        readonly contextExcludeSpecs?: readonly string[] | undefined
      }
    >
  },
  configPath: string,
): void {
  for (const p of data.contextIncludeSpecs ?? []) {
    validateContextPattern(p, 'contextIncludeSpecs', configPath)
  }
  for (const p of data.contextExcludeSpecs ?? []) {
    validateContextPattern(p, 'contextExcludeSpecs', configPath)
  }
  for (const [wsName, ws] of Object.entries(data.workspaces)) {
    for (const p of ws.contextIncludeSpecs ?? []) {
      validateContextPattern(p, `workspaces.${wsName}.contextIncludeSpecs`, configPath)
    }
    for (const p of ws.contextExcludeSpecs ?? []) {
      validateContextPattern(p, `workspaces.${wsName}.contextExcludeSpecs`, configPath)
    }
  }
}

export const PREFIX_SEGMENT_RE = /^[a-z0-9_][a-z0-9_-]*$/

export const PrefixZodSchema = z.string().refine(
  (v) => {
    if (v === '') return false
    if (v.startsWith('/') || v.endsWith('/')) return false
    const segments = v.split('/')
    return segments.every(
      (s) => s.length > 0 && s !== '.' && s !== '..' && PREFIX_SEGMENT_RE.test(s),
    )
  },
  {
    message:
      'prefix must be one or more segments matching /^[a-z0-9_][a-z0-9_-]*$/ separated by "/", with no leading/trailing "/" or empty segments',
  },
)

export const WorkspaceGraphZodSchema = z
  .object({
    respectGitignore: z.boolean().optional(),
    excludePaths: z.array(z.string()).optional(),
    allowedPaths: z.array(z.string()).optional(),
  })
  .strict()

export const ProjectGraphZodSchema = z
  .object({
    includePaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
  })
  .strict()

export const WorkspaceRawZodSchema = z
  .object({
    prefix: PrefixZodSchema.optional(),
    specs: AdapterBindingRawZodSchema,
    schemas: AdapterBindingRawZodSchema.optional(),
    codeRoot: z.string().optional(),
    ownership: z.enum(['owned', 'shared', 'readOnly']).optional(),
    contextIncludeSpecs: z.array(z.string()).optional(),
    contextExcludeSpecs: z.array(z.string()).optional(),
    graph: WorkspaceGraphZodSchema.optional(),
    contextMode: z.unknown().optional(),
  })
  .strict()
  .superRefine((workspace, ctx) => {
    if (workspace.contextMode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextMode'],
        message: '`contextMode` is not valid inside a workspace — it is a project-level setting',
      })
    }
  })

/** Permissive Zod schema for schemaOverrides — semantic validation happens at merge time. */
export const SchemaOverridesZodSchema = z
  .object({
    create: z.record(z.unknown()).optional(),
    remove: z.record(z.unknown()).optional(),
    set: z.record(z.unknown()).optional(),
    append: z.record(z.unknown()).optional(),
    prepend: z.record(z.unknown()).optional(),
  })
  .strict()

export const PluginEntryZodSchema = z
  .object({
    name: z.string(),
    config: z.record(z.unknown()).optional(),
  })
  .strict()

export const PluginsZodSchema = z
  .object({
    agents: z.array(PluginEntryZodSchema).optional(),
  })
  .strict()

export const LoggingZodSchema = z
  .object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).optional(),
  })
  .strict()

export const SpecdYamlZodSchema = z
  .object({
    schema: z.string(),
    specdPath: z.string().optional(),
    configPath: z.string().optional(),
    workspaces: z.record(WorkspaceRawZodSchema),
    actorProvider: z.string().optional(),
    privacy: z
      .object({
        mode: z.enum(['hash', 'mask', 'anonymous']),
        salt: z.string().optional(),
        excludeActors: z.array(z.string()).optional(),
        allowedMetadataKeys: z.array(z.string()).optional(),
      })
      .strict()
      .superRefine((privacy, ctx) => {
        if (privacy.mode === 'hash' && !privacy.salt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['salt'],
            message:
              'When privacy.mode is set to hash, a salt MUST be provided (via config or environment)',
          })
        }
      })
      .optional(),
    storage: z
      .object({
        changes: AdapterBindingRawZodSchema.optional(),
        drafts: AdapterBindingRawZodSchema.optional(),
        discarded: AdapterBindingRawZodSchema.optional(),
        archive: AdapterBindingRawZodSchema.optional(),
      })
      .optional(),
    approvals: z
      .object({
        spec: z.boolean().optional(),
        signoff: z.boolean().optional(),
      })
      .optional(),
    graph: ProjectGraphZodSchema.optional(),
    logging: LoggingZodSchema.optional(),
    context: z.array(ContextEntryRawZodSchema).optional(),
    contextIncludeSpecs: z.array(z.string()).optional(),
    contextExcludeSpecs: z.array(z.string()).optional(),
    contextMode: z.enum(['list', 'summary', 'full', 'hybrid']).optional(),
    llmOptimizedContext: z.boolean().optional(),
    schemaPlugins: z.array(z.string()).optional(),
    schemaOverrides: SchemaOverridesZodSchema.optional(),
    invalidationPolicy: z.enum(['none', 'surgical', 'downstream', 'global']).optional(),
    plugins: PluginsZodSchema.optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Utility functions needed by cascade code
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `value` is a non-array object.
 *
 * @param value - The value to test
 * @returns `true` for plain object-like records
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Formats a Zod error path for use in {@link ConfigValidationError} messages.
 *
 * @param issuePath - The raw Zod issue path
 * @returns A dot-bracket path string (e.g. `"workspaces.default.specs"`)
 */
export function formatZodPath(issuePath: ReadonlyArray<string | number>): string {
  return issuePath
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join('')
}

/**
 * Deep-merges two raw config objects, with overlay values taking precedence.
 * Arrays are concatenated; objects are recursively merged.
 *
 * @param base - The base config object
 * @param overlay - The overlay config object whose values override base
 * @returns The deep-merged config object
 */
export function deepMergeRawConfig(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(base)) result[key] = value
  for (const [key, value] of Object.entries(overlay)) {
    if (key === 'extends' || key === 'remove') continue
    const existing = result[key]
    if (existing !== undefined && isRecord(existing) && isRecord(value)) {
      result[key] = deepMergeRawConfig(existing, value)
    } else if (Array.isArray(existing) && Array.isArray(value)) {
      result[key] = [...(existing as unknown[]), ...(value as unknown[])]
    } else {
      result[key] = value
    }
  }
  return result
}
