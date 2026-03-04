import { type Schema } from '../../domain/value-objects/schema.js'
import { type SchemaRegistry } from '../ports/schema-registry.js'
import { SchemaNotFoundError } from '../errors/schema-not-found-error.js'
import { type WorkspaceContext } from '../ports/workspace-context.js'

/** Input for the {@link GetActiveSchema} use case. */
export type GetActiveSchemaInput = WorkspaceContext

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
