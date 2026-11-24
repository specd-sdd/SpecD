import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { stringify as yamlStringify, parseDocument, isMap } from 'yaml'
import type { Document } from 'yaml'
import type { ZodError } from 'zod'
import {
  type AddPluginOptions,
  type ConfigDeclaredPlugin,
  type ConfigWriter,
  type InitProjectOptions,
  type InitProjectResult,
} from '../../application/ports/config-writer.js'
import { CURRENT_CONFIG_VERSION } from '../../domain/errors/unsupported-config-version-error.js'
import { AlreadyInitialisedError } from '../../application/errors/already-initialised-error.js'
import { PluginsZodSchema } from '../../application/ports/config-schema.js'
import { ConfigValidationError } from '../../domain/errors/config-validation-error.js'
import { isPluginName } from '../../domain/plugin-name.js'
import { assertCurrentConfigFormat } from './config-loader.js'
import { ensureTmpGitignore } from './ensure-tmp-gitignore.js'
import { isEnoent } from './is-enoent.js'
import { writeFileAtomic } from './write-atomic.js'

/** Default project-relative storage root created by `initProject`. */
const DEFAULT_SPECD_DIR = '.specd'

/** Default project-relative metadata cache directory (`<specd dir>/metadata`). */
const DEFAULT_METADATA_CACHE_PATH = `${DEFAULT_SPECD_DIR}/metadata`

/**
 * Filesystem implementation of {@link ConfigWriter}.
 *
 * Writes and mutates `specd.yaml` on disk using the `yaml` package for
 * serialization.
 */
export class FsConfigWriter implements ConfigWriter {
  /**
   * Creates a new `specd.yaml` in `options.projectRoot`, creates the required
   * storage directories, and appends `specd.local.yaml` and `specd.local.*.yaml`
   * to `.gitignore`.
   *
   * @param options - Initialisation options
   * @returns The path and metadata of the created config
   * @throws {AlreadyInitialisedError} When `specd.yaml` already exists and `force` is not set
   */
  async initProject(options: InitProjectOptions): Promise<InitProjectResult> {
    const configPath = path.join(options.projectRoot, 'specd.yaml')

    // Check for existing config
    const exists = await fileExists(configPath)
    if (exists && !options.force) {
      throw new AlreadyInitialisedError(configPath)
    }

    // Resolve specs path (keep relative for writing to yaml)
    const specsRelPath = options.specsPath.endsWith('/')
      ? options.specsPath
      : `${options.specsPath}/`

    const configDoc = {
      configVersion: CURRENT_CONFIG_VERSION,
      schema: options.schemaRef,
      workspaces: {
        [options.workspaceId]: {
          specs: {
            adapter: {
              type: 'fs',
              config: {
                path: specsRelPath,
              },
            },
          },
        },
      },
    }

    const yamlContent = yamlStringify(configDoc, { lineWidth: 0 })
    await writeFileAtomic(configPath, yamlContent)

    // Create storage directories
    // The freshly written config declares no overrides, so the resolved paths are the defaults.
    const metadataCachePath = DEFAULT_METADATA_CACHE_PATH
    const storageBase = path.join(options.projectRoot, DEFAULT_SPECD_DIR)
    const configDir = path.join(storageBase, 'config')
    const metadataDir = path.join(options.projectRoot, metadataCachePath)
    await ensureTmpGitignore(configDir)
    await fs.mkdir(path.join(storageBase, 'changes'), { recursive: true })
    await fs.mkdir(path.join(storageBase, 'drafts'), { recursive: true })
    await fs.mkdir(path.join(storageBase, 'discarded'), { recursive: true })
    await fs.mkdir(path.join(storageBase, 'archive'), { recursive: true })
    await fs.mkdir(metadataDir, { recursive: true })

    // Create workspace specs directory
    await fs.mkdir(path.join(options.projectRoot, options.specsPath), { recursive: true })

    // Append specd.local.yaml to .gitignore if not already present
    const gitignorePath = path.join(options.projectRoot, '.gitignore')
    await appendGitignoreEntries(gitignorePath, [
      'specd.local.yaml',
      'specd.local.*.yaml',
      `/${metadataCachePath}/`,
    ])

    return {
      configPath,
      schemaRef: options.schemaRef,
      workspaces: [options.workspaceId],
      metadataCachePath,
    }
  }

  /**
   * Merges a plugin declaration into the flat `plugins` list.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param name - Scoped plugin package name
   * @param options - Optional config and contribution allowlist
   * @throws {ConfigValidationError} When `name` is not a scoped package name, `contributions` is empty, or the file is missing, invalid or not a mapping
   */
  async addPlugin(configPath: string, name: string, options?: AddPluginOptions): Promise<void> {
    if (!isPluginName(name)) {
      throw new ConfigValidationError(
        configPath,
        `plugin name '${name}' must be a scoped package name`,
      )
    }
    if (options?.contributions !== undefined && options.contributions.length === 0) {
      throw new ConfigValidationError(
        configPath,
        'contributions cannot be empty; omit the option to select every contribution',
      )
    }
    const doc = await readConfigDocument(configPath)
    if (!isMap(doc.contents)) {
      throw new ConfigValidationError(
        configPath,
        'config file has no root mapping (empty, comment-only or null document); a plugin cannot be added to a project without schema and workspaces',
      )
    }
    const raw = readMappingRoot(doc, configPath)
    const plugins = requireMutablePlugins(raw, configPath)
    const existingIndex = plugins.findIndex((plugin) => plugin.name === name)
    const existing = existingIndex >= 0 ? plugins[existingIndex] : undefined
    const next = mergePluginEntry(name, existing, options)
    if (existingIndex >= 0) plugins[existingIndex] = next
    else plugins.push(next)
    doc.set('plugins', plugins)
    await writeFileAtomic(configPath, doc.toString())
  }

  /**
   * Removes a plugin declaration from the flat `plugins` list by name.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param name - Scoped plugin package name
   */
  async removePlugin(configPath: string, name: string): Promise<void> {
    const doc = await readConfigDocument(configPath)
    const raw = readMappingRoot(doc, configPath)
    if (raw['plugins'] === undefined) return
    const plugins = requireMutablePlugins(raw, configPath)
    if (!plugins.some((plugin) => plugin.name === name)) return
    doc.set(
      'plugins',
      plugins.filter((plugin) => plugin.name !== name),
    )
    await writeFileAtomic(configPath, doc.toString())
  }

  /**
   * Lists plugin declarations from the flat `plugins` list.
   *
   * @param configPath - Absolute path to the `specd.yaml` to read
   * @returns Plugin declarations, or an empty list when the file or `plugins` key is missing
   * @throws {LegacyConfigFormatError} When `plugins` is the removed object shape
   * @throws {ConfigValidationError} When the file or `plugins` value is invalid
   */
  async listPlugins(configPath: string): Promise<ConfigDeclaredPlugin[]> {
    let content: string
    try {
      content = await fs.readFile(configPath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return []
      throw unreadableConfigError(configPath, err)
    }

    const doc = parseConfigDocument(configPath, content)

    const raw = readMappingRoot(doc, configPath)
    if (raw['plugins'] === undefined) return []
    assertCurrentConfigFormat(raw, configPath)
    const result = PluginsZodSchema.safeParse(raw['plugins'])
    if (!result.success) {
      throw new ConfigValidationError(configPath, describePluginsIssue(result.error))
    }
    return mapPluginEntries(result.data)
  }
}

/**
 * Describes the first problem found in an invalid `plugins` value, naming its real cause.
 *
 * @param error - The Zod error from {@link PluginsZodSchema}
 * @returns A message stating duplicate names, invalid names, unknown keys, empty contributions or the generic shape
 */
function describePluginsIssue(error: ZodError): string {
  const issue = error.issues[0]
  const shape = '`plugins` must be a flat list of { name, config?, contributions? }'
  if (issue === undefined) return shape
  const where = issue.path.length > 0 ? ` (at plugins.${issue.path.join('.')})` : ''
  if (issue.code === 'custom') return `${issue.message}${where}`
  if (issue.code === 'unrecognized_keys') {
    return `unknown key(s) ${issue.keys.map((k) => `'${k}'`).join(', ')} in a plugin entry${where}; allowed keys are name, config, contributions`
  }
  if (issue.path.at(-1) === 'name' && issue.code === 'invalid_string') {
    return `invalid plugin name; it must be a scoped package name like @scope/name${where}`
  }
  if (issue.path.at(-1) === 'contributions' && issue.code === 'too_small') {
    return `contributions cannot be empty; omit the option to select every contribution${where}`
  }
  return `${shape}: ${issue.message}${where}`
}

/**
 * Wraps a filesystem read failure (for example a directory path) as a validation error.
 *
 * @param configPath - Path that could not be read
 * @param err - The underlying filesystem error
 * @returns A {@link ConfigValidationError} describing the failure
 */
function unreadableConfigError(configPath: string, err: unknown): ConfigValidationError {
  return new ConfigValidationError(
    configPath,
    `cannot read config file: ${err instanceof Error ? err.message : String(err)}`,
  )
}

/**
 * Returns the root of a parsed config document as a mapping.
 *
 * @param doc - Parsed YAML document
 * @param configPath - Path used in error messages
 * @returns The root mapping, or an empty object for an empty document
 * @throws {ConfigValidationError} When the root is a scalar or a sequence
 */
function readMappingRoot(doc: Document, configPath: string): Record<string, unknown> {
  const rawRoot: unknown = doc.toJSON() ?? {}
  if (typeof rawRoot !== 'object' || rawRoot === null || Array.isArray(rawRoot)) {
    throw new ConfigValidationError(configPath, 'config root must be a mapping')
  }
  return rawRoot as Record<string, unknown>
}

/**
 * Reads a config document, rejecting invalid YAML.
 *
 * @param configPath - Absolute path to the config file
 * @returns The parsed YAML document
 * @throws {ConfigValidationError} When the file is missing or the YAML is invalid
 */
async function readConfigDocument(configPath: string): Promise<Document> {
  let content: string
  try {
    content = await fs.readFile(configPath, 'utf8')
  } catch (err) {
    if (isEnoent(err)) {
      throw new ConfigValidationError(configPath, 'config file not found')
    }
    throw unreadableConfigError(configPath, err)
  }
  return parseConfigDocument(configPath, content)
}

/**
 * Parses YAML and surfaces `yaml` parse errors as {@link ConfigValidationError}.
 *
 * @param configPath - Absolute path of the file being read
 * @param content - Raw YAML text
 * @returns The parsed document
 * @throws {ConfigValidationError} When the YAML is invalid
 */
function parseConfigDocument(configPath: string, content: string): Document {
  let doc: Document
  try {
    doc = parseDocument(content)
  } catch (err) {
    throw new ConfigValidationError(configPath, `invalid YAML: ${(err as Error).message}`)
  }
  if (doc.errors.length > 0) {
    const message = doc.errors[0]?.message ?? 'parse error'
    throw new ConfigValidationError(configPath, `invalid YAML: ${message}`)
  }
  return doc
}

/**
 * Builds the entry written for `name`, preserving fields the caller did not set.
 *
 * @param name - Plugin package name
 * @param existing - Current entry with the same name, when present
 * @param options - Fields supplied by this call
 * @returns The entry to persist
 */
function mergePluginEntry(
  name: string,
  existing: ConfigDeclaredPlugin | undefined,
  options: AddPluginOptions | undefined,
): ConfigDeclaredPlugin {
  // An explicit `undefined` is a type error; at runtime `??` treats it as omitted.
  const config = options?.config ?? existing?.config
  const contributions = options?.contributions ?? existing?.contributions
  return {
    name,
    ...(config !== undefined ? { config } : {}),
    ...(contributions !== undefined ? { contributions: [...contributions] } : {}),
  }
}

/**
 * Reads `plugins` for a mutation.
 *
 * An absent key is an empty list. A legacy `plugins.agents` object or any other
 * value that is not a valid flat list is rejected so the file is not rewritten.
 *
 * @param raw - Parsed config document
 * @param configPath - Absolute path of the file being updated
 * @returns The current plugin entries
 * @throws {LegacyConfigFormatError} When `plugins` is the removed object shape
 * @throws {ConfigValidationError} When `plugins` is present but not a valid flat list
 */
function requireMutablePlugins(
  raw: Record<string, unknown>,
  configPath: string,
): ConfigDeclaredPlugin[] {
  assertCurrentConfigFormat(raw, configPath)
  const plugins = raw['plugins']
  if (plugins === undefined) return []
  const result = PluginsZodSchema.safeParse(plugins)
  if (!result.success) {
    throw new ConfigValidationError(configPath, describePluginsIssue(result.error))
  }
  return mapPluginEntries(result.data)
}

/**
 * Copies parsed plugin entries into the writer model.
 *
 * @param entries - Entries accepted by {@link PluginsZodSchema}
 * @returns Writer entries with optional fields omitted when absent
 */
function mapPluginEntries(
  entries: ReadonlyArray<{
    name: string
    config?: Record<string, unknown> | undefined
    contributions?: string[] | undefined
  }>,
): ConfigDeclaredPlugin[] {
  return entries.map((entry) => ({
    name: entry.name,
    ...(entry.config !== undefined ? { config: entry.config } : {}),
    ...(entry.contributions !== undefined ? { contributions: entry.contributions } : {}),
  }))
}

// ---- Helpers ----

/**
 * Checks whether a file exists at the given path.
 *
 * @param filePath - Absolute path to check
 * @returns `true` if the file exists, `false` otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Appends entries to `.gitignore` if not already present.
 *
 * @param gitignorePath - Absolute path to the `.gitignore` file
 * @param entries - The lines to append
 */
async function appendGitignoreEntries(gitignorePath: string, entries: string[]): Promise<void> {
  let existing = ''
  try {
    existing = await fs.readFile(gitignorePath, 'utf8')
  } catch (err) {
    if (!isEnoent(err)) throw err
  }

  const lines = existing.split('\n')
  const missing = entries.filter((entry) => !lines.some((line) => line.trim() === entry))
  if (missing.length === 0) return

  const suffix = missing.join('\n') + '\n'
  const newContent =
    existing.endsWith('\n') || existing === '' ? `${existing}${suffix}` : `${existing}\n${suffix}`
  await writeFileAtomic(gitignorePath, newContent)
}
