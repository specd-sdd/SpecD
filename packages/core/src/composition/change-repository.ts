import { type ChangeRepository } from '../application/ports/change-repository.js'
import { FsChangeRepository } from '../infrastructure/fs/change-repository.js'

/**
 * Domain context shared by all `ChangeRepository` adapter types.
 *
 * These fields belong to the port contract and are independent of the
 * underlying storage technology.
 */
export interface ChangeRepositoryContext {
  /** The workspace name from `specd.yaml` (e.g. `"default"`, `"billing"`). */
  readonly workspace: string
  /** Ownership level of this repository instance. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether this repository points to data outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter options for `createChangeRepository('fs', ...)`..
 */
export interface FsChangeRepositoryOptions {
  /** Absolute path to the `changes/` directory for active changes. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory for shelved changes. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory for abandoned changes. */
  readonly discardedPath: string
  /**
   * Active schema name and version — emits a warning when a loaded manifest
   * records a different schema. Advisory only.
   */
  readonly activeSchema?: { name: string; version: number }
}

/**
 * Constructs a `ChangeRepository` implementation for the given adapter type.
 *
 * Returns the abstract `ChangeRepository` port type — callers never see the
 * concrete class.
 *
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param context - Domain context shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `ChangeRepository` bound to the given workspace
 */
export function createChangeRepository(
  type: 'fs',
  context: ChangeRepositoryContext,
  options: FsChangeRepositoryOptions,
): ChangeRepository {
  switch (type) {
    case 'fs':
      return new FsChangeRepository({
        workspace: context.workspace,
        ownership: context.ownership,
        isExternal: context.isExternal,
        changesPath: options.changesPath,
        draftsPath: options.draftsPath,
        discardedPath: options.discardedPath,
        ...(options.activeSchema !== undefined ? { activeSchema: options.activeSchema } : {}),
      })
  }
}
