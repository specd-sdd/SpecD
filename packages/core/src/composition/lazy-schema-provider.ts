import { type Schema } from '../domain/value-objects/schema.js'
import { type SchemaProvider } from '../application/ports/schema-provider.js'
import { SchemaNotFoundError } from '../application/errors/schema-not-found-error.js'
import { type ResolveSchema } from '../application/use-cases/resolve-schema.js'

/**
 * Lazy, caching implementation of {@link SchemaProvider}.
 *
 * Resolves the schema on the first call to {@link get} via {@link ResolveSchema},
 * then returns the cached result for all subsequent calls.
 */
export class LazySchemaProvider implements SchemaProvider {
  private readonly _resolve: ResolveSchema
  private readonly _cache: Map<string, Schema> = new Map()

  /**
   * Creates a new lazy schema provider.
   *
   * @param resolve - The resolve-schema use case that applies plugins and overrides
   */
  constructor(resolve: ResolveSchema) {
    this._resolve = resolve
  }

  /**
   * Returns the fully-resolved schema, resolving lazily on first call per reference.
   *
   * @param ref - Optional schema reference string
   * @returns The resolved schema
   * @throws {SchemaNotFoundError} If the schema reference cannot be resolved
   * @throws {SchemaValidationError} If the resolved schema is invalid
   */
  async get(ref?: string): Promise<Schema> {
    if (ref === undefined) {
      return this._getDefault()
    }

    // A named lookup never resolves the workspace default first: a broken default
    // must not block a change that records its own schema.
    const cached = this._cache.get(ref)
    if (cached !== undefined) {
      return cached
    }

    const resolved = await this._resolveNamed(ref)
    this._cache.set(ref, resolved)
    this._cache.set(resolved.name(), resolved)
    if (ref === this._resolve.schemaRef) {
      this._cache.set('__default__', resolved)
    }
    return resolved
  }

  /**
   * Resolves a named reference directly. A bare schema name that is not itself a
   * resolvable reference falls back to the default only when the default carries
   * that name, so a broken default never masks a resolvable named schema.
   *
   * @param ref - Schema reference or recorded schema name
   * @returns The resolved schema
   * @throws {SchemaNotFoundError} If neither the reference nor the default matches
   */
  private async _resolveNamed(ref: string): Promise<Schema> {
    try {
      return await this._resolve.execute(ref)
    } catch (error) {
      if (!(error instanceof SchemaNotFoundError)) throw error
      let defaultSchema: Schema
      try {
        defaultSchema = await this._getDefault()
      } catch {
        throw error
      }
      if (defaultSchema.name() === ref) return defaultSchema
      throw error
    }
  }

  /**
   * Resolves and caches the workspace default schema.
   *
   * @returns The default schema
   */
  private async _getDefault(): Promise<Schema> {
    let defaultSchema = this._cache.get('__default__')
    if (defaultSchema === undefined) {
      defaultSchema = await this._resolve.execute()
      this._cache.set('__default__', defaultSchema)
      this._cache.set(defaultSchema.name(), defaultSchema)
      if (this._resolve.schemaRef) {
        this._cache.set(this._resolve.schemaRef, defaultSchema)
      }
    }
    return defaultSchema
  }
}
