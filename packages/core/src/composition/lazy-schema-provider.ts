import { type Schema } from '../domain/value-objects/schema.js'
import { type SchemaProvider } from '../application/ports/schema-provider.js'
import { type ResolveSchema } from '../application/use-cases/resolve-schema.js'

/**
 * Lazy, caching implementation of {@link SchemaProvider}.
 *
 * Resolves the schema on the first call to {@link get} via {@link ResolveSchema},
 * then returns the cached result for all subsequent calls. If resolution fails,
 * caches `null` so the error is not retried.
 */
export class LazySchemaProvider implements SchemaProvider {
  private readonly _resolve: ResolveSchema
  private _cached: Schema | null | undefined = undefined

  /**
   * Creates a new lazy schema provider.
   *
   * @param resolve - The resolve-schema use case that applies plugins and overrides
   */
  constructor(resolve: ResolveSchema) {
    this._resolve = resolve
  }

  /**
   * Returns the fully-resolved schema, resolving lazily on first call.
   *
   * @returns The resolved schema, or `null` when resolution fails
   */
  async get(): Promise<Schema | null> {
    if (this._cached !== undefined) return this._cached
    try {
      this._cached = await this._resolve.execute()
      return this._cached
    } catch {
      this._cached = null
      return null
    }
  }
}
