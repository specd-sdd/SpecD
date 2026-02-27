import { type SpecRepository } from '../application/ports/spec-repository.js'
import { FsSpecRepository } from '../infrastructure/fs/spec-repository.js'

/**
 * Discriminated union of all supported `SpecRepository` adapter configurations.
 *
 * Each member carries a `type` discriminant and the fields required by that
 * adapter. New adapter types (e.g. `'db'`) are added here as additional union
 * members without breaking existing callers.
 */
export type CreateSpecRepositoryConfig = {
  /** Adapter type discriminant. */
  readonly type: 'fs'
  /** The workspace name from `specd.yaml` (e.g. `"default"`, `"billing"`). */
  readonly workspace: string
  /** Ownership level of this repository instance. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether this repository points to data outside the current git root. */
  readonly isExternal: boolean
  /** Absolute path to the specs root directory for this workspace. */
  readonly specsPath: string
}

/**
 * Constructs a `SpecRepository` implementation for the given adapter type.
 *
 * Returns the abstract `SpecRepository` port type — callers never see the
 * concrete class. New adapter types are added to `CreateSpecRepositoryConfig`
 * without changing this function's signature.
 *
 * @param config - Discriminated union config identifying the adapter type and its options
 * @returns A fully constructed `SpecRepository` bound to the given workspace
 */
export function createSpecRepository(config: CreateSpecRepositoryConfig): SpecRepository {
  switch (config.type) {
    case 'fs':
      return new FsSpecRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        specsPath: config.specsPath,
      })
  }
}
