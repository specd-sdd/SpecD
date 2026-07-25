import { type Spec } from '../../domain/entities/spec.js'
import { type SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { type MetadataSnapshot, type SpecMetadata } from '../../domain/services/parse-metadata.js'
import {
  type PersistedImplementationLink,
  type PersistedSpecState,
  type PersistedSpecStateSnapshot,
} from '../../domain/services/apply-persisted-spec-state-patch.js'
import {
  Repository,
  type RepositoryConfig,
  type ListOptions,
  type ListResult,
} from './repository.js'

export { type RepositoryConfig as SpecRepositoryConfig }
export type { ListOptions, ListResult }
export type { PersistedImplementationLink }

/** Physical artifact metadata for one canonical filename. */
export interface ArtifactMeta {
  readonly lastModified: string
  readonly hash?: string
}

/** Cheap observation of the persisted semantic state sidecar. */
export interface PersistedStateMeta {
  readonly lastModified: string
  readonly hash?: string
}

/** Cheap observation of the generated metadata cache file. */
export interface GeneratedMetadataMeta {
  readonly lastModified: string
  readonly hash?: string
}

/** Schema artifact stamp projected onto a list entry when {@link SpecListOptions.includeMeta} is set. */
export interface SpecListArtifactMeta {
  readonly filename: string
  readonly lastModified: string
}

/** Options for Meta methods that may optionally include content hashes. */
export interface SpecMetaOptions {
  readonly includeHash?: boolean
}

/** Lightweight spec row returned by {@link SpecRepository.list}. */
export interface SpecListEntry {
  readonly workspace: string
  readonly path: string
  readonly title: string
  readonly summary?: string
  readonly artifacts?: readonly SpecListArtifactMeta[]
  readonly persistedStateMeta?: PersistedStateMeta | null
  readonly generatedMetadataMeta?: GeneratedMetadataMeta | null
}

/** Options for listing specs within a workspace. */
export interface SpecListOptions extends ListOptions {
  readonly includeSummary?: boolean
  readonly includeMeta?: boolean
}

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
  /** Complete persisted semantic state staged with the publication. */
  readonly persistedState: PersistedSpecState
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
   * Returns the canonical specs root path for filesystem-backed repositories.
   *
   * Non-filesystem-backed repositories return `undefined`.
   *
   * @returns Absolute specs root path when available.
   */
  get specsPath(): string | undefined {
    return undefined
  }

  /**
   * Returns the spec metadata for the given name, or `null` if not found.
   *
   * @param name - The spec identity path within this workspace (e.g. `auth/oauth`)
   * @returns The spec metadata, or `null` if no such spec exists
   */
  abstract get(name: SpecPath): Promise<Spec | null>

  /**
   * Lists specs in this workspace, optionally filtered by a path prefix.
   *
   * Returns lightweight {@link SpecListEntry} rows — no artifact content is loaded
   * unless include flags request projected fields already materialized in the index.
   *
   * @param prefix - Optional path prefix to filter results (e.g. `auth` returns all `auth/*`)
   * @param options - Pagination and include projection options
   * @returns Paginated matching specs in canonical path order
   */
  abstract list(prefix?: SpecPath, options?: SpecListOptions): Promise<ListResult<SpecListEntry>>

  /**
   * Returns the total number of specs in this workspace.
   *
   * This provides an efficient way to discover workspace size without loading
   * all lightweight metadata into memory.
   *
   * @returns The total spec count (same source as `list().meta.total`)
   */
  abstract count(): Promise<number>

  /**
   * Rebuilds the spec list fs-cache index for this workspace.
   */
  abstract reindex(): Promise<void>

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
   * Reads the exact persisted semantic state, or `null` when no lock exists.
   */
  abstract readPersistedState(spec: Spec): Promise<PersistedSpecStateSnapshot | null>

  /**
   * Conditionally replaces the complete persisted state.
   *
   * `expectedRevision: null` means the caller observed persisted state as absent
   * and intends to create it — the write MUST fail if state already exists.
   */
  abstract writePersistedState(
    spec: Spec,
    state: PersistedSpecState,
    options: { readonly expectedRevision: string | null },
  ): Promise<PersistedSpecStateSnapshot>

  /**
   * Returns physical artifact metadata for one filename, or `null` when absent.
   *
   * `hash` is included only when `options.includeHash === true`.
   */
  abstract artifactMeta(
    spec: Spec,
    filename: string,
    options?: SpecMetaOptions,
  ): Promise<ArtifactMeta | null>

  /**
   * Cheap observation of the persisted semantic state sidecar.
   *
   * `null` when absent. `hash` only when `options.includeHash === true`.
   */
  abstract persistedStateMeta(
    spec: Spec,
    options?: SpecMetaOptions,
  ): Promise<PersistedStateMeta | null>

  /**
   * Cheap observation of the generated metadata cache file.
   *
   * Same lastModified / optional hash rules as {@link persistedStateMeta}.
   */
  abstract generatedMetadataMeta(
    spec: Spec,
    options?: SpecMetaOptions,
  ): Promise<GeneratedMetadataMeta | null>

  /**
   * Reads the exact persisted metadata observation.
   */
  abstract readMetadataSnapshot(spec: Spec): Promise<MetadataSnapshot>

  /**
   * Writes one complete metadata projection.
   *
   * `expectedRevision: null` means metadata must still be absent.
   * Read-only workspaces still permit metadata cache writes.
   */
  abstract writeMetadataSnapshot(
    spec: Spec,
    metadata: SpecMetadata,
    options: { readonly expectedRevision: string | null },
  ): Promise<MetadataSnapshot>

  /**
   * Returns a content fingerprint for authored artifacts and persisted state.
   *
   * Generated metadata MUST NOT be included.
   *
   * @param spec - The spec whose fingerprint to compute
   */
  abstract specFingerprint(spec: Spec): Promise<string>

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
