# FsChangeRepository

## Purpose

`FsChangeRepository` is the filesystem-backed implementation of the `ChangeRepository` port. It manages active changes, drafts, and discarded changes as distinct subdirectories within local or external storage, validating configuration options strictly against its Zod schema while receiving runtime dependencies via its `context: ChangeRepositoryConfig` parameter.

## Requirements

### Requirement: Validate options at construction

`FsChangeRepository` SHALL accept:

1. `context: ChangeRepositoryConfig` containing workspace metadata (`workspace`, `ownership`, `isExternal`, `configPath`), core runtime callbacks (`activeSchema`, `resolveArtifactTypes`, `resolveSpecExists`), and external paths (`draftsPath`, `discardedPath`).
2. `config: FsChangeRepositoryConfig` containing filesystem configuration options (`path`) for the active changes storage.

It MUST validate the `config` parameter using a Zod schema to ensure that only configuration properties originating from `specd.yaml` for this storage are validated, and that no runtime dependencies, external paths, or workspace context properties are included in the configuration schema.

The configuration schema MUST support:

- `path: string`

The constructor MUST verify that the physical directories for active changes (`path`), drafts (`context.draftsPath`), and discarded changes (`context.discardedPath`) exist on disk. If any of these paths do not exist, it MUST throw a `StorageDirectoryNotFoundError`.

### Requirement: Storage factory registration

`FsChangeRepository` SHALL expose a creator function `createFsChangeStorageFactory()` that returns a `ChangeStorageFactory` instance.

This factory SHALL construct and return `FsChangeRepository` instances when `create(context, config)` is called, forwarding the parameters without merging.

### Requirement: FsChangeIndexCache helper

`FsChangeRepository` MUST delegate active, draft, and discarded list/count/reindex operations to one `FsChangeIndexCache` instance per bucket under `{configPath}/tmp/fs-cache/changes/`, `.../drafts/`, and `.../discarded/`.

The repository MUST NOT read or write `.specd-index.jsonl` or `.specd-index-meta.json` directly. It projects list entries from persisted manifests (including history-derived `state`, draft/discard timestamps, actors, reasons, and superseded-by) and forwards `list`, `count`, `reindex*`, and cache invalidation to the helpers.

Canonical sort order per bucket:

| Bucket    | Sort key      | Direction       |
| --------- | ------------- | --------------- |
| Active    | `createdAt`   | oldest → newest |
| Drafts    | `draftedAt`   | newest → oldest |
| Discarded | `discardedAt` | newest → oldest |

### Requirement: Index helper mutate and lock

Each `FsChangeIndexCache` MUST expose a `mutate(fn)`-style API as the **only** allowed write path for its bucket index files. It MUST acquire a per-bucket file lock, run `fn`, and release the lock — including on failure. Concurrent mutators MUST wait (they MUST NOT fail with lock contention).

Inside `mutate`, updates to `.specd-index.jsonl` or `.specd-index-meta.json` MUST write a temp file and `rename` atomically over the live path:

1. Meta-only update → temp+rename of `.specd-index-meta.json` only.
2. JSONL-only update → temp+rename of `.specd-index.jsonl`, then meta update via temp+rename.
3. Both files change → publish jsonl first, then meta.
4. If `fn` fails mid-flight → discard temps; do not leave a half-published pair; release the lock.

`list` and `count` MUST NOT take the lock; with atomic publish they observe a complete prior or complete next snapshot.

Higher-level helper operations (`invalidate`, `reindex`, entry upsert, full rebuild) MUST go through `mutate`, not ad hoc file writes.

### Requirement: Index freshness model

On `list` / `count`, each helper MUST apply this sequence (no VCS coupling):

1. If `isInvalidated` in meta → mandatory incremental rebuild.
2. Else compare disk presence/mtimes to cached `sourceMtime` (manifest for change buckets) → incremental rebuild when stale.
3. Else serve from index.

`FsChangeRepository.invalidateCache()` MUST mark all three bucket helpers invalidated. External callers MAY invoke `invalidateCache()` when the tree changed outside normal write paths.

Rebuild algorithm: single-pass disk scan of mtimes → stream old JSONL → copy hits / rewrite misses → append new → atomic rename; update meta (`totalCount`, `generatedAt`, clear `isInvalidated`).

### Requirement: Write-path index maintenance

After `save(manifest)` in the same bucket, `FsChangeRepository` MUST project the new list entry (including history-derived fields) and compare to the cached entry. If equal → no index write. If different → upsert that row via the bucket helper (update `totalCount` as needed).

- **create / delete:** update or remove the row (and `totalCount`) or invalidate the bucket.
- **Moves** between `changes` ↔ `drafts` ↔ `discarded`: update/invalidate **both** affected buckets.
- **`saveArtifact()` / skip / non-listing history:** MUST NOT require list-index updates.

`reindex()`, `reindexActive()`, `reindexDrafts()`, and `reindexDiscarded()` MUST delegate to the corresponding helper full rebuild.

## Constraints

- `FsChangeRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `ChangeRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
- [`core:storage`](../storage/spec.md) — fs-cache layout, tmp gitignore, and index wire shapes
- [`core:change-list-entry`](../change-list-entry/spec.md) — list entry projection shapes
- [`core:change-repository-port`](../change-repository-port/spec.md) — list/count/reindex port contract
