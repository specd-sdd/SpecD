import { type Spec } from '../../domain/entities/spec.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { type SpecMetadata } from '../../domain/services/parse-metadata.js'
import { type SpecLockData } from '../../domain/services/parse-spec-lock.js'
import { Repository, type RepositoryConfig } from './repository.js'

export { type RepositoryConfig as SpecRepositoryConfig }

/** A single match location within a spec artifact. */
export interface SpecSearchMatch {
  readonly filename: string
  readonly line: number
  readonly snippet: string
}

/** A search hit from a repository: spec + relevance score + match locations. */
export interface SpecSearchResult {
  readonly spec: Spec
  readonly score: number
  readonly matches: readonly SpecSearchMatch[]
}

/** Input bundle for atomic publication of one spec's canonical artifacts. */
export interface SpecPublication {
  /** Final artifact files that should become canonical for the spec. */
  readonly artifacts: readonly SpecArtifact[]
  /** Optional final `spec-lock.json` content staged with the canonical spec publication. */
  readonly specLock?: SpecLockData
}

/**
 * Port for reading and writing specs within a single workspace.
 *
 * Extends {@link Repository} — `workspace()`, `ownership()`, and `isExternal()` are
 * set at construction time and cannot change. Use cases that need multiple workspaces
 * receive a separate instance per workspace.
 *
 * `list` and `get` return lightweight {@link Spec} metadata — no artifact content
 * is loaded. Content is fetched explicitly via `artifact()`. Write operations
 * receive a `Spec` so implementations never deal with raw paths.
 *
 * `search` performs content-based search across all spec artifacts in this workspace,
 * returning results ranked by relevance score.
 */
export abstract class SpecRepository extends Repository {
  /**
   * Creates a new `SpecRepository` instance.
   *
   * @param config - Workspace, ownership, and locality configuration
   */
  constructor(config: RepositoryConfig) {
    super(config)
  }

  /**
   * Returns the spec metadata for the given name, or `null` if not found.
   *
   * @param name - The spec identity path within this workspace (e.g. `auth/oauth`)
   * @returns The spec metadata, or `null` if no such spec exists
   */
  abstract get(name: SpecPath): Promise<Spec | null>

  /**
   * Lists all spec metadata in this workspace, optionally filtered by a path prefix.
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
   * Publishes the canonical artifact set for one spec as a single storage commit.
   *
   * Implementations SHOULD guarantee that a failed publication does not leave
   * partially-updated canonical artifact files visible for that spec.
   *
   * @param spec - The spec whose canonical artifacts are being published
   * @param publication - Final artifact bundle to publish
   * @returns When publication completes successfully
   * @throws {ReadOnlyWorkspaceError} When the workspace is read-only
   * @throws {SpecPublicationError} When publication fails after staging output
   */
  abstract publish(spec: Spec, publication: SpecPublication): Promise<void>

  /**
   * Deletes the entire spec directory and all its artifact files.
   *
   * @param spec - The spec to delete
   */
  abstract delete(spec: Spec): Promise<void>

  /**
   * Returns the parsed metadata for the given spec, or `null` if no metadata
   * file exists.
   *
   * The returned object includes an `originalHash` field (SHA-256 of the raw
   * file content) for use in conflict detection when saving.
   *
   * @param spec - The spec whose metadata to load
   * @returns Parsed metadata with `originalHash`, or `null` if absent
   */
  abstract metadata(spec: Spec): Promise<SpecMetadata | null>

  /**
   * Persists raw JSON metadata content for a spec.
   *
   * Creates the metadata directory if it does not exist. When `originalHash`
   * is provided and `force` is not `true`, the current file on disk is hashed
   * and compared — a mismatch causes `ArtifactConflictError`.
   *
   * @param spec - The spec to write metadata for
   * @param content - Raw JSON string to persist
   * @param options - Save options
   * @param options.force - Skip conflict detection when `true`
   * @param options.originalHash - Expected hash of the current file on disk
   * @throws {ArtifactConflictError} On hash mismatch when `force` is not set
   */
  abstract saveMetadata(
    spec: Spec,
    content: string,
    options?: { force?: boolean; originalHash?: string },
  ): Promise<void>

  /**
   * Returns the parsed spec lock sidecar for the given spec, or `null` if no sidecar exists.
   *
   * The returned object includes an `originalHash` field (SHA-256 of the raw
   * file content) for use in conflict detection when saving.
   *
   * @param spec - The spec whose sidecar to load
   * @returns Parsed sidecar with `originalHash`, or `null` if absent
   */
  abstract readSpecLock(spec: Spec): Promise<SpecLockData | null>

  /**
   * Persists `spec-lock.json` content for a spec.
   *
   * When `content.originalHash` is provided and `force` is not `true`, the
   * current file on disk is hashed and compared — a mismatch causes
   * `ArtifactConflictError`.
   *
   * @param spec - The spec to write sidecar for
   * @param content - Parsed sidecar content to persist
   * @param options - Save options
   * @param options.force - Skip conflict detection when `true`
   * @throws {ArtifactConflictError} On hash mismatch when `force` is not set
   */
  abstract saveSpecLock(
    spec: Spec,
    content: SpecLockData,
    options?: { force?: boolean },
  ): Promise<void>

  /**
   * Searches spec artifact content for the given query string.
   *
   * Performs case-insensitive substring matching across all spec artifacts.
   * Results are returned sorted by descending relevance score.
   *
   * @param query - The search query string
   * @param options - Search options
   * @param options.limit - Maximum number of results to return
   * @returns Matching specs with scores and match locations, sorted by relevance
   */
  abstract search(query: string, options?: { limit?: number }): Promise<SpecSearchResult[]>

  /**
   * Resolves a storage path to a spec identity within this workspace.
   *
   * Accepts both absolute paths and relative spec links. When `inputPath`
   * is relative (e.g. `../storage/spec.md`), `from` must be provided as
   * the reference spec. Relative resolution is pure computation (no I/O);
   * absolute resolution may require filesystem access.
   *
   * Returns one of:
   * - `{ specPath, specId }` — resolved within this workspace
   * - `{ crossWorkspaceHint }` — relative path escaped this workspace;
   *   the caller should try other repositories with the hint segments
   * - `null` — not a valid spec link
   *
   * @param inputPath - Absolute path or relative spec link (e.g. `../storage/spec.md`)
   * @param from - Reference spec for relative resolution (required when `inputPath` is relative)
   * @returns The resolved result, a cross-workspace hint, or `null`
   */
  abstract resolveFromPath(
    inputPath: string,
    from?: SpecPath,
  ): Promise<ResolveFromPathResult | null>
}

/** Result of {@link SpecRepository.resolveFromPath}. */
export type ResolveFromPathResult =
  | { readonly specPath: SpecPath; readonly specId: string }
  | { readonly crossWorkspaceHint: readonly string[] }
