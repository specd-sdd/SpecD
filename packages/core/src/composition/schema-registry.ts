import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { FsSchemaRegistry } from '../infrastructure/fs/schema-registry.js'

/**
 * Filesystem adapter options for `createSchemaRegistry('fs', ...)`.
 */
export interface FsSchemaRegistryOptions {
  /**
   * Ordered list of `node_modules` directories to search for npm schema
   * packages. Searched in order; first hit wins. Typically the project's
   * `node_modules` is first, followed by the CLI installation's `node_modules`
   * as a fallback.
   */
  readonly nodeModulesPaths: readonly string[]
}

/**
 * Constructs a `SchemaRegistry` implementation for the given adapter type.
 *
 * Returns the abstract `SchemaRegistry` port type — callers never see the
 * concrete class.
 *
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param options - Filesystem schema registry options
 * @returns A fully constructed `SchemaRegistry`
 */
export function createSchemaRegistry(type: 'fs', options: FsSchemaRegistryOptions): SchemaRegistry {
  switch (type) {
    case 'fs':
      return new FsSchemaRegistry({ nodeModulesPaths: options.nodeModulesPaths })
  }
}
