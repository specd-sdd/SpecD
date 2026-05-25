import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { type ConfigLoader } from '../../application/ports/config-loader.js'
import { isEnoent } from './is-enoent.js'
import { isInvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import {
  type SpecdConfig,
  type SpecdAdapterBinding,
  type SpecdWorkspaceConfig,
  type SpecdStorageConfig,
  type SpecdContextEntry,
} from '../../application/specd-config.js'
import { type SchemaOperations } from '../../domain/services/merge-schema-layers.js'
import { ConfigValidationError } from '../../domain/errors/config-validation-error.js'
import { git } from '../git/exec.js'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for constructing a {@link FsConfigLoader}.
 *
 * Two modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir`, bounded
 *   by the nearest git repository root, to find `specd.yaml`. Honouring any
 *   `specd.local.yaml` sibling found at the same directory level.
 * - **Forced mode** (`{ configPath }`) — uses the specified file exactly as
 *   given. No `specd.local.yaml` lookup takes place. Maps to the CLI
 *   `--config path/to/specd.yaml` flag.
 */
export type FsConfigLoaderOptions = { readonly startDir: string } | { readonly configPath: string }

// ---------------------------------------------------------------------------
// Zod schemas for specd.yaml validation
// ---------------------------------------------------------------------------

const AdapterBindingRawZodSchema = z.object({ adapter: z.string() }).catchall(z.unknown())

const ContextEntryRawZodSchema = z.union([
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
function validateContextPattern(pattern: string, field: string, configPath: string): void {
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
function validateContextPatterns(
  data: {
    contextIncludeSpecs?: string[] | undefined
    contextExcludeSpecs?: string[] | undefined
    workspaces: Record<
      string,
      { contextIncludeSpecs?: string[] | undefined; contextExcludeSpecs?: string[] | undefined }
    >
  },
  configPath: string,
): void {
  for (const p of data.contextIncludeSpecs ?? [])
    validateContextPattern(p, 'contextIncludeSpecs', configPath)
  for (const p of data.contextExcludeSpecs ?? [])
    validateContextPattern(p, 'contextExcludeSpecs', configPath)
  for (const [wsName, ws] of Object.entries(data.workspaces)) {
    for (const p of ws.contextIncludeSpecs ?? [])
      validateContextPattern(p, `workspaces.${wsName}.contextIncludeSpecs`, configPath)
    for (const p of ws.contextExcludeSpecs ?? [])
      validateContextPattern(p, `workspaces.${wsName}.contextExcludeSpecs`, configPath)
  }
}

const PREFIX_SEGMENT_RE = /^[a-z0-9_][a-z0-9_-]*$/

const PrefixZodSchema = z.string().refine(
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

const WorkspaceGraphZodSchema = z
  .object({
    respectGitignore: z.boolean().optional(),
    excludePaths: z.array(z.string()).optional(),
  })
  .strict()

const WorkspaceRawZodSchema = z
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
const SchemaOverridesZodSchema = z
  .object({
    create: z.record(z.unknown()).optional(),
    remove: z.record(z.unknown()).optional(),
    set: z.record(z.unknown()).optional(),
    append: z.record(z.unknown()).optional(),
    prepend: z.record(z.unknown()).optional(),
  })
  .strict()

const PluginEntryZodSchema = z
  .object({
    name: z.string(),
    config: z.record(z.unknown()).optional(),
  })
  .strict()

const PluginsZodSchema = z
  .object({
    agents: z.array(PluginEntryZodSchema).optional(),
  })
  .strict()

const LoggingZodSchema = z
  .object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).optional(),
  })
  .strict()

const SpecdYamlZodSchema = z
  .object({
    schema: z.string(),
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
    storage: z.object({
      changes: AdapterBindingRawZodSchema,
      drafts: AdapterBindingRawZodSchema,
      discarded: AdapterBindingRawZodSchema,
      archive: AdapterBindingRawZodSchema,
    }),
    approvals: z
      .object({
        spec: z.boolean().optional(),
        signoff: z.boolean().optional(),
      })
      .optional(),
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
    api: z
      .object({
        auth: z
          .object({
            type: z.literal('disabled'),
            config: z.record(z.unknown()).optional(),
          })
          .strict()
          .optional(),
        cors: z
          .object({
            origins: z.array(z.string()).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Formats a Zod error path for use in {@link ConfigValidationError} messages.
 *
 * @param issuePath - The raw Zod issue path
 * @returns A dot-bracket path string (e.g. `"workspaces.default.specs"`)
 */
function formatZodPath(issuePath: ReadonlyArray<string | number>): string {
  return issuePath
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join('')
}

// ---------------------------------------------------------------------------
// Zod schemas — cascade layer (permissive)
// ---------------------------------------------------------------------------

const LayerExtendsZodSchema = z.union([z.literal(true), z.string()])

const RemovalMatcherZodSchema = z.object({
  id: z.string().optional(),
  file: z.string().optional(),
  instruction: z.string().optional(),
})

const LayerRemovalZodSchema = z
  .object({
    root: z.array(z.string()).optional(),
    workspaces: z.array(z.string()).optional(),
    storage: z.array(z.string()).optional(),
    context: z.array(RemovalMatcherZodSchema).optional(),
    plugins: z.object({ agents: z.array(z.object({ name: z.string() })) }).optional(),
  })
  .strict()

const LayerRawZodSchema = z
  .object({
    extends: LayerExtendsZodSchema.optional(),
    remove: LayerRemovalZodSchema.optional(),
    context: z.array(ContextEntryRawZodSchema).optional(),
  })
  .passthrough()

// ---------------------------------------------------------------------------
// Cascade types
// ---------------------------------------------------------------------------

/**
 * Describes fields to remove from an inherited config layer.
 */
interface CascadeRemoval {
  readonly root?: string[]
  readonly workspaces?: string[]
  readonly storage?: string[]
  readonly context?: Array<{
    readonly id?: string
    readonly file?: string
    readonly instruction?: string
  }>
  readonly plugins?: {
    readonly agents?: Array<{ readonly name: string }>
  }
}

/**
 * A single parsed cascade layer with resolved extends metadata.
 */
interface ConfigCascadeLayer {
  readonly path: string
  readonly dir: string
  readonly raw: Record<string, unknown>
  readonly extendsMode: 'standalone' | 'previous' | 'explicit'
  readonly extendsPath?: string | undefined
  readonly removal: CascadeRemoval | undefined
}

/**
 * The resolved cascade after filtering to only the active chain.
 */
interface ResolvedConfigCascade {
  readonly rootPath: string
  readonly activeLayers: readonly ConfigCascadeLayer[]
}

// ---------------------------------------------------------------------------
// Cascade discovery
// ---------------------------------------------------------------------------

/**
 * Returns a sort key for a candidate config filename, or `null` if not a candidate.
 *
 * @param filename - The filename to evaluate
 * @returns A `[priority, label]` tuple for sorting, or `null` if not a specd config file
 */
function candidateSortKey(filename: string): [number, string] | null {
  if (filename === 'specd.yaml') return [0, '']
  if (filename === 'specd.local.yaml') return [2, '']
  if (
    filename.startsWith('specd.local.') &&
    filename.endsWith('.yaml') &&
    filename.length > 'specd.local..yaml'.length
  ) {
    return [3, filename.slice('specd.local.'.length, -'.yaml'.length)]
  }
  if (
    filename.startsWith('specd.') &&
    filename.endsWith('.yaml') &&
    !filename.startsWith('specd.local.') &&
    filename.length > 'specd..yaml'.length
  ) {
    return [1, filename.slice('specd.'.length, -'.yaml'.length)]
  }
  return null
}

/**
 * Discovers all specd config candidate files in a directory, sorted by priority.
 *
 * @param dir - Absolute directory path to scan
 * @returns Sorted array of absolute paths to candidate config files
 */
async function discoverCandidateFiles(dir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const candidates: Array<{ filename: string; sortKey: [number, string] }> = []
  for (const entry of entries) {
    const key = candidateSortKey(entry)
    if (key !== null) candidates.push({ filename: entry, sortKey: key })
  }
  candidates.sort((a, b) => {
    if (a.sortKey[0] !== b.sortKey[0]) return a.sortKey[0] - b.sortKey[0]
    return a.sortKey[1].localeCompare(b.sortKey[1])
  })
  return candidates.map((c) => path.join(dir, c.filename))
}

/**
 * Walks upward from `startDir` (bounded by the VCS root) to find a directory
 * containing specd candidate config files.
 *
 * @param startDir - Directory to start searching from
 * @returns The first directory containing candidate files, or `null` if none found
 */
async function findCandidateDirectory(startDir: string): Promise<string | null> {
  const gitRoot = await findVcsRoot(startDir)
  let dir = path.resolve(startDir)
  if (gitRoot === null) {
    const candidates = await discoverCandidateFiles(dir)
    return candidates.length > 0 ? dir : null
  }
  while (true) {
    const candidates = await discoverCandidateFiles(dir)
    if (candidates.length > 0) return dir
    if (dir === gitRoot) break
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// ---------------------------------------------------------------------------
// Cascade parsing
// ---------------------------------------------------------------------------

/**
 * Determines the extends mode from a raw cascade layer.
 *
 * @param raw - The raw parsed YAML object for the layer
 * @param filePath - Absolute path to the layer config file
 * @returns The resolved extends mode and optional explicit extends path
 */
function determineExtendsMode(
  raw: Record<string, unknown>,
  filePath: string,
): { mode: 'standalone' | 'previous' | 'explicit'; extendsPath?: string } {
  const extendsVal = raw['extends']
  if (extendsVal === undefined || extendsVal === null) return { mode: 'standalone' }
  if (extendsVal === true) return { mode: 'previous' }
  if (typeof extendsVal === 'string') {
    return { mode: 'explicit', extendsPath: path.resolve(path.dirname(filePath), extendsVal) }
  }
  return { mode: 'standalone' }
}

/**
 * Reads, parses, and validates a single cascade layer file.
 *
 * @param filePath - Absolute path to the cascade layer YAML file
 * @returns The parsed and validated cascade layer
 * @throws {ConfigValidationError} When the file is missing, YAML is invalid, or schema validation fails
 */
async function parseCascadeLayer(filePath: string): Promise<ConfigCascadeLayer> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    if (isEnoent(err)) throw new ConfigValidationError(filePath, 'config file not found')
    throw err
  }
  let raw: unknown
  try {
    raw = parseYaml(content)
  } catch (err) {
    throw new ConfigValidationError(filePath, `invalid YAML: ${(err as Error).message}`)
  }
  if (!isRecord(raw)) {
    throw new ConfigValidationError(filePath, 'config must be a YAML mapping')
  }
  const parseResult = LayerRawZodSchema.safeParse(raw)
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]
    const location = issue ? formatZodPath(issue.path) : ''
    const message = issue
      ? location
        ? `${location}: ${issue.message}`
        : issue.message
      : 'config validation failed'
    throw new ConfigValidationError(filePath, message)
  }
  const validated = parseResult.data
  const { mode, extendsPath } = determineExtendsMode(validated, filePath)
  if (validated.remove !== undefined && mode === 'standalone') {
    throw new ConfigValidationError(
      filePath,
      "'remove' is only valid in configs that declare 'extends'",
    )
  }
  if (validated.remove?.root) {
    for (const field of validated.remove.root) {
      if (field === 'schema') {
        throw new ConfigValidationError(
          filePath,
          `remove.root: cannot remove required field '${field}'`,
        )
      }
    }
  }
  return {
    path: filePath,
    dir: path.dirname(filePath),
    raw: { ...raw },
    extendsMode: mode,
    extendsPath,
    removal: validated.remove as CascadeRemoval | undefined,
  }
}

// ---------------------------------------------------------------------------
// Cascade resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the active chain from a flat list of cascade layers.
 *
 * @param layers - Ordered list of parsed cascade layers
 * @returns The resolved cascade containing only the active layers
 * @throws {ConfigValidationError} When extends references are invalid or no layers resolve
 */
function resolveActiveChain(layers: readonly ConfigCascadeLayer[]): ResolvedConfigCascade {
  const activeLayers: ConfigCascadeLayer[] = []
  const activePaths = new Set<string>()
  for (const layer of layers) {
    if (layer.extendsMode === 'standalone') {
      activeLayers.length = 0
      activePaths.clear()
      activeLayers.push(layer)
      activePaths.add(layer.path)
    } else if (layer.extendsMode === 'previous') {
      if (activeLayers.length === 0) {
        throw new ConfigValidationError(
          layer.path,
          'extends: true requires a previous active layer to inherit from',
        )
      }
      activeLayers.push(layer)
      activePaths.add(layer.path)
    } else if (layer.extendsMode === 'explicit') {
      if (layer.extendsPath && activePaths.has(layer.extendsPath)) {
        activeLayers.push(layer)
        activePaths.add(layer.path)
      }
    }
  }
  if (activeLayers.length === 0) {
    throw new ConfigValidationError(
      layers[0]?.path ?? '<unknown>',
      'no active config layers resolved',
    )
  }
  return { rootPath: activeLayers[0]!.path, activeLayers }
}

/**
 * Resolves a forced cascade chain starting from an explicit config path,
 * following `extends` declarations until a standalone layer is reached.
 *
 * @param entryPath - Absolute path to the entry config file
 * @returns The resolved cascade with all layers in the forced chain
 * @throws {ConfigValidationError} When circular extends or missing files are detected
 */
async function resolveForcedCascade(entryPath: string): Promise<ResolvedConfigCascade> {
  const resolvedEntry = path.resolve(entryPath)
  const visited = new Set<string>()
  const layers: ConfigCascadeLayer[] = []
  let currentPath = resolvedEntry
  while (true) {
    if (visited.has(currentPath)) {
      throw new ConfigValidationError(currentPath, 'circular extends chain detected')
    }
    visited.add(currentPath)
    const layer = await parseCascadeLayer(currentPath)
    layers.unshift(layer)
    if (layer.extendsMode === 'standalone') {
      break
    } else if (layer.extendsMode === 'previous') {
      const dir = path.dirname(currentPath)
      const candidates = await discoverCandidateFiles(dir)
      const currentIdx = candidates.findIndex((c) => path.resolve(c) === path.resolve(currentPath))
      if (currentIdx <= 0) {
        throw new ConfigValidationError(
          currentPath,
          currentIdx === -1
            ? 'extends: true could not locate the current file in the directory candidates'
            : 'extends: true on the first candidate would create a self-reference',
        )
      }
      let resolved = false
      for (let j = currentIdx - 1; j >= 0; j--) {
        const candidatePath = candidates[j]!
        if (!visited.has(path.resolve(candidatePath))) {
          currentPath = candidatePath
          resolved = true
          break
        }
      }
      if (!resolved) {
        throw new ConfigValidationError(
          currentPath,
          'extends: true could not resolve a non-visited previous candidate',
        )
      }
    } else if (layer.extendsMode === 'explicit') {
      if (!layer.extendsPath) {
        throw new ConfigValidationError(currentPath, 'extends path could not be resolved')
      }
      currentPath = layer.extendsPath
    }
  }
  return { rootPath: layers[0]!.path, activeLayers: layers }
}

// ---------------------------------------------------------------------------
// Cascade merge
// ---------------------------------------------------------------------------

/**
 * Deep-merges two raw config objects, with overlay values taking precedence.
 * Arrays are concatenated; objects are recursively merged.
 *
 * @param base - The base config object
 * @param overlay - The overlay config object whose values override base
 * @returns The deep-merged config object
 */
function deepMergeRawConfig(
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

/**
 * Checks whether a context entry matches a removal matcher by id, file, or instruction.
 *
 * @param entry - The context entry record to test
 * @param matcher - The matcher with optional id, file, or instruction criteria
 * @param matcher.id - Optional id to match against
 * @param matcher.file - Optional file path to match against
 * @param matcher.instruction - Optional instruction text to match against
 * @returns `true` if the entry matches the matcher
 */
function matchesContextEntry(
  entry: Record<string, unknown>,
  matcher: { readonly id?: string; readonly file?: string; readonly instruction?: string },
): boolean {
  if (matcher.id !== undefined) return entry['id'] === matcher.id
  if (matcher.file !== undefined) return entry['file'] === matcher.file
  if (matcher.instruction !== undefined) return entry['instruction'] === matcher.instruction
  return false
}

/**
 * Finds the index of a context entry matching the given matcher, or reports
 * ambiguity when multiple entries match.
 *
 * @param context - Array of context entry records to search
 * @param matcher - The matcher with optional id, file, or instruction criteria
 * @param matcher.id - Optional id to match against
 * @param matcher.file - Optional file path to match against
 * @param matcher.instruction - Optional instruction text to match against
 * @returns The matching index, `'none'` if no match, or `'ambiguous'` if multiple match
 */
function findContextEntryIndex(
  context: Array<Record<string, unknown>>,
  matcher: { readonly id?: string; readonly file?: string; readonly instruction?: string },
): number | 'none' | 'ambiguous' {
  const matches: number[] = []
  for (let i = 0; i < context.length; i++) {
    if (matchesContextEntry(context[i]!, matcher)) matches.push(i)
  }
  if (matches.length === 0) return 'none'
  if (matches.length === 1) return matches[0]!
  return 'ambiguous'
}

/**
 * Applies removal directives to an accumulated config object in-place.
 *
 * @param accumulated - The accumulated config object to mutate
 * @param removal - The removal directives to apply
 * @param layerPath - Path to the layer declaring the removals, for error messages
 * @throws {ConfigValidationError} When a removal target is not found or is ambiguous
 */
function applyRemovals(
  accumulated: Record<string, unknown>,
  removal: CascadeRemoval,
  layerPath: string,
): void {
  if (removal.root) {
    for (const field of removal.root) delete accumulated[field]
  }
  if (removal.workspaces) {
    const workspaces = accumulated['workspaces'] as Record<string, unknown> | undefined
    if (!workspaces)
      throw new ConfigValidationError(
        layerPath,
        'remove.workspaces: no workspaces in inherited config',
      )
    for (const name of removal.workspaces) {
      if (!(name in workspaces))
        throw new ConfigValidationError(layerPath, `remove.workspaces: '${name}' not found`)
      delete workspaces[name]
    }
  }
  if (removal.storage) {
    const storage = accumulated['storage'] as Record<string, unknown> | undefined
    if (!storage)
      throw new ConfigValidationError(layerPath, 'remove.storage: no storage in inherited config')
    for (const name of removal.storage) {
      if (!(name in storage))
        throw new ConfigValidationError(layerPath, `remove.storage: '${name}' not found`)
      delete storage[name]
    }
  }
  if (removal.context) {
    const context = accumulated['context'] as Array<Record<string, unknown>> | undefined
    if (!context)
      throw new ConfigValidationError(layerPath, 'remove.context: no context in inherited config')
    for (const matcher of removal.context) {
      const result = findContextEntryIndex(context, matcher)
      if (result === 'none')
        throw new ConfigValidationError(layerPath, 'remove.context: no matching entry')
      if (result === 'ambiguous')
        throw new ConfigValidationError(layerPath, 'remove.context: ambiguous match')
      context.splice(result, 1)
    }
  }
  if (removal.plugins?.agents) {
    const plugins = accumulated['plugins'] as Record<string, unknown> | undefined
    const agents = plugins?.['agents'] as Array<Record<string, unknown>> | undefined
    if (!agents)
      throw new ConfigValidationError(
        layerPath,
        'remove.plugins.agents: no agents in inherited config',
      )
    for (const { name } of removal.plugins.agents) {
      const idx = agents.findIndex((entry) => entry['name'] === name)
      if (idx === -1)
        throw new ConfigValidationError(layerPath, `remove.plugins.agents: '${name}' not found`)
      agents.splice(idx, 1)
    }
  }
}

/**
 * Merges all active cascade layers into a single raw config object,
 * applying removals from non-root layers.
 *
 * @param cascade - The resolved cascade with active layers
 * @returns The deep-merged raw config object
 * @throws {ConfigValidationError} When no active layers exist or removals fail validation
 */
function mergeActiveLayers(cascade: ResolvedConfigCascade): Record<string, unknown> {
  if (cascade.activeLayers.length === 0) {
    throw new ConfigValidationError(cascade.rootPath, 'no active config layers to merge')
  }
  const rootRaw = cascade.activeLayers[0]!.raw
  let accumulated: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rootRaw)) {
    if (key !== 'extends' && key !== 'remove') accumulated[key] = value
  }
  for (let i = 1; i < cascade.activeLayers.length; i++) {
    const layer = cascade.activeLayers[i]!
    accumulated = deepMergeRawConfig(accumulated, layer.raw)
    if (layer.removal) applyRemovals(accumulated, layer.removal, layer.path)
  }
  return accumulated
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to load environment variables from `.env` and `.env.local` files
 * in the configuration directory.
 *
 * @param configDir - Absolute directory containing the config file
 */
function tryLoadEnvFiles(configDir: string): void {
  const files = [path.join(configDir, '.env.local'), path.join(configDir, '.env')]
  for (const file of files) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        // process.loadEnvFile does NOT override existing variables.
        // To ensure .env.local has higher priority, we must load it FIRST.
        process.loadEnvFile(file)
      }
    } catch {
      // Ignore missing files or permission errors
    }
  }
}

/**
 * Merges environment variable overrides into the raw configuration object.
 *
 * @param raw - The raw configuration object parsed from YAML
 */
function applyEnvOverrides(raw: Record<string, unknown>): void {
  if (process.env['SPECD_ACTOR_PROVIDER']) {
    raw.actorProvider = process.env['SPECD_ACTOR_PROVIDER']
  }
  if (process.env['SPECD_PRIVACY_MODE'] || process.env['SPECD_PRIVACY_SALT']) {
    const privacy = (raw.privacy as Record<string, unknown> | undefined) ?? {}
    if (process.env['SPECD_PRIVACY_MODE']) privacy.mode = process.env['SPECD_PRIVACY_MODE']
    if (process.env['SPECD_PRIVACY_SALT']) privacy.salt = process.env['SPECD_PRIVACY_SALT']
    raw.privacy = privacy
  }
  if (process.env['SPECD_LOG_LEVEL']) {
    const logging = (raw.logging as Record<string, unknown> | undefined) ?? {}
    logging.level = process.env['SPECD_LOG_LEVEL']
    raw.logging = logging
  }
  if (process.env['SPECD_CONTEXT_MODE']) raw.contextMode = process.env['SPECD_CONTEXT_MODE']
  if (process.env['SPECD_LLM_OPTIMIZED'])
    raw.llmOptimizedContext = process.env['SPECD_LLM_OPTIMIZED'] === 'true'
  if (process.env['SPECD_SCHEMA']) raw.schema = process.env['SPECD_SCHEMA']
}

/**
 * Resolves a raw adapter binding from config into the normalized kernel-facing shape.
 *
 * For `fs`, the `path` field is required and resolved to an absolute path. For
 * all other adapters, the adapter-specific block is preserved opaquely and no
 * semantic validation is performed here.
 *
 * @param configDir - Absolute directory containing the loaded config file
 * @param configPath - Absolute config file path for validation errors
 * @param fieldPath - Config field path for error messages
 * @param raw - Raw adapter binding object from parsed YAML
 * @param fallbackLegacyPath - Compatibility-only path used when the adapter is not `fs`
 * @param allowPattern - Whether `pattern` is allowed for `fs` adapter options
 * @returns The normalized adapter binding and compatibility legacy path
 * @throws {@link ConfigValidationError} When the binding shape is invalid
 */
function resolveAdapterBinding(
  configDir: string,
  configPath: string,
  fieldPath: string,
  raw: Record<string, unknown>,
  fallbackLegacyPath: string,
  allowPattern = false,
): { binding: SpecdAdapterBinding; legacyPath: string } {
  const adapter = raw.adapter
  if (typeof adapter !== 'string' || adapter.length === 0) {
    throw new ConfigValidationError(
      configPath,
      `${fieldPath}.adapter: expected non-empty adapter name`,
    )
  }
  if (adapter === 'fs') {
    const fsBlock = raw.fs
    if (!isRecord(fsBlock))
      throw new ConfigValidationError(configPath, `${fieldPath}.fs: expected object`)
    const fsPath = fsBlock.path
    if (typeof fsPath !== 'string' || fsPath.length === 0)
      throw new ConfigValidationError(configPath, `${fieldPath}.fs.path: expected string`)
    const resolvedPath = path.resolve(configDir, fsPath)
    const config: Record<string, unknown> = { path: resolvedPath }
    if (allowPattern) {
      const pattern = fsBlock.pattern
      if (pattern !== undefined) {
        if (typeof pattern !== 'string')
          throw new ConfigValidationError(configPath, `${fieldPath}.fs.pattern: expected string`)
        config.pattern = pattern
      }
    }
    return { binding: { adapter, config }, legacyPath: resolvedPath }
  }
  const adapterBlock = raw[adapter]
  if (adapterBlock !== undefined && !isRecord(adapterBlock)) {
    throw new ConfigValidationError(configPath, `${fieldPath}.${adapter}: expected object`)
  }
  return {
    binding: { adapter, config: isRecord(adapterBlock) ? adapterBlock : {} },
    legacyPath: fallbackLegacyPath,
  }
}

// ---------------------------------------------------------------------------
// FsConfigLoader
// ---------------------------------------------------------------------------

/**
 * Filesystem implementation of the {@link ConfigLoader} port.
 *
 * Supports two construction modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir` to find
 *   candidate config files, resolving a cascade chain.
 * - **Forced mode** (`{ configPath }`) — uses the specified file directly as
 *   a closed chain.
 *
 * In both modes, candidate layers are deep-merged and the result is validated
 * against a Zod schema before any path resolution takes place. All relative
 * paths in the config are resolved relative to the config file's directory.
 * `isExternal` is inferred from whether each workspace's `specsPath` lies
 * outside the git repository root.
 */
export class FsConfigLoader implements ConfigLoader {
  private readonly _options: FsConfigLoaderOptions

  /**
   * Creates a new `FsConfigLoader`.
   *
   * @param options - Discovery or forced-path options
   */
  constructor(options: FsConfigLoaderOptions) {
    this._options = options
  }

  /**
   * Loads, validates, and returns the fully-resolved project configuration.
   *
   * @returns The resolved `SpecdConfig` with all paths made absolute
   * @throws {@link ConfigValidationError} When no config file is found, the
   *   YAML is invalid, or required fields are missing
   */
  async load(): Promise<SpecdConfig> {
    const cascade = await this._resolveCascade()
    const mergedRaw = mergeActiveLayers(cascade)

    const configDir = path.dirname(cascade.rootPath)
    tryLoadEnvFiles(configDir)

    if (isRecord(mergedRaw)) {
      applyEnvOverrides(mergedRaw)
      if ('artifactRules' in mergedRaw) {
        throw new ConfigValidationError(
          cascade.rootPath,
          "'artifactRules' is not supported; use 'schemaOverrides' instead",
        )
      }
      if ('skills' in mergedRaw) {
        throw new ConfigValidationError(
          cascade.rootPath,
          "'skills' is not supported; skills are managed via the plugin system",
        )
      }
    }

    const parseResult = SpecdYamlZodSchema.safeParse(mergedRaw)
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      const location = issue ? formatZodPath(issue.path) : ''
      const message = issue
        ? location
          ? `${location}: ${issue.message}`
          : issue.message
        : 'config validation failed'
      throw new ConfigValidationError(cascade.rootPath, message)
    }

    return await this._buildConfig(parseResult.data, configDir, cascade.rootPath)
  }

  /**
   * Resolves the path to the active root config file without loading or parsing it.
   *
   * - **Discovery mode**: discovers candidates, resolves the active chain, and
   *   returns the root path. Never throws.
   * - **Forced mode**: returns `path.resolve(configPath)` without checking whether
   *   the file exists. Never throws.
   *
   * @returns Absolute path to the config file, or `null` if not found in discovery mode
   */
  async resolvePath(): Promise<string | null> {
    if ('configPath' in this._options) {
      return path.resolve(this._options.configPath)
    }
    try {
      const dir = await findCandidateDirectory(this._options.startDir)
      if (dir === null) return null
      const candidatePaths = await discoverCandidateFiles(dir)
      const layers: ConfigCascadeLayer[] = []
      for (const cp of candidatePaths) {
        try {
          layers.push(await parseCascadeLayer(cp))
        } catch {
          continue
        }
      }
      if (layers.length === 0) return null
      const cascade = resolveActiveChain(layers)
      return cascade.rootPath
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the config cascade based on the loader mode.
   *
   * @returns The resolved cascade with active layers
   * @throws {@link ConfigValidationError} When discovery mode finds no candidates
   */
  private async _resolveCascade(): Promise<ResolvedConfigCascade> {
    if ('configPath' in this._options) {
      return resolveForcedCascade(this._options.configPath)
    }
    const dir = await findCandidateDirectory(this._options.startDir)
    if (dir === null) {
      throw new ConfigValidationError(
        this._options.startDir,
        'no specd.yaml found (searched up to git root)',
      )
    }
    const candidatePaths = await discoverCandidateFiles(dir)
    const layers: ConfigCascadeLayer[] = []
    for (const cp of candidatePaths) {
      layers.push(await parseCascadeLayer(cp))
    }
    return resolveActiveChain(layers)
  }

  /**
   * Builds the final `SpecdConfig` from Zod-validated data, resolving all paths
   * relative to the config directory and inferring external workspace status.
   *
   * @param data - Zod-validated config data
   * @param configDir - Absolute directory containing the root config file
   * @param rootConfigPath - Absolute path to the root config file for error messages
   * @returns The fully resolved `SpecdConfig`
   */
  private async _buildConfig(
    data: z.infer<typeof SpecdYamlZodSchema>,
    configDir: string,
    rootConfigPath: string,
  ): Promise<SpecdConfig> {
    const resolvedConfigPath = path.resolve(
      configDir,
      data.configPath ?? path.join('.specd', 'config'),
    )
    validateContextPatterns(data, rootConfigPath)
    if (!data.workspaces.default) {
      throw new ConfigValidationError(rootConfigPath, "'workspaces.default' is required")
    }

    const gitRoot = await findVcsRoot(configDir)

    const workspaces: SpecdWorkspaceConfig[] = Object.entries(data.workspaces).map(([name, ws]) => {
      const specsBinding = resolveAdapterBinding(
        configDir,
        rootConfigPath,
        `workspaces.${name}.specs`,
        ws.specs,
        path.resolve(configDir, '.specd', 'virtual', 'workspaces', name, 'specs'),
      )
      const defaultSchemasPath = path.resolve(configDir, '.specd/schemas')
      const schemasBinding =
        ws.schemas !== undefined
          ? resolveAdapterBinding(
              configDir,
              rootConfigPath,
              `workspaces.${name}.schemas`,
              ws.schemas,
              path.resolve(configDir, '.specd', 'virtual', 'workspaces', name, 'schemas'),
            )
          : name === 'default'
            ? {
                binding: {
                  adapter: 'fs',
                  config: { path: defaultSchemasPath },
                } satisfies SpecdAdapterBinding,
                legacyPath: defaultSchemasPath,
              }
            : null
      let codeRoot: string
      if (ws.codeRoot !== undefined) codeRoot = path.resolve(configDir, ws.codeRoot)
      else if (name === 'default') codeRoot = configDir
      else
        throw new ConfigValidationError(
          rootConfigPath,
          `'workspaces.${name}.codeRoot' is required for non-default workspaces`,
        )
      const ownership = ws.ownership ?? (name === 'default' ? 'owned' : 'readOnly')
      const isExternal =
        gitRoot !== null && specsBinding.binding.adapter === 'fs'
          ? !specsBinding.legacyPath.startsWith(gitRoot + path.sep) &&
            specsBinding.legacyPath !== gitRoot
          : false
      return {
        name,
        ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
        specsPath: specsBinding.legacyPath,
        specsAdapter: specsBinding.binding,
        schemasPath: schemasBinding?.legacyPath ?? null,
        schemasAdapter: schemasBinding?.binding ?? null,
        codeRoot,
        ownership,
        isExternal,
        ...(ws.contextIncludeSpecs !== undefined
          ? { contextIncludeSpecs: ws.contextIncludeSpecs }
          : {}),
        ...(ws.contextExcludeSpecs !== undefined
          ? { contextExcludeSpecs: ws.contextExcludeSpecs }
          : {}),
        ...(ws.graph !== undefined
          ? {
              graph: {
                ...(ws.graph.respectGitignore !== undefined
                  ? { respectGitignore: ws.graph.respectGitignore }
                  : {}),
                ...(ws.graph.excludePaths !== undefined
                  ? { excludePaths: ws.graph.excludePaths }
                  : {}),
              },
            }
          : {}),
      }
    })

    const changesBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.changes',
      data.storage.changes,
      path.resolve(configDir, '.specd', 'virtual', 'storage', 'changes'),
    )
    const draftsBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.drafts',
      data.storage.drafts,
      path.resolve(configDir, '.specd', 'virtual', 'storage', 'drafts'),
    )
    const discardedBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.discarded',
      data.storage.discarded,
      path.resolve(configDir, '.specd', 'virtual', 'storage', 'discarded'),
    )
    const archiveBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.archive',
      data.storage.archive,
      path.resolve(configDir, '.specd', 'virtual', 'storage', 'archive'),
      true,
    )

    if (gitRoot !== null) {
      if (!resolvedConfigPath.startsWith(gitRoot + path.sep) && resolvedConfigPath !== gitRoot) {
        throw new ConfigValidationError(rootConfigPath, 'configPath resolves outside repo root')
      }
      for (const [key, binding] of [
        ['changes', changesBinding],
        ['drafts', draftsBinding],
        ['discarded', discardedBinding],
        ['archive', archiveBinding],
      ] as const) {
        if (binding.binding.adapter !== 'fs') continue
        if (!binding.legacyPath.startsWith(gitRoot + path.sep) && binding.legacyPath !== gitRoot) {
          throw new ConfigValidationError(
            rootConfigPath,
            `storage path '${key}' resolves outside repo root`,
          )
        }
      }
    }

    const storage: SpecdStorageConfig = {
      changesPath: changesBinding.legacyPath,
      changesAdapter: changesBinding.binding,
      draftsPath: draftsBinding.legacyPath,
      draftsAdapter: draftsBinding.binding,
      discardedPath: discardedBinding.legacyPath,
      discardedAdapter: discardedBinding.binding,
      archivePath: archiveBinding.legacyPath,
      archiveAdapter: archiveBinding.binding,
      ...(typeof archiveBinding.binding.config.pattern === 'string'
        ? { archivePattern: archiveBinding.binding.config.pattern }
        : {}),
    }

    const context: SpecdContextEntry[] | undefined = data.context as SpecdContextEntry[] | undefined
    return {
      projectRoot: configDir,
      configPath: resolvedConfigPath,
      schemaRef: data.schema,
      workspaces,
      storage,
      approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false },
      logging: { level: data.logging?.level ?? 'info' },
      ...(data.actorProvider !== undefined ? { actorProvider: data.actorProvider } : {}),
      ...(data.privacy !== undefined ? { privacy: data.privacy } : {}),
      ...(context !== undefined ? { context } : {}),
      ...(data.contextIncludeSpecs !== undefined
        ? { contextIncludeSpecs: data.contextIncludeSpecs }
        : {}),
      ...(data.contextExcludeSpecs !== undefined
        ? { contextExcludeSpecs: data.contextExcludeSpecs }
        : {}),
      ...(data.contextMode !== undefined ? { contextMode: data.contextMode } : {}),
      ...(data.llmOptimizedContext !== undefined
        ? { llmOptimizedContext: data.llmOptimizedContext }
        : {}),
      ...(data.schemaPlugins !== undefined ? { schemaPlugins: data.schemaPlugins } : {}),
      ...(data.schemaOverrides !== undefined
        ? { schemaOverrides: data.schemaOverrides as SchemaOperations }
        : {}),
      ...(data.invalidationPolicy !== undefined && isInvalidationPolicy(data.invalidationPolicy)
        ? { invalidationPolicy: data.invalidationPolicy }
        : {}),
      ...(data.plugins !== undefined
        ? {
            plugins: {
              ...(data.plugins.agents !== undefined
                ? {
                    agents: data.plugins.agents.map((plugin) => ({
                      name: plugin.name,
                      ...(plugin.config !== undefined ? { config: plugin.config } : {}),
                    })),
                  }
                : {}),
            },
          }
        : {}),
      api: {
        auth: { type: 'disabled' as const, ...(data.api?.auth?.config !== undefined ? { config: data.api.auth.config } : {}) },
        ...(data.api?.cors !== undefined
          ? {
              cors: {
                ...(data.api.cors.origins !== undefined
                  ? { origins: data.api.cors.origins as readonly string[] }
                  : {}),
              },
            }
          : {}),
      },
    }
  }
}

/**
 * Detects the VCS repository root by probing `git rev-parse`.
 *
 * Falls back to `null` when the directory is not inside a git repository
 * (or any other VCS — git is the only VCS probed here since config
 * discovery runs before the full VCS factory is available).
 *
 * @param startDir - Directory to probe for a VCS repository
 * @returns Absolute path to the VCS root, or `null` if not inside a VCS repo
 */
async function findVcsRoot(startDir: string): Promise<string | null> {
  try {
    return await git(startDir, 'rev-parse', '--show-toplevel')
  } catch {
    return null
  }
}
