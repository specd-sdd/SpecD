import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'

/** Input for the {@link GetActiveSchema} use case. */
export interface GetActiveSchemaInput {
  /** The schema reference string from `specd.yaml` (e.g. `'@specd/schema-std'`). */
  schemaRef: string
  /** Map of workspace name → absolute `schemasPath` for that workspace. */
  workspaceSchemasPaths: ReadonlyMap<string, string>
}

/**
 * Resolves and returns the active schema for the project.
 *
 * Throws {@link SchemaNotFoundError} if the schema reference cannot be resolved.
 */
export class GetActiveSchema {
  private readonly _schemas: SchemaRegistry

  /**
   * Creates a new `GetActiveSchema` use case instance.
   *
   * @param schemas - Registry for resolving schema references
   */
  constructor(schemas: SchemaRegistry) {
    this._schemas = schemas
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The resolved schema
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(input: GetActiveSchemaInput): Promise<Schema> {
    const schema = await this._schemas.resolve(input.schemaRef, input.workspaceSchemasPaths)
    if (schema === null) {
      throw new SchemaNotFoundError(input.schemaRef)
    }
    return schema
  }
}
