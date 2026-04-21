import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { FsSchemaRepository } from '../infrastructure/fs/schema-repository.js'

/**
 * Domain context shared by all `SchemaRepository` adapter types.
 *
 * These fields belong to the port contract and are independent of the
 * underlying storage technology.
 */
export interface SchemaRepositoryContext {
  /** The workspace name from `specd.yaml` (e.g. `"default"`, `"billing"`). */
  readonly workspace: string
  /** Ownership level of this repository instance. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether this repository points to data outside the current git root. */
  readonly isExternal: boolean
  /** Absolute path to the config directory. */
  readonly configPath: string
}

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
 * @param context - Domain context shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `SchemaRepository` bound to the given workspace
 */
export function createSchemaRepository(
  type: 'fs',
  context: SchemaRepositoryContext,
  options: FsSchemaRepositoryOptions,
): SchemaRepository {
  switch (type) {
    case 'fs':
      return new FsSchemaRepository({
        workspace: context.workspace,
        ownership: context.ownership,
        isExternal: context.isExternal,
        configPath: context.configPath,
        schemasPath: options.schemasPath,
      })
  }
}
