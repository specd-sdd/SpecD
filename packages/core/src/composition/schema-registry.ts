import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { FsSchemaRegistry } from '../infrastructure/fs/schema-registry.js'

/**
 * Filesystem adapter options for `createSchemaRegistry('fs', ...)`.
 */
export interface FsSchemaRegistryOptions {
  /** Absolute path to the `node_modules` directory for npm package resolution. */
  readonly nodeModulesPath: string
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
      return new FsSchemaRegistry({ nodeModulesPath: options.nodeModulesPath })
  }
}
