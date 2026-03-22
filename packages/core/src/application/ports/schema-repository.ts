import { Repository } from './repository.js'
import { type SchemaRawResult, type SchemaEntry } from './schema-registry.js'
import { type Schema } from '../../domain/value-objects/schema.js'

export type { SchemaRawResult, SchemaEntry }

/**
 * Port for reading and listing schemas within a single workspace.
 *
 * Each instance is bound to one workspace and provides storage access for
 * schemas in that workspace. The {@link SchemaRegistry} delegates workspace
 * schema resolution to instances of this port.
 *
 * Extends {@link Repository} so that workspace identity, ownership, and
 * locality are handled uniformly with other repository ports.
 */
export abstract class SchemaRepository extends Repository {
  /**
   * Resolves a schema by name and returns the fully-built {@link Schema} entity.
   *
   * @param name - The schema name within this workspace (e.g. `"spec-driven"`)
   * @returns The resolved schema, or `null` if it does not exist
   */
  abstract resolve(name: string): Promise<Schema | null>

  /**
   * Resolves a schema by name and returns the intermediate representation
   * (parsed YAML data, templates, and resolved path) without building the
   * final domain {@link Schema}.
   *
   * @param name - The schema name within this workspace
   * @returns The raw resolution result, or `null` if it does not exist
   */
  abstract resolveRaw(name: string): Promise<SchemaRawResult | null>

  /**
   * Lists all schemas discoverable within this workspace.
   *
   * Does not load or validate schema file contents — only discovers
   * available schemas and returns their metadata.
   *
   * @returns All discoverable schema entries in this workspace
   */
  abstract list(): Promise<SchemaEntry[]>
}
