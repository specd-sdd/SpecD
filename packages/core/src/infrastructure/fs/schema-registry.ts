import fs from 'node:fs/promises'
import path from 'node:path'
import { isEnoent } from './is-enoent.js'
import { createRequire } from 'node:module'
import {
  type SchemaRegistry,
  type SchemaEntry,
  type SchemaRawResult,
} from '../../application/ports/schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { parseSchemaYaml } from '../schema-yaml-parser.js'
import { buildSchema } from '../../domain/services/build-schema.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'

/** Construction configuration for {@link FsSchemaRegistry}. */
export interface FsSchemaRegistryConfig {
  /**
   * Ordered list of `node_modules` directories to search when resolving
   * `@scope/name` schema references. Searched in order; first hit wins.
   *
   * Typically includes the project's own `node_modules` as the first entry,
   * followed by the CLI/tool installation's `node_modules` as a fallback so
   * that globally-installed schema packages are found even when the project
   * has no local copy.
   */
  readonly nodeModulesPaths: readonly string[]

  /**
   * The project root directory (i.e. the directory containing `specd.yaml`).
   * Relative schema paths (`./foo`, `../bar`) are resolved against this.
   */
  readonly configDir: string

  /**
   * Map of workspace name to its `SchemaRepository` instance.
   * Used for resolving workspace-qualified and bare-name schema references.
   */
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
}

/**
 * Filesystem implementation of the {@link SchemaRegistry} port.
 *
 * Routes schema references by prefix: npm-scoped references are resolved from
 * `node_modules`, workspace-qualified and bare-name references are delegated to
 * the corresponding {@link SchemaRepository}, and direct paths are loaded from
 * the filesystem.
 */
export class FsSchemaRegistry implements SchemaRegistry {
  private readonly _nodeModulesPaths: readonly string[]
  private readonly _configDir: string
  private readonly _schemaRepositories: ReadonlyMap<string, SchemaRepository>

  /**
   * Creates a new `FsSchemaRegistry`.
   *
   * @param config - Registry configuration including `node_modules` paths and schema repositories
   */
  constructor(config: FsSchemaRegistryConfig) {
    this._nodeModulesPaths = config.nodeModulesPaths
    this._configDir = config.configDir
    this._schemaRepositories = config.schemaRepositories
  }

  /**
   * Resolves a schema reference and returns the fully-parsed {@link Schema}.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   * @returns The resolved schema, or `null` if the file was not found
   */
  async resolve(ref: string): Promise<Schema | null> {
    const raw = await this.resolveRaw(ref)
    if (raw === null) return null
    return buildSchema(ref, raw.data, raw.templates)
  }

  /**
   * Resolves a schema reference and returns the intermediate representation
   * (parsed YAML data, templates, and resolved path) without building the
   * final domain `Schema`.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   * @returns The raw resolution result, or `null` if the file was not found
   */
  async resolveRaw(ref: string): Promise<SchemaRawResult | null> {
    // npm-scoped references
    if (ref.startsWith('@')) {
      return this._resolveNpm(ref)
    }

    // Workspace-qualified references (#workspace:name or #name)
    if (ref.startsWith('#')) {
      const inner = ref.slice(1)
      const { workspace, capPath: name } = parseSpecId(inner)
      const repo = this._schemaRepositories.get(workspace)
      if (repo === undefined) return null
      return repo.resolveRaw(name)
    }

    // Direct path references (absolute or relative)
    if (path.isAbsolute(ref) || ref.startsWith('./') || ref.startsWith('../')) {
      return this._resolvePath(ref)
    }

    // Bare name — delegate to default workspace
    const repo = this._schemaRepositories.get('default')
    if (repo === undefined) return null
    return repo.resolveRaw(ref)
  }

  /**
   * Lists all discoverable schemas from workspace repositories and npm packages.
   *
   * @returns All discoverable schema entries, workspace first then npm
   */
  async list(): Promise<SchemaEntry[]> {
    const entries: SchemaEntry[] = []

    // Workspace entries from repositories
    for (const [, repo] of this._schemaRepositories) {
      const repoEntries = await repo.list()
      entries.push(...repoEntries)
    }

    // npm entries
    const seen = new Set<string>()
    for (const nmPath of this._nodeModulesPaths) {
      const specdScopeDir = path.join(nmPath, '@specd')
      try {
        const items = await fs.readdir(specdScopeDir, { withFileTypes: true })
        for (const item of items) {
          if (!item.isDirectory()) continue
          if (!item.name.startsWith('schema-')) continue
          const npmRef = `@specd/${item.name}`
          if (seen.has(npmRef)) continue
          const schemaFile = path.join(specdScopeDir, item.name, 'schema.yaml')
          try {
            await fs.access(schemaFile)
          } catch {
            continue
          }
          seen.add(npmRef)
          entries.push({ ref: npmRef, name: item.name, source: 'npm' })
        }
      } catch {
        // path not found — try next
      }
    }

    return entries
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves an npm-scoped schema reference.
   *
   * @param ref - An npm-scoped reference (e.g. `"@specd/schema-std"`)
   * @returns The raw resolution result, or `null` if not found
   */
  private async _resolveNpm(ref: string): Promise<SchemaRawResult | null> {
    let resolvedPath: string | null = null
    let content: string | null = null

    for (const nmPath of this._nodeModulesPaths) {
      const candidate = path.join(nmPath, ref, 'schema.yaml')
      const result = await this._tryReadFile(candidate)
      if (result !== null) {
        resolvedPath = candidate
        content = result
        break
      }
    }

    if (content === null) {
      const fallbackPath = this._tryModuleResolve(ref)
      if (fallbackPath !== null) {
        const result = await this._tryReadFile(fallbackPath)
        if (result !== null) {
          resolvedPath = fallbackPath
          content = result
        }
      }
    }

    if (content === null || resolvedPath === null) return null

    const data = parseSchemaYaml(ref, content)
    const schemaDir = path.dirname(resolvedPath)
    const templates = await this._loadTemplates(ref, data.artifacts ?? [], schemaDir)

    return { data, templates, resolvedPath }
  }

  /**
   * Resolves a direct path reference (absolute or relative).
   *
   * @param ref - A direct path reference
   * @returns The raw resolution result, or `null` if not found
   */
  private async _resolvePath(ref: string): Promise<SchemaRawResult | null> {
    const resolvedPath = path.isAbsolute(ref) ? ref : path.resolve(this._configDir, ref)

    let content: string
    try {
      content = await fs.readFile(resolvedPath, 'utf-8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    const data = parseSchemaYaml(ref, content)
    const schemaDir = path.dirname(resolvedPath)
    const templates = await this._loadTemplates(ref, data.artifacts ?? [], schemaDir)

    return { data, templates, resolvedPath }
  }

  /**
   * Reads a file and returns its content, or `null` on `ENOENT`.
   *
   * @param filePath - Absolute path to read
   * @returns File content string, or `null` if the file does not exist
   */
  private async _tryReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }
  }

  /**
   * Attempts to resolve `ref/schema.yaml` via Node.js module resolution,
   * using the location of this file as the starting point.
   *
   * @param ref - An npm-scoped schema reference (e.g. `'@specd/schema-std'`)
   * @returns Absolute path to `schema.yaml`, or `null` if resolution fails
   */
  private _tryModuleResolve(ref: string): string | null {
    try {
      const require = createRequire(import.meta.url)
      return require.resolve(`${ref}/schema.yaml`)
    } catch {
      return null
    }
  }

  /**
   * Loads template file contents for artifacts that declare a `template` path.
   *
   * @param ref - The schema reference for error messages
   * @param artifacts - The raw artifact entries from the parsed YAML
   * @param schemaDir - The directory containing the schema file
   * @returns A map from template relative path to file content
   * @throws {SchemaValidationError} When a template file is missing
   */
  private async _loadTemplates(
    ref: string,
    artifacts: readonly { template?: string | undefined }[],
    schemaDir: string,
  ): Promise<ReadonlyMap<string, string>> {
    const templates = new Map<string, string>()

    for (const [i, artifact] of artifacts.entries()) {
      if (artifact.template === undefined) continue
      if (templates.has(artifact.template)) continue

      const templatePath = path.join(schemaDir, artifact.template)
      try {
        const content = await fs.readFile(templatePath, 'utf-8')
        templates.set(artifact.template, content)
      } catch (err) {
        if (isEnoent(err)) {
          throw new SchemaValidationError(
            ref,
            `artifacts[${i}]: template file '${artifact.template}' not found`,
          )
        }
        throw err
      }
    }

    return templates
  }
}
