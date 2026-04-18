import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { stringify as yamlStringify, parseDocument } from 'yaml'
import type { Document } from 'yaml'
import {
  type ConfigWriter,
  type InitProjectOptions,
  type InitProjectResult,
} from '../../application/ports/config-writer.js'
import { AlreadyInitialisedError } from '../../application/errors/already-initialised-error.js'
import { ConfigValidationError } from '../../domain/errors/config-validation-error.js'
import { isEnoent } from './is-enoent.js'
import { writeFileAtomic } from './write-atomic.js'

/**
 * Filesystem implementation of {@link ConfigWriter}.
 *
 * Writes and mutates `specd.yaml` on disk using the `yaml` package for
 * serialization.
 */
export class FsConfigWriter implements ConfigWriter {
  /**
   * Creates a new `specd.yaml` in `options.projectRoot`, creates the required
   * storage directories, and appends `specd.local.yaml` to `.gitignore`.
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

    // Build the yaml document — workspaces is a record keyed by workspace name.
    // Each adapter field follows the { adapter: 'fs', fs: { path } } shape.
    const fsAdapter = (p: string) => ({ adapter: 'fs', fs: { path: p } })
    const configDoc = {
      schema: options.schemaRef,
      workspaces: {
        [options.workspaceId]: {
          specs: fsAdapter(specsRelPath),
        },
      },
      storage: {
        changes: fsAdapter('.specd/changes/'),
        drafts: fsAdapter('.specd/drafts/'),
        discarded: fsAdapter('.specd/discarded/'),
        archive: fsAdapter('.specd/archive/'),
      },
    }

    const yamlContent = yamlStringify(configDoc, { lineWidth: 0 })
    await writeFileAtomic(configPath, yamlContent)

    // Create storage directories
    const storageBase = path.join(options.projectRoot, '.specd')
    await fs.mkdir(path.join(storageBase, 'changes'), { recursive: true })
    await fs.mkdir(path.join(storageBase, 'drafts'), { recursive: true })
    await fs.mkdir(path.join(storageBase, 'discarded'), { recursive: true })
    await fs.mkdir(path.join(storageBase, 'archive'), { recursive: true })

    // Append specd.local.yaml to .gitignore if not already present
    const gitignorePath = path.join(options.projectRoot, '.gitignore')
    await appendToGitignore(gitignorePath, 'specd.local.yaml')

    // Gitignore the archive index — it is a derived cache rebuilt on demand
    const archiveGitignorePath = path.join(storageBase, 'archive', '.gitignore')
    await appendToGitignore(archiveGitignorePath, '.specd-index.jsonl')

    return {
      configPath,
      schemaRef: options.schemaRef,
      workspaces: [options.workspaceId],
    }
  }

  /**
   * Adds or updates a plugin declaration under `plugins.<type>`.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param type - Plugin type key
   * @param name - Plugin package name
   * @param config - Optional plugin-specific config
   */
  async addPlugin(
    configPath: string,
    type: string,
    name: string,
    config?: Record<string, unknown>,
  ): Promise<void> {
    const content = await fs.readFile(configPath, 'utf8')
    let doc: Document
    try {
      doc = parseDocument(content)
    } catch (err) {
      throw new ConfigValidationError(configPath, `invalid YAML: ${(err as Error).message}`)
    }

    const raw = (doc.toJSON() ?? {}) as Record<string, unknown>
    const plugins = parsePlugins(raw['plugins'])
    const bucket = plugins[type] ?? []
    const existingIndex = bucket.findIndex((plugin) => plugin.name === name)

    if (existingIndex >= 0) {
      bucket[existingIndex] = config === undefined ? bucket[existingIndex]! : { name, config }
    } else {
      bucket.push(config === undefined ? { name } : { name, config })
    }

    plugins[type] = bucket
    doc.set('plugins', plugins)

    await writeFileAtomic(configPath, doc.toString())
  }

  /**
   * Removes a plugin declaration from `plugins.<type>` by name.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param type - Plugin type key
   * @param name - Plugin package name
   */
  async removePlugin(configPath: string, type: string, name: string): Promise<void> {
    const content = await fs.readFile(configPath, 'utf8')
    let doc: Document
    try {
      doc = parseDocument(content)
    } catch (err) {
      throw new ConfigValidationError(configPath, `invalid YAML: ${(err as Error).message}`)
    }

    const raw = (doc.toJSON() ?? {}) as Record<string, unknown>
    const plugins = parsePlugins(raw['plugins'])
    const bucket = plugins[type] ?? []
    plugins[type] = bucket.filter((plugin) => plugin.name !== name)
    doc.set('plugins', plugins)

    await writeFileAtomic(configPath, doc.toString())
  }

  /**
   * Lists plugin declarations from `plugins`, optionally filtered by type.
   *
   * @param configPath - Absolute path to the `specd.yaml` to read
   * @param type - Optional plugin type filter
   * @returns Plugin declarations.
   */
  async listPlugins(
    configPath: string,
    type?: string,
  ): Promise<Array<{ name: string; config?: Record<string, unknown> }>> {
    let content: string
    try {
      content = await fs.readFile(configPath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    let doc: Document
    try {
      doc = parseDocument(content)
    } catch {
      return []
    }

    const raw = (doc.toJSON() ?? {}) as Record<string, unknown>
    const plugins = parsePlugins(raw['plugins'])
    if (type !== undefined) {
      return plugins[type] ?? []
    }
    return Object.values(plugins).flat()
  }
}

// ---- Plugins YAML validation ----

/**
 * Single plugin declaration in `plugins.<type>`.
 */
const pluginSchema = z.object({
  name: z.string(),
  config: z.record(z.unknown()).optional(),
})

/**
 * Validates the `plugins` key from `specd.yaml`.
 */
const pluginsSchema = z.record(z.array(pluginSchema))

/**
 * Normalized plugin entry persisted under `plugins.<type>`.
 */
interface PluginEntry {
  /** Plugin package name. */
  readonly name: string
  /** Optional plugin configuration payload. */
  readonly config?: Record<string, unknown>
}

/**
 * Parses a raw `plugins` value from a YAML document, returning `{}` if invalid.
 *
 * @param raw - The raw value from the YAML document
 * @returns A valid plugins record, or `{}` on validation failure
 */
function parsePlugins(raw: unknown): Record<string, PluginEntry[]> {
  const result = pluginsSchema.safeParse(raw)
  if (!result.success) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(result.data).map(([type, entries]) => [
      type,
      entries.map((entry) =>
        entry.config === undefined
          ? { name: entry.name }
          : { name: entry.name, config: entry.config },
      ),
    ]),
  )
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
 * Appends an entry to `.gitignore` if not already present.
 *
 * @param gitignorePath - Absolute path to the `.gitignore` file
 * @param entry - The line to append
 */
async function appendToGitignore(gitignorePath: string, entry: string): Promise<void> {
  let existing = ''
  try {
    existing = await fs.readFile(gitignorePath, 'utf8')
  } catch (err) {
    if (!isEnoent(err)) throw err
  }

  const lines = existing.split('\n')
  if (!lines.some((line) => line.trim() === entry)) {
    const newContent =
      existing.endsWith('\n') || existing === ''
        ? `${existing}${entry}\n`
        : `${existing}\n${entry}\n`
    await writeFileAtomic(gitignorePath, newContent)
  }
}
