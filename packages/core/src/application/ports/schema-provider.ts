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
   * Returns the fully-resolved schema, or `null` if the schema reference
   * cannot be resolved.
   *
   * @returns The resolved schema, or `null` when resolution fails
   */
  get(): Promise<Schema | null>
}
