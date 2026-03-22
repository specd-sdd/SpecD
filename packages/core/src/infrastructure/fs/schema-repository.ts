import fs from 'node:fs/promises'
import path from 'node:path'
import { isEnoent } from './is-enoent.js'
import { SchemaRepository } from '../../application/ports/schema-repository.js'
import { type RepositoryConfig } from '../../application/ports/repository.js'
import { type SchemaRawResult, type SchemaEntry } from '../../application/ports/schema-registry.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'
import { parseSchemaYaml } from '../schema-yaml-parser.js'
import { buildSchema } from '../../domain/services/build-schema.js'

/**
 * Construction configuration for {@link FsSchemaRepository}.
 */
export interface FsSchemaRepositoryConfig extends RepositoryConfig {
  /** Absolute path to the workspace's schemas directory. */
  readonly schemasPath: string
}

/**
 * Filesystem implementation of the {@link SchemaRepository} port.
 *
 * Reads and lists schemas from a single workspace's `schemasPath` directory.
 * Each schema lives in a subdirectory named after the schema, containing a
 * `schema.yaml` file and optional template files.
 */
export class FsSchemaRepository extends SchemaRepository {
  private readonly _schemasPath: string

  /**
   * Creates a new `FsSchemaRepository`.
   *
   * @param config - Repository configuration including the workspace's schemas path
   */
  constructor(config: FsSchemaRepositoryConfig) {
    super(config)
    this._schemasPath = config.schemasPath
  }

  /**
   * Resolves a schema by name and returns the fully-built {@link Schema} entity.
   *
   * @param name - The schema name within this workspace (e.g. `"spec-driven"`)
   * @returns The resolved schema, or `null` if it does not exist
   */
  async resolve(name: string): Promise<Schema | null> {
    const raw = await this.resolveRaw(name)
    if (raw === null) return null
    const ref = this._buildRef(name)
    return buildSchema(ref, raw.data, raw.templates)
  }

  /**
   * Resolves a schema by name and returns the intermediate representation
   * (parsed YAML data, templates, and resolved path) without building the
   * final domain {@link Schema}.
   *
   * @param name - The schema name within this workspace
   * @returns The raw resolution result, or `null` if it does not exist
   */
  async resolveRaw(name: string): Promise<SchemaRawResult | null> {
    const resolvedPath = path.join(this._schemasPath, name, 'schema.yaml')
    const ref = this._buildRef(name)

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
   * Lists all schemas discoverable within this workspace's schemas directory.
   *
   * @returns All discoverable schema entries in this workspace
   */
  async list(): Promise<SchemaEntry[]> {
    const entries: SchemaEntry[] = []
    const workspace = this.workspace()

    let subdirs: string[]
    try {
      const items = await fs.readdir(this._schemasPath, { withFileTypes: true })
      subdirs = items.filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      return entries
    }

    for (const name of subdirs) {
      const schemaFile = path.join(this._schemasPath, name, 'schema.yaml')
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

    return entries
  }

  /**
   * Builds a schema reference string for this workspace and schema name.
   *
   * @param name - The schema name
   * @returns The full reference string (e.g. `"#default:spec-driven"`)
   */
  private _buildRef(name: string): string {
    const workspace = this.workspace()
    return workspace === 'default' ? `#${name}` : `#${workspace}:${name}`
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
