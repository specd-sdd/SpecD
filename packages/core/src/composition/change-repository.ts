import { type RepositoryConfig } from '../application/ports/repository.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ArtifactType } from '../domain/value-objects/artifact-type.js'
import { FsChangeRepository } from '../infrastructure/fs/change-repository.js'

/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Repository configuration for change repositories.
 *
 * Extends {@link RepositoryConfig} to allow providers to add adapter-specific
 * fields without coupling to the base type.
 */
export interface ChangeRepositoryConfig extends RepositoryConfig {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/**
 * Filesystem adapter options for `createChangeRepository('fs', ...)`.
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
  /**
   * Resolved artifact types from the active schema. Passed to the repository
   * to enable artifact sync on every get/save.
   */
  readonly artifactTypes?: readonly ArtifactType[]
  /**
   * Async resolver for artifact types. Used when artifact types aren't known
   * at construction time (e.g. kernel-level repo created before schema is resolved).
   */
  readonly resolveArtifactTypes?: () => Promise<readonly ArtifactType[]>
  /**
   * Async resolver to determine whether a spec already exists.
   *
   * Used by fs-backed manifests to resolve expected filenames for
   * delta-capable spec artifacts.
   */
  readonly resolveSpecExists?: (specId: string) => Promise<boolean>
}

/**
 * Constructs a `ChangeRepository` implementation for the given adapter type.
 *
 * Returns the abstract `ChangeRepository` port type — callers never see the
 * concrete class.
 *
 * @param type - Adapter type discriminant; determines which implementation is used
 * @param config - Repository configuration shared across all adapter types
 * @param options - Filesystem adapter options
 * @returns A fully constructed `ChangeRepository` bound to the given workspace
 *
 * `FsChangeRepository` derives any internal lock paths for `mutate()` from the
 * storage paths it already receives here, so this factory signature does not
 * widen when serialized mutation support is added.
 */
export function createChangeRepository(
  type: 'fs',
  config: ChangeRepositoryConfig,
  options: FsChangeRepositoryOptions,
): ChangeRepository {
  switch (type) {
    case 'fs':
      return new FsChangeRepository({
        workspace: config.workspace,
        ownership: config.ownership,
        isExternal: config.isExternal,
        configPath: config.configPath,
        changesPath: options.changesPath,
        draftsPath: options.draftsPath,
        discardedPath: options.discardedPath,
        ...(options.activeSchema !== undefined ? { activeSchema: options.activeSchema } : {}),
        ...(options.artifactTypes !== undefined ? { artifactTypes: options.artifactTypes } : {}),
        ...(options.resolveArtifactTypes !== undefined
          ? { resolveArtifactTypes: options.resolveArtifactTypes }
          : {}),
        ...(options.resolveSpecExists !== undefined
          ? { resolveSpecExists: options.resolveSpecExists }
          : {}),
      })
  }
}
