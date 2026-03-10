import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'

/**
 * Resolves and returns the active schema for the project.
 *
 * Throws {@link SchemaNotFoundError} if the schema reference cannot be resolved.
 */
export class GetActiveSchema {
  private readonly _schemas: SchemaRegistry
  private readonly _schemaRef: string
  private readonly _workspaceSchemasPaths: ReadonlyMap<string, string>

  /**
   * Creates a new `GetActiveSchema` use case instance.
   *
   * @param schemas - Registry for resolving schema references
   * @param schemaRef - Schema reference string (e.g. `"@specd/schema-std"`)
   * @param workspaceSchemasPaths - Map of workspace name to absolute schemas directory path
   */
  constructor(
    schemas: SchemaRegistry,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  ) {
    this._schemas = schemas
    this._schemaRef = schemaRef
    this._workspaceSchemasPaths = workspaceSchemasPaths
  }

  /**
   * Executes the use case.
   *
   * @returns The resolved schema
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   */
  async execute(): Promise<Schema> {
    const schema = await this._schemas.resolve(this._schemaRef, this._workspaceSchemasPaths)
    if (schema === null) {
      throw new SchemaNotFoundError(this._schemaRef)
    }
    return schema
  }
}
