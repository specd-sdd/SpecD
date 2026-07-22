import { type Spec } from '../../domain/entities/spec.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import {
  strictSpecMetadataSchema,
  type PersistedSpecMetadata,
} from '../../domain/services/parse-metadata.js'
import { extractSpecSummary } from '../../domain/services/spec-summary.js'
import { type SpecListEntry } from '../../application/ports/spec-repository.js'
import { type ListOptions, type ListResult } from '../../application/ports/repository.js'
import {
  FsIndexCache,
  type IndexWireLine,
  type SourceFileStamp,
  type SourceStamp,
} from './fs-index-cache-base.js'

/**
 * Read-only accessor the {@link FsSpecIndexCache} uses to materialize
 * {@link SpecListEntry} rows without knowing about filesystem layout.
 *
 * Implemented by `FsSpecRepository`, letting the cache reuse the
 * repository's existing artifact/metadata reads instead of duplicating I/O.
 */
export interface SpecIndexSource {
  /** Walks all specs in the workspace (directory discovery only, no content reads). */
  walk(): Promise<readonly Spec[]>
  /** Loads parsed metadata for a spec, or `null` if no `metadata.json` exists. */
  metadata(spec: Spec): Promise<PersistedSpecMetadata | null>
  /** Loads one artifact's content for a spec, or `null` if the file does not exist. */
  artifact(spec: Spec, filename: string): Promise<SpecArtifact | null>
  /** Returns current mtimes for every file that materialization depends on. */
  sourceFileStamps(spec: Spec): Promise<readonly SourceFileStamp[]>
}

/** Configuration for one {@link FsSpecIndexCache} workspace bucket instance. */
export interface FsSpecIndexCacheOptions {
  /** Absolute path to the fs-cache bucket directory for this workspace. */
  readonly bucketDir: string
  /** The workspace name entries are materialized for. */
  readonly workspace: string
  /** Accessor used to walk specs and materialize entry fields. */
  readonly source: SpecIndexSource
}

/**
 * Filesystem-backed list-index cache for one workspace's spec bucket.
 *
 * Materializes the full {@link SpecListEntry} payload (title, summary,
 * metadata status) at index time so repository-level include flags never
 * trigger extra I/O. Wraps {@link FsIndexCache}; `FsSpecRepository` never
 * reads `.specd-index.jsonl` directly.
 */
export class FsSpecIndexCache {
  private readonly _cache: FsIndexCache<SpecListEntry>
  private readonly _workspace: string
  private readonly _source: SpecIndexSource

  /**
   * Creates a new `FsSpecIndexCache` instance for one workspace.
   *
   * @param options - Bucket directory, workspace name, and source accessor
   */
  constructor(options: FsSpecIndexCacheOptions) {
    this._workspace = options.workspace
    this._source = options.source
    this._cache = new FsIndexCache<SpecListEntry>({
      bucketDir: options.bucketDir,
      entryId: (entry) => entry.path,
      compare: (a, b) => a.path.localeCompare(b.path),
      cursor: (entry) => ({ key: entry.path }),
      serializeEntry: (entry) => entry,
      deserializeEntry: (raw) => raw as SpecListEntry,
      rebuild: () => this._rebuild(),
      currentStamps: () => this._currentStamps(),
    })
  }

  /**
   * Lists entries in path-ascending order, applying freshness checks first.
   *
   * @param options - Pagination options
   * @param filter - Optional predicate applied before pagination (e.g. path prefix)
   * @returns Paginated list result with the full materialized payload per entry
   */
  async list(
    options?: ListOptions,
    filter?: (entry: SpecListEntry) => boolean,
  ): Promise<ListResult<SpecListEntry>> {
    return this._cache.list(options, filter)
  }

  /**
   * Returns the total spec count for this workspace, applying freshness checks first.
   *
   * @returns The total indexed spec count
   */
  async count(): Promise<number> {
    return this._cache.count()
  }

  /**
   * Forces a full rebuild of this workspace's index from disk.
   *
   * @returns A promise that resolves when the rebuild completes
   */
  async reindex(): Promise<void> {
    return this._cache.reindex()
  }

  /**
   * Marks this workspace's index invalidated so the next `list()`/`count()` rebuilds it.
   *
   * @returns A promise that resolves when invalidation has been persisted
   */
  async invalidate(): Promise<void> {
    return this._cache.invalidate()
  }

  /**
   * Re-materializes and upserts the row for one spec.
   *
   * @param spec - The spec whose row should be refreshed
   */
  async refresh(spec: Spec): Promise<void> {
    const entry = await materializeSpecEntry(this._workspace, spec, this._source)
    const sourceFiles = await this._source.sourceFileStamps(spec)
    await this._cache.upsert(entry, { sourceFiles })
  }

  /**
   * Removes one spec's row by path.
   *
   * @param specPath - The spec path (forward-slash form) to remove
   */
  async remove(specPath: string): Promise<void> {
    await this._cache.remove(specPath)
  }

  /**
   * Yields wire lines for a full spec-bucket rebuild.
   *
   * @yields One wire line per spec in the workspace
   */
  private async *_rebuild(): AsyncGenerator<IndexWireLine<SpecListEntry>> {
    const specs = await this._source.walk()
    for (const spec of specs) {
      const entry = await materializeSpecEntry(this._workspace, spec, this._source)
      const sourceFiles = await this._source.sourceFileStamps(spec)
      yield { entry, sourceFiles }
    }
  }

  /**
   * Collects current per-spec source file stamps for freshness comparison.
   *
   * @returns Map of spec path to source stamp
   */
  private async _currentStamps(): Promise<ReadonlyMap<string, SourceStamp>> {
    const specs = await this._source.walk()
    const stamps = new Map<string, SourceStamp>()
    await Promise.all(
      specs.map(async (spec) => {
        stamps.set(spec.name.toFsPath('/'), await this._source.sourceFileStamps(spec))
      }),
    )
    return stamps
  }
}

/**
 * Materializes a full {@link SpecListEntry} for one spec, resolving title,
 * summary, and metadata status.
 *
 * Title resolution: metadata `title` (non-empty trimmed) else the last path
 * segment. Summary resolution order: `optimizedDescription` →
 * `description` → extracted from `spec.md`. Per-spec resolution errors are
 * swallowed with the title fallback; metadata I/O errors resolve to
 * `'stale'` rather than `'missing'`.
 *
 * @param workspace - The workspace name the spec belongs to
 * @param spec - The spec being materialized
 * @param source - Accessor used to read metadata and artifact content
 * @returns The full materialized entry
 */
async function materializeSpecEntry(
  workspace: string,
  spec: Spec,
  source: SpecIndexSource,
): Promise<SpecListEntry> {
  const specPath = spec.name.toFsPath('/')
  let title = spec.name.toString().split('/').at(-1) ?? spec.name.toString()
  let summary: string | undefined
  let metadataStatus: 'missing' | 'invalid' | 'stale' | 'fresh' = 'missing'

  let meta: PersistedSpecMetadata | null = null
  try {
    meta = await source.metadata(spec)
  } catch {
    metadataStatus = 'stale'
  }

  if (meta !== null) {
    const { originalHash, freshness, ...persisted } = meta
    void originalHash
    const structurallyValid = strictSpecMetadataSchema.safeParse(persisted).success
    metadataStatus = structurallyValid ? freshness : 'invalid'

    if (meta.title !== undefined && meta.title.trim().length > 0) {
      title = meta.title.trim()
    }

    if (meta.optimizedDescription !== undefined && meta.optimizedDescription.trim().length > 0) {
      summary = meta.optimizedDescription.trim()
    } else if (meta.description !== undefined && meta.description.trim().length > 0) {
      summary = meta.description.trim()
    }
  }

  if (summary === undefined && spec.filenames.includes('spec.md')) {
    try {
      const artifact = await source.artifact(spec, 'spec.md')
      if (artifact !== null) {
        const extracted = extractSpecSummary(artifact.content)
        if (extracted !== null) summary = extracted
      }
    } catch {
      // Silently ignore — spec is still listed without a summary.
    }
  }

  return {
    workspace,
    path: specPath,
    title,
    ...(summary !== undefined ? { summary } : {}),
    metadataStatus,
  }
}
