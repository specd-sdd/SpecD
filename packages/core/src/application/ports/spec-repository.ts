import { type Spec } from '../../domain/entities/spec.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { Repository, type RepositoryConfig } from './repository.js'

export { type RepositoryConfig as SpecRepositoryConfig }

/**
 * Port for reading and writing specs within a single scope.
 *
 * Extends {@link Repository} — `scope()`, `ownership()`, and `isExternal()` are
 * set at construction time and cannot change. Use cases that need multiple scopes
 * receive a separate instance per scope.
 *
 * `list` and `get` return lightweight {@link Spec} metadata — no artifact content
 * is loaded. Content is fetched explicitly via `artifact()`. Write operations
 * receive a `Spec` so implementations never deal with raw paths.
 */
export abstract class SpecRepository extends Repository {
  /**
   * @param config - Scope, ownership, and locality configuration
   */
  constructor(config: RepositoryConfig) {
    super(config)
  }

  /**
   * Returns the spec metadata for the given name, or `null` if not found.
   *
   * @param name - The spec identity path within this scope (e.g. `auth/oauth`)
   * @returns The spec metadata, or `null` if no such spec exists
   */
  abstract get(name: SpecPath): Promise<Spec | null>

  /**
   * Lists all spec metadata in this scope, optionally filtered by a path prefix.
   *
   * Returns lightweight {@link Spec} objects — no artifact content is loaded.
   *
   * @param prefix - Optional path prefix to filter results (e.g. `auth` returns all `auth/*`)
   * @returns All matching specs, in repository order
   */
  abstract list(prefix?: SpecPath): Promise<Spec[]>

  /**
   * Loads the content of a single artifact file within a spec.
   *
   * @param spec - The spec containing the artifact
   * @param filename - The artifact filename to load (e.g. `"spec.md"`)
   * @returns The artifact with its content, or `null` if the file does not exist
   */
  abstract artifact(spec: Spec, filename: string): Promise<SpecArtifact | null>

  /**
   * Persists a single artifact file within a spec.
   *
   * Creates the spec directory if it does not exist.
   *
   * If `artifact.originalHash` is set and does not match the current file on
   * disk, the save is rejected with `ArtifactConflictError` to prevent
   * silently overwriting concurrent changes. Pass `{ force: true }` to
   * overwrite regardless.
   *
   * @param spec - The spec to write the artifact into
   * @param artifact - The artifact to save (filename + content)
   * @param options - Save options
   * @param options.force - When `true`, skip conflict detection and overwrite unconditionally
   * @throws {ArtifactConflictError} When a concurrent modification is detected and `force` is not set
   */
  abstract save(spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }): Promise<void>

  /**
   * Deletes the entire spec directory and all its artifact files.
   *
   * @param spec - The spec to delete
   */
  abstract delete(spec: Spec): Promise<void>
}
