import { type SpecRepository } from '../application/ports/spec-repository.js'
import { FsSpecRepository } from '../infrastructure/fs/spec-repository.js'

/**
 * Domain context shared by all `SpecRepository` adapter types.
 *
 * These fields belong to the port contract and are independent of the
 * underlying storage technology.
 */
export interface SpecRepositoryContext {
  /** The workspace name from `specd.yaml` (e.g. `"default"`, `"billing"`). */
  readonly workspace: string
  /** Ownership level of this repository instance. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether this repository points to data outside the current git root. */
  readonly isExternal: boolean
}

/**
 * Filesystem adapter options for `createSpecRepository('fs', ...)`.
 */
export interface FsSpecRepositoryOptions {
  /** Absolute path to the specs root directory for this workspace. */
  readonly specsPath: string
}

/**
 * Constructs a `SpecRepository` implementation for the given adapter type.
 *
 * Returns the abstract `SpecRepository` port type — callers never see the
 * concrete class.
 *
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param context - Domain context shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `SpecRepository` bound to the given workspace
 */
export function createSpecRepository(
  type: 'fs',
  context: SpecRepositoryContext,
  options: FsSpecRepositoryOptions,
): SpecRepository {
  switch (type) {
    case 'fs':
      return new FsSpecRepository({
        workspace: context.workspace,
        ownership: context.ownership,
        isExternal: context.isExternal,
        specsPath: options.specsPath,
      })
  }
}
