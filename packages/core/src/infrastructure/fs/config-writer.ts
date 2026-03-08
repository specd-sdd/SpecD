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
   * Records that skill names were installed for a given agent.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param agent - The agent name (e.g. `'claude'`)
   * @param skillNames - The skill names to record (deduplicated)
   */
  async recordSkillInstall(
    configPath: string,
    agent: string,
    skillNames: readonly string[],
  ): Promise<void> {
    const content = await fs.readFile(configPath, 'utf8')
    let doc: Document
    try {
      doc = parseDocument(content)
    } catch (err) {
      throw new ConfigValidationError(configPath, `invalid YAML: ${(err as Error).message}`)
    }

    const raw = (doc.toJSON() ?? {}) as Record<string, unknown>
    const skills = parseSkills(raw['skills'])
    const existing = skills[agent] ?? []
    const merged = [...new Set([...existing, ...skillNames])]
    skills[agent] = merged
    doc.set('skills', skills)

    await writeFileAtomic(configPath, doc.toString())
  }

  /**
   * Reads the `skills` key from `specd.yaml`.
   *
   * @param configPath - Absolute path to the `specd.yaml` to read
   * @returns A map of agent name → list of installed skill names
   */
  async readSkillsManifest(configPath: string): Promise<Record<string, string[]>> {
    let content: string
    try {
      content = await fs.readFile(configPath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return {}
      throw err
    }

    let doc: Document
    try {
      doc = parseDocument(content)
    } catch {
      return {}
    }
    const raw = (doc.toJSON() ?? {}) as Record<string, unknown>
    return parseSkills(raw['skills'])
  }
}

// ---- Skills YAML validation ----

/** Validates the `skills` key from `specd.yaml` — a record of agent → skill name list. */
const skillsSchema = z.record(z.array(z.string()))

/**
 * Parses a raw `skills` value from a YAML document, returning `{}` if invalid.
 *
 * @param raw - The raw value from the YAML document
 * @returns A valid skills record, or `{}` on validation failure
 */
function parseSkills(raw: unknown): Record<string, string[]> {
  const result = skillsSchema.safeParse(raw)
  return result.success ? result.data : {}
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
