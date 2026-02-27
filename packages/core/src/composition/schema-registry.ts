import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { FsSchemaRegistry } from '../infrastructure/fs/schema-registry.js'

/**
 * Discriminated union of all supported `SchemaRegistry` adapter configurations.
 */
export type CreateSchemaRegistryConfig = {
  /** Adapter type discriminant. */
  readonly type: 'fs'
  /** Absolute path to the `node_modules` directory for npm package resolution. */
  readonly nodeModulesPath: string
}

/**
 * Constructs a `SchemaRegistry` implementation for the given adapter type.
 *
 * Returns the abstract `SchemaRegistry` port type — callers never see the
 * concrete class.
 *
 * @param config - Discriminated union config identifying the adapter type and its options
 * @returns A fully constructed `SchemaRegistry`
 */
export function createSchemaRegistry(config: CreateSchemaRegistryConfig): SchemaRegistry {
  switch (config.type) {
    case 'fs':
      return new FsSchemaRegistry({ nodeModulesPath: config.nodeModulesPath })
  }
}
