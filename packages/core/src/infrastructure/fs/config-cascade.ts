import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { isEnoent } from './is-enoent.js'
import { ConfigValidationError } from '../../domain/errors/config-validation-error.js'
import {
  isRecord,
  formatZodPath,
  ContextEntryRawZodSchema,
  deepMergeRawConfig,
} from '../../application/ports/config-schema.js'

// ---------------------------------------------------------------------------
// Zod schemas — cascade layer (permissive)
// ---------------------------------------------------------------------------

export const LayerExtendsZodSchema = z.union([z.literal(true), z.string()])

export const RemovalMatcherZodSchema = z.object({
  id: z.string().optional(),
  file: z.string().optional(),
  instruction: z.string().optional(),
})

export const LayerRemovalZodSchema = z
  .object({
    root: z.array(z.string()).optional(),
    workspaces: z.array(z.string()).optional(),
    storage: z.array(z.string()).optional(),
    context: z.array(RemovalMatcherZodSchema).optional(),
    plugins: z.object({ agents: z.array(z.object({ name: z.string() })) }).optional(),
  })
  .strict()

export const LayerRawZodSchema = z
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
export interface CascadeRemoval {
  readonly root?: readonly string[]
  readonly workspaces?: readonly string[]
  readonly storage?: readonly string[]
  readonly context?: ReadonlyArray<{
    readonly id?: string
    readonly file?: string
    readonly instruction?: string
  }>
  readonly plugins?: {
    readonly agents?: ReadonlyArray<{ readonly name: string }>
  }
}

/**
 * A single parsed cascade layer with resolved extends metadata.
 */
export interface ConfigCascadeLayer {
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
export interface ResolvedConfigCascade {
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
export function candidateSortKey(filename: string): [number, string] | null {
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
export async function discoverCandidateFiles(dir: string): Promise<string[]> {
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
 * @param rootPath - Absolute VCS root boundary, or `null` when discovery is unbounded
 * @returns The first directory containing candidate files, or `null` if none found
 */
export async function findCandidateDirectory(
  startDir: string,
  rootPath: string | null,
): Promise<string | null> {
  let dir = path.resolve(startDir)
  if (rootPath === null) {
    const candidates = await discoverCandidateFiles(dir)
    return candidates.length > 0 ? dir : null
  }
  while (true) {
    const candidates = await discoverCandidateFiles(dir)
    if (candidates.length > 0) return dir
    if (dir === rootPath) break
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
export function determineExtendsMode(
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
export async function parseCascadeLayer(filePath: string): Promise<ConfigCascadeLayer> {
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
  let removal: CascadeRemoval | undefined = validated.remove as CascadeRemoval | undefined
  if (removal?.context) {
    removal = {
      ...removal,
      context: removal.context.map((matcher) => {
        if (matcher.file !== undefined) {
          const absoluteFile = path.isAbsolute(matcher.file)
            ? matcher.file
            : path.resolve(path.dirname(filePath), matcher.file)
          return { ...matcher, file: absoluteFile }
        }
        return matcher
      }),
    }
  }

  const normalizedRaw = { ...raw }
  if (Array.isArray(normalizedRaw.context)) {
    normalizedRaw.context = normalizedRaw.context.map((entry) => {
      if (isRecord(entry) && typeof entry.file === 'string') {
        const absoluteFile = path.isAbsolute(entry.file)
          ? entry.file
          : path.resolve(path.dirname(filePath), entry.file)
        return { ...entry, file: absoluteFile }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return entry
    })
  }

  return {
    path: filePath,
    dir: path.dirname(filePath),
    raw: normalizedRaw,
    extendsMode: mode,
    extendsPath,
    removal,
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
export function resolveActiveChain(layers: readonly ConfigCascadeLayer[]): ResolvedConfigCascade {
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
export async function resolveForcedCascade(entryPath: string): Promise<ResolvedConfigCascade> {
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
// Cascade helpers
// ---------------------------------------------------------------------------

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
export function matchesContextEntry(
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
export function findContextEntryIndex(
  context: ReadonlyArray<Record<string, unknown>>,
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
export function applyRemovals(
  accumulated: Record<string, unknown>,
  removal: CascadeRemoval,
  layerPath: string,
): void {
  if (removal.root) {
    for (const field of removal.root) delete accumulated[field]
  }
  if (removal.workspaces) {
    const workspaces = accumulated['workspaces'] as Record<string, unknown> | undefined
    if (!workspaces) {
      throw new ConfigValidationError(
        layerPath,
        'remove.workspaces: no workspaces in inherited config',
      )
    }
    for (const name of removal.workspaces) {
      if (!(name in workspaces)) {
        throw new ConfigValidationError(layerPath, `remove.workspaces: '${name}' not found`)
      }
      delete workspaces[name]
    }
  }
  if (removal.storage) {
    const storage = accumulated['storage'] as Record<string, unknown> | undefined
    if (!storage) {
      throw new ConfigValidationError(layerPath, 'remove.storage: no storage in inherited config')
    }
    for (const name of removal.storage) {
      if (!(name in storage)) {
        throw new ConfigValidationError(layerPath, `remove.storage: '${name}' not found`)
      }
      delete storage[name]
    }
  }
  if (removal.context) {
    const context = accumulated['context'] as Array<Record<string, unknown>> | undefined
    if (!context) {
      throw new ConfigValidationError(layerPath, 'remove.context: no context in inherited config')
    }
    for (const matcher of removal.context) {
      const result = findContextEntryIndex(context, matcher)
      if (result === 'none') {
        throw new ConfigValidationError(layerPath, 'remove.context: no matching entry')
      }
      if (result === 'ambiguous') {
        throw new ConfigValidationError(layerPath, 'remove.context: ambiguous match')
      }
      context.splice(result, 1)
    }
  }
  if (removal.plugins?.agents) {
    const plugins = accumulated['plugins'] as Record<string, unknown> | undefined
    const agents = plugins?.['agents'] as Array<Record<string, unknown>> | undefined
    if (!agents) {
      throw new ConfigValidationError(
        layerPath,
        'remove.plugins.agents: no agents in inherited config',
      )
    }
    for (const { name } of removal.plugins.agents) {
      const idx = agents.findIndex((entry) => entry['name'] === name)
      if (idx === -1) {
        throw new ConfigValidationError(layerPath, `remove.plugins.agents: '${name}' not found`)
      }
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
export function mergeActiveLayers(cascade: ResolvedConfigCascade): Record<string, unknown> {
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
// Environment variables helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to load environment variables from `.env` and `.env.local` files
 * in the configuration directory.
 *
 * @param configDir - Absolute directory containing the config file
 */
export function tryLoadEnvFiles(configDir: string): void {
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
export function applyEnvOverrides(raw: Record<string, unknown>): void {
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
  if (process.env['SPECD_LLM_OPTIMIZED']) {
    raw.llmOptimizedContext = process.env['SPECD_LLM_OPTIMIZED'] === 'true'
  }
  if (process.env['SPECD_SCHEMA']) raw.schema = process.env['SPECD_SCHEMA']
}
