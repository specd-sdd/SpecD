import { type Schema } from '../../domain/value-objects/schema.js'
import { type ResolveSchema } from './resolve-schema.js'

/**
 * Resolves and returns the active schema for the project.
 *
 * Thin delegation to {@link ResolveSchema} — contains no business logic.
 */
export class GetActiveSchema {
  private readonly _resolveSchema: ResolveSchema

  /**
   * Creates a new `GetActiveSchema` use case instance.
   *
   * @param resolveSchema - The use case that orchestrates the full schema resolution pipeline
   */
  constructor(resolveSchema: ResolveSchema) {
    this._resolveSchema = resolveSchema
  }

  /**
   * Executes the use case.
   *
   * @returns The resolved schema
   */
  async execute(): Promise<Schema> {
    return this._resolveSchema.execute()
  }
}
