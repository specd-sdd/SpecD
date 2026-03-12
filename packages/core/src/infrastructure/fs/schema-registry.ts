import fs from 'node:fs/promises'
import path from 'node:path'
import { isEnoent } from './is-enoent.js'
import { createRequire } from 'node:module'
import {
  type SchemaRegistry,
  type SchemaEntry,
  type SchemaRawResult,
} from '../../application/ports/schema-registry.js'
import { Schema } from '../../domain/value-objects/schema.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { parseSchemaYaml } from '../schema-yaml-parser.js'
import { buildSchema } from '../../domain/services/build-schema.js'

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
}

/**
 * Filesystem implementation of the {@link SchemaRegistry} port.
 *
 * Resolves schema references from workspace directories and npm packages,
 * delegates YAML parsing to {@link parseSchemaYaml} and domain construction
 * to {@link buildSchema}, and handles template file I/O.
 */
export class FsSchemaRegistry implements SchemaRegistry {
  private readonly _nodeModulesPaths: readonly string[]
  private readonly _configDir: string

  /**
   * Creates a new `FsSchemaRegistry`.
   *
   * @param config - Registry configuration including the `node_modules` paths
   */
  constructor(config: FsSchemaRegistryConfig) {
    this._nodeModulesPaths = config.nodeModulesPaths
    this._configDir = config.configDir
  }

  /**
   * Resolves a schema reference and returns the fully-parsed {@link Schema}.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns The resolved schema, or `null` if the file was not found
   */
  async resolve(
    ref: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ): Promise<Schema | null> {
    const raw = await this.resolveRaw(ref, workspaceSchemasPaths)
    if (raw === null) return null
    return buildSchema(ref, raw.data, raw.templates)
  }

  /**
   * Resolves a schema reference and returns the intermediate representation
   * (parsed YAML data, templates, and resolved path) without building the
   * final domain `Schema`.
   *
   * @param ref - The schema reference as declared in `specd.yaml`
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns The raw resolution result, or `null` if the file was not found
   */
  async resolveRaw(
    ref: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ): Promise<SchemaRawResult | null> {
    let resolvedPath: string | null = null
    let content: string | null = null

    if (ref.startsWith('@')) {
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
    } else {
      resolvedPath = this._resolveFilePath(ref, workspaceSchemasPaths)
      try {
        content = await fs.readFile(resolvedPath, 'utf-8')
      } catch (err) {
        if (isEnoent(err)) return null
        throw err
      }
    }

    const data = parseSchemaYaml(ref, content)
    const schemaDir = path.dirname(resolvedPath)
    const templates = await this._loadTemplates(ref, data.artifacts ?? [], schemaDir)

    return { data, templates, resolvedPath }
  }

  /**
   * Lists all discoverable schemas from workspace paths and npm packages.
   *
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns All discoverable schema entries, workspace first then npm
   */
  async list(workspaceSchemasPaths: ReadonlyMap<string, string>): Promise<SchemaEntry[]> {
    const entries: SchemaEntry[] = []

    for (const [workspace, schemasPath] of workspaceSchemasPaths) {
      let subdirs: string[]
      try {
        const items = await fs.readdir(schemasPath, { withFileTypes: true })
        subdirs = items.filter((d) => d.isDirectory()).map((d) => d.name)
      } catch {
        continue
      }
      for (const name of subdirs) {
        const schemaFile = path.join(schemasPath, name, 'schema.yaml')
        try {
          await fs.access(schemaFile)
        } catch {
          continue
        }
        entries.push({
          ref: workspace === 'default' ? `#${name}` : `#${workspace}:${name}`,
          name,
          source: 'workspace',
          workspace,
        })
      }
    }

    const seen = new Set<string>()
    for (const nmPath of this._nodeModulesPaths) {
      const specdScopeDir = path.join(nmPath, '@specd')
      try {
        const items = await fs.readdir(specdScopeDir, { withFileTypes: true })
        for (const item of items) {
          if (!item.isDirectory()) continue
          if (!item.name.startsWith('schema-')) continue
          const ref = `@specd/${item.name}`
          if (seen.has(ref)) continue
          const schemaFile = path.join(specdScopeDir, item.name, 'schema.yaml')
          try {
            await fs.access(schemaFile)
          } catch {
            continue
          }
          seen.add(ref)
          entries.push({ ref, name: item.name, source: 'npm' })
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
   * Resolves a schema `ref` string to an absolute path to the `schema.yaml` file.
   *
   * @param ref - The schema reference string
   * @param workspaceSchemasPaths - Map of workspace name to its resolved `schemasPath`
   * @returns Absolute path to the schema YAML file
   * @throws {SchemaValidationError} When a `#workspace:name` ref references an unknown workspace
   */
  private _resolveFilePath(
    ref: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ): string {
    if (ref.startsWith('#')) {
      const inner = ref.slice(1)
      const { workspace, capPath: name } = parseSpecId(inner)
      const schemasPath = workspaceSchemasPaths.get(workspace)
      if (schemasPath === undefined) {
        throw new SchemaValidationError(ref, `workspace '${workspace}' not found in schema paths`)
      }
      return path.join(schemasPath, name, 'schema.yaml')
    }

    if (path.isAbsolute(ref)) {
      return ref
    }

    if (ref.startsWith('./') || ref.startsWith('../')) {
      return path.resolve(this._configDir, ref)
    }

    const schemasPath = workspaceSchemasPaths.get('default') ?? ''
    return path.join(schemasPath, ref, 'schema.yaml')
  }

  /**
   * Loads template file contents for artifacts that declare a `template` path.
   *
   * @param ref - The schema reference for error messages
   * @param artifacts - The raw artifact entries from the parsed YAML
   * @param schemaDir - The directory containing the schema file
   * @returns A map from template relative path to file content
   * @throws {@link SchemaValidationError} When a template file is missing
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
