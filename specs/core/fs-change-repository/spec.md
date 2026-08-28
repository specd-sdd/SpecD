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

### Requirement: Revision timestamp serialization and backward compatibility

`FsChangeRepository` SHALL serialize `change.updatedAt` to `manifest.json`.

For legacy manifests where `updatedAt` is missing, `FsChangeRepository` SHALL derive `updatedAt` as the maximum timestamp among `createdAt` and all event timestamps in `history`.

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

After an internal manifest write (`create` or the helper used by `mutate` / `mutateDraft` / locked `get` drift persistence) in the same bucket, `FsChangeRepository` MUST project the new list entry (including history-derived fields) and compare to the cached entry. If equal → no index write. If different → upsert that row via the bucket helper (update `totalCount` as needed).

- **create / delete:** update or remove the row (and `totalCount`) or invalidate the bucket.
- **Moves** between `changes` ↔ `drafts` ↔ `discarded`: update/invalidate **both** affected buckets.
- **`saveArtifact()` / skip / non-listing history:** MUST NOT require list-index updates.

`reindex()`, `reindexActive()`, `reindexDrafts()`, and `reindexDiscarded()` MUST delegate to the corresponding helper full rebuild.

### Requirement: create delegates to internal first persist

`FsChangeRepository.create(change)` MUST perform the first-time directory creation and atomic manifest write for a new change name. It MUST refuse when a directory for that name already exists in `changes/`, `drafts/`, or `discarded/`. It MUST update the corresponding list-index bucket the same way a first `save` of a new active change does today.

### Requirement: mutate and mutateDraft reconcile after persist

After the successful internal manifest write inside `mutate` or `mutateDraft`, `FsChangeRepository` MUST re-enter the same load/reconcile path used by `get` / `_manifestToChange` (with artifact types resolved when available) for the change's post-write storage bucket. If that path marks the in-memory manifest as needing persistence (including `artifact-drift` invalidation), the repository MUST persist again before releasing the change lock and MUST return that reconciled `Change` as `.change` in `{ result, change }`.

### Requirement: saveArtifact requires mutate window and does not touch Change

`FsChangeRepository.saveArtifact` MUST verify the change name is present in the repository's active or draft mutation-in-progress tracking sets. If not, it MUST reject without writing.

On success it MUST write file bytes only (honouring `originalHash` / `force`). It MUST NOT call `setFileStatus`, MUST NOT alter validated hashes or history on the supplied `Change`, and MUST NOT write `manifest.json`.

### Requirement: Filesystem exploration persistence

`FsChangeRepository` SHALL implement the semantic exploration contract using `.specd-exploration.md` inside the change directory as an adapter-private storage detail.

On `create(change, { explorationContent })`, non-empty content MUST be written by the repository as part of first persistence. If that write fails, creation MUST fail and the adapter MUST clean up the newly created change so it is not observable as a partial change. Absent or empty content MUST NOT create the file.

`_manifestToChange` / `get` MAY stat the exploration file to populate `{ lastModified, size }`, but MUST NOT read its content. `readExploration` SHALL load the file lazily and return `null` when absent. `writeExploration` SHALL persist non-empty content atomically. No application or orchestration caller may need to know the filename.

## Constraints

- `FsChangeRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `ChangeRepository` abstract port class, including `create`, `{ result, change }` mutate returns, post-mutate reconcile, and mutate-window-scoped byte-only `saveArtifact`

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
- [`core:storage`](../storage/spec.md) — fs-cache layout, tmp gitignore, and index wire shapes
- [`core:change-list-entry`](../change-list-entry/spec.md) — list entry projection shapes
- [`core:change-repository-port`](../change-repository-port/spec.md) — list/count/reindex port contract
