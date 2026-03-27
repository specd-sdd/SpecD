import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { type ConfigLoader } from '../../application/ports/config-loader.js'
import { isEnoent } from './is-enoent.js'
import {
  type SpecdConfig,
  type SpecdWorkspaceConfig,
  type SpecdStorageConfig,
  type SpecdContextEntry,
} from '../../application/specd-config.js'
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

const FsAdapterZodSchema = z.object({
  adapter: z.literal('fs'),
  fs: z.object({ path: z.string() }),
})

const FsStorageZodSchema = z.object({
  adapter: z.literal('fs'),
  fs: z.object({
    path: z.string(),
    pattern: z.string().optional(),
  }),
})

const ContextEntryRawZodSchema = z.union([
  z.object({ file: z.string() }),
  z.object({ instruction: z.string() }),
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
      {
        contextIncludeSpecs?: string[] | undefined
        contextExcludeSpecs?: string[] | undefined
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

const WorkspaceRawZodSchema = z
  .object({
    prefix: PrefixZodSchema.optional(),
    specs: FsAdapterZodSchema,
    schemas: FsAdapterZodSchema.optional(),
    codeRoot: z.string().optional(),
    ownership: z.enum(['owned', 'shared', 'readOnly']).optional(),
    contextIncludeSpecs: z.array(z.string()).optional(),
    contextExcludeSpecs: z.array(z.string()).optional(),
  })
  .strict()

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

const SpecdYamlZodSchema = z.object({
  schema: z.string(),
  workspaces: z.record(WorkspaceRawZodSchema),
  storage: z.object({
    changes: FsAdapterZodSchema,
    drafts: FsAdapterZodSchema,
    discarded: FsAdapterZodSchema,
    archive: FsStorageZodSchema,
  }),
  approvals: z
    .object({
      spec: z.boolean().optional(),
      signoff: z.boolean().optional(),
    })
    .optional(),
  artifactRules: z.record(z.array(z.string())).optional(),
  context: z.array(ContextEntryRawZodSchema).optional(),
  contextIncludeSpecs: z.array(z.string()).optional(),
  contextExcludeSpecs: z.array(z.string()).optional(),
  contextMode: z.enum(['full', 'lazy']).optional(),
  llmOptimizedContext: z.boolean().optional(),
  schemaPlugins: z.array(z.string()).optional(),
  schemaOverrides: SchemaOverridesZodSchema.optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Walks up from `startDir`, bounded by the git root (or filesystem root if
 * outside a git repo), to locate `specd.local.yaml` or `specd.yaml`.
 *
 * At each directory level, `specd.local.yaml` is checked first. If it exists,
 * it is returned immediately — `specd.yaml` need not be present. Otherwise
 * `specd.yaml` is checked. The first match wins.
 *
 * @param startDir - Directory to begin the search from
 * @returns Absolute path to the active config file, or `null` if not found
 */
async function findConfigFile(startDir: string): Promise<string | null> {
  const gitRoot = await findVcsRoot(startDir)
  let dir = path.resolve(startDir)

  if (gitRoot === null) {
    // Not inside a git repo — check CWD only, do not walk up
    const localPath = path.join(dir, 'specd.local.yaml')
    try {
      await fs.access(localPath)
      return localPath
    } catch {
      // no local file
    }

    const mainPath = path.join(dir, 'specd.yaml')
    try {
      await fs.access(mainPath)
      return mainPath
    } catch {
      // no main file
    }

    return null
  }

  // Inside a git repo — walk up bounded by gitRoot
  while (true) {
    // Local override takes precedence — no specd.yaml required
    const localPath = path.join(dir, 'specd.local.yaml')
    try {
      await fs.access(localPath)
      return localPath
    } catch {
      // no local file at this level
    }

    const mainPath = path.join(dir, 'specd.yaml')
    try {
      await fs.access(mainPath)
      return mainPath
    } catch {
      // no main file at this level
    }

    if (dir === gitRoot) break
    const parent = path.dirname(dir)
    if (parent === dir) break // filesystem root
    dir = parent
  }

  return null
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
// FsConfigLoader
// ---------------------------------------------------------------------------

/**
 * Filesystem implementation of the {@link ConfigLoader} port.
 *
 * Supports two construction modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir` to find
 *   `specd.yaml`, honouring `specd.local.yaml` when present.
 * - **Forced mode** (`{ configPath }`) — uses the specified file directly.
 *
 * In both modes, the parsed YAML is validated against a Zod schema before any
 * path resolution takes place. All relative paths in the config are resolved
 * relative to the config file's directory. `isExternal` is inferred from
 * whether each workspace's `specsPath` lies outside the git repository root.
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
    const configPath = await this._resolveConfigPath()
    const configDir = path.dirname(configPath)

    let content: string
    try {
      content = await fs.readFile(configPath, 'utf-8')
    } catch (err) {
      if (isEnoent(err)) {
        throw new ConfigValidationError(configPath, 'config file not found')
      }
      throw err
    }

    let raw: unknown
    try {
      raw = parseYaml(content)
    } catch (err) {
      throw new ConfigValidationError(configPath, `invalid YAML: ${(err as Error).message}`)
    }

    const parseResult = SpecdYamlZodSchema.safeParse(raw)
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      if (issue === undefined) {
        throw new ConfigValidationError(configPath, 'config validation failed')
      }
      const location = formatZodPath(issue.path)
      const message = location
        ? `${location}: ${issue.message.toLowerCase()}`
        : issue.message.toLowerCase()
      throw new ConfigValidationError(configPath, message)
    }

    const data = parseResult.data

    validateContextPatterns(data, configPath)

    if (!data.workspaces.default) {
      throw new ConfigValidationError(configPath, "'workspaces.default' is required")
    }

    const gitRoot = await findVcsRoot(configDir)

    const workspaces: SpecdWorkspaceConfig[] = Object.entries(data.workspaces).map(([name, ws]) => {
      const specsPath = path.resolve(configDir, ws.specs.fs.path)

      const schemasPath =
        ws.schemas !== undefined
          ? path.resolve(configDir, ws.schemas.fs.path)
          : name === 'default'
            ? path.resolve(configDir, '.specd/schemas')
            : null

      let codeRoot: string
      if (ws.codeRoot !== undefined) {
        codeRoot = path.resolve(configDir, ws.codeRoot)
      } else if (name === 'default') {
        codeRoot = configDir
      } else {
        throw new ConfigValidationError(
          configPath,
          `'workspaces.${name}.codeRoot' is required for non-default workspaces`,
        )
      }

      const ownership = ws.ownership ?? (name === 'default' ? 'owned' : 'readOnly')

      const isExternal =
        gitRoot !== null
          ? !specsPath.startsWith(gitRoot + path.sep) && specsPath !== gitRoot
          : false

      return {
        name,
        ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
        specsPath,
        schemasPath,
        codeRoot,
        ownership,
        isExternal,
        ...(ws.contextIncludeSpecs !== undefined
          ? { contextIncludeSpecs: ws.contextIncludeSpecs }
          : {}),
        ...(ws.contextExcludeSpecs !== undefined
          ? { contextExcludeSpecs: ws.contextExcludeSpecs }
          : {}),
      }
    })

    const storagePaths = {
      changes: path.resolve(configDir, data.storage.changes.fs.path),
      drafts: path.resolve(configDir, data.storage.drafts.fs.path),
      discarded: path.resolve(configDir, data.storage.discarded.fs.path),
      archive: path.resolve(configDir, data.storage.archive.fs.path),
    }

    if (gitRoot !== null) {
      for (const [key, storagePath] of Object.entries(storagePaths)) {
        if (!storagePath.startsWith(gitRoot + path.sep) && storagePath !== gitRoot) {
          throw new ConfigValidationError(
            configPath,
            `storage path '${key}' resolves outside repo root`,
          )
        }
      }
    }

    const storage: SpecdStorageConfig = {
      changesPath: storagePaths.changes,
      draftsPath: storagePaths.drafts,
      discardedPath: storagePaths.discarded,
      archivePath: storagePaths.archive,
      ...(data.storage.archive.fs.pattern !== undefined
        ? { archivePattern: data.storage.archive.fs.pattern }
        : {}),
    }

    const context: SpecdContextEntry[] | undefined = data.context as SpecdContextEntry[] | undefined

    return {
      projectRoot: configDir,
      schemaRef: data.schema,
      workspaces,
      storage,
      approvals: {
        spec: data.approvals?.spec ?? false,
        signoff: data.approvals?.signoff ?? false,
      },
      ...(data.artifactRules !== undefined ? { artifactRules: data.artifactRules } : {}),
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
        ? {
            schemaOverrides:
              data.schemaOverrides as import('../../domain/services/merge-schema-layers.js').SchemaOperations,
          }
        : {}),
    }
  }

  /**
   * Resolves the path to the active config file without loading or parsing it.
   *
   * - **Discovery mode**: delegates to `findConfigFile()` and returns the result
   *   directly (`string | null`). Never throws.
   * - **Forced mode**: returns `path.resolve(configPath)` without checking whether
   *   the file exists. Never throws.
   *
   * @returns Absolute path to the config file, or `null` if not found in discovery mode
   */
  async resolvePath(): Promise<string | null> {
    if ('configPath' in this._options) {
      return path.resolve(this._options.configPath)
    }
    return findConfigFile(this._options.startDir)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the config file path based on the loader mode.
   *
   * @returns Absolute path to the config file to load
   * @throws {@link ConfigValidationError} When discovery mode finds no `specd.yaml`
   */
  private async _resolveConfigPath(): Promise<string> {
    if ('configPath' in this._options) {
      return path.resolve(this._options.configPath)
    }

    const found = await findConfigFile(this._options.startDir)
    if (found === null) {
      throw new ConfigValidationError(
        this._options.startDir,
        'no specd.yaml found (searched up to git root)',
      )
    }
    return found
  }
}
