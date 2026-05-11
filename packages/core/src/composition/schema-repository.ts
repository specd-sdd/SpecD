import { type RepositoryConfig } from '../application/ports/repository.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { FsSchemaRepository } from '../infrastructure/fs/schema-repository.js'

/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Repository configuration for schema repositories.
 *
 * Extends {@link RepositoryConfig} to allow providers to add adapter-specific
 * fields without coupling to the base type.
 */
export interface SchemaRepositoryConfig extends RepositoryConfig {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/**
 * Filesystem adapter options for `createSchemaRepository('fs', ...)`.
 */
export interface FsSchemaRepositoryOptions {
  /** Absolute path to the schemas directory for this workspace. */
  readonly schemasPath: string
}

/**
 * Constructs a `SchemaRepository` implementation for the given adapter type.
 *
 * Returns the abstract `SchemaRepository` port type — callers never see the
 * concrete class.
 *
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param config - Repository configuration shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `SchemaRepository` bound to the given workspace
 */
export function createSchemaRepository(
  type: 'fs',
  config: SchemaRepositoryConfig,
  options: FsSchemaRepositoryOptions,
): SchemaRepository {
  switch (type) {
    case 'fs':
      return new FsSchemaRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        configPath: config.configPath,
        schemasPath: options.schemasPath,
      })
  }
}
