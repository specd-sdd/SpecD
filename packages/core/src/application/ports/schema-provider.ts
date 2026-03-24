import { type Schema } from '../../domain/value-objects/schema.js'

/**
 * Provides the fully-resolved schema for the current project configuration.
 *
 * Implementations may resolve lazily and cache the result. The returned schema
 * includes extends chains, plugins, and `schemaOverrides` — callers never need
 * to access `SchemaRegistry` directly.
 */
export interface SchemaProvider {
  /**
   * Returns the fully-resolved schema for the current project configuration.
   *
   * @returns The resolved schema
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   * @throws {SchemaValidationError} If the resolved schema is invalid
   */
  get(): Promise<Schema>
}
