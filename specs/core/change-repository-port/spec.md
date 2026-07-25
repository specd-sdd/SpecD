# ChangeRepository Port

## Purpose

Without an abstraction over change storage, use cases would couple directly to filesystem layout and I/O, making them untestable and locked to a single storage strategy. `ChangeRepository` is the application-layer port for reading and writing changes, extending the shared `Repository` base class for interface consistency while operating globally — changes live in a single `changes/` directory, not per-workspace. This spec defines the contract that all implementations must satisfy.

## Requirements

### Requirement: Inheritance from Repository base

`ChangeRepository` MUST extend `Repository`. The inherited `workspace()`, `ownership()`, and `isExternal()` accessors MUST be present but carry default values — no use case relies on them for `ChangeRepository`. They exist solely to satisfy the shared base contract.

### Requirement: get returns a Change or null

`get(name)` MUST resolve the change name **only** under active storage (`changes/`). It MUST NOT search `drafts/` or `discarded/`.

When a change with the given name exists only as drafted, `get(name)` MUST return `null`.

When a change exists in active storage, `get(name)` MUST return the `Change` with artifact and file states loaded from the persisted manifest. If an artifact or file entry omits `state`, the repository defaults that missing value to `missing` while loading.

`validatedHash` is still loaded with the artifact data, but hash comparison is not the sole source of truth for steady-state status. The repository MAY detect drift and persist updated file and artifact states before returning (see Requirement: Auto-invalidation on get when artifact files drift).

`get()` is a snapshot read for **active** changes. It MAY auto-invalidate and persist drifted artifacts under the repository's change lock (`_withChangeLock`) before returning, but it MUST NOT be the repository's serialized mutation primitive. Callers that need a coordinated read-modify-write section for an existing active change MUST use `mutate(name, fn)` instead of relying on a later `save()` against a stale snapshot.

### Requirement: getDraft returns a DraftedChangeView or null

`getDraft(name)` MUST resolve the change name **only** under drafted storage (`drafts/`). It MUST NOT search `changes/` or `discarded/`.

When a drafted change exists, `getDraft(name)` MUST return a `DraftedChangeView` constructed from the persisted manifest. The view MUST satisfy [`core:drafted-change-view`](../drafted-change-view/spec.md).

When no drafted change exists with the given name, `getDraft(name)` MUST return `null`.

`getDraft()` MUST NOT auto-invalidate or persist manifest updates. Drift detection for drafted changes is out of scope for the active working set until the change is restored.

### Requirement: getDiscarded returns a DiscardedChangeView or null

`getDiscarded(name)` MUST resolve the change name **only** under discarded storage (`discarded/`). It MUST NOT search `changes/` or `drafts/`.

When a discarded change exists, `getDiscarded(name)` MUST return a `DiscardedChangeView` built via `toDiscardedChangeView` from the shared inspection facade ([`core:read-only-change-view`](../read-only-change-view/spec.md)).

When no discarded change exists with the given name, `getDiscarded(name)` MUST return `null`.

`getDiscarded()` MUST NOT auto-invalidate or persist manifest updates.

### Requirement: mutate serializes persisted change updates

`mutate(name, fn)` MUST provide serialized read-modify-write semantics for one existing **active** persisted change.

Resolution MUST use the same rules as `get(name)` — only `changes/`. If the name exists only under `drafts/`, `mutate()` MUST throw `ChangeNotFoundError`.

For a given active change name, the repository MUST:

1. Acquire exclusive mutation access scoped to that persisted change
2. Reload the freshest persisted `Change` state from active storage after the exclusive access is acquired, ensuring that this load operation does not trigger nested write locks or deadlocks. In filesystem-backed implementations, this reload operation MUST be performed using the internal read helper (e.g. `_getInternal(..., { skipWrite: true })`) to bypass nested locks and auto-invalidation writes, deferring all writes to the final save step.
3. Invoke `fn(change)` with that fresh `Change` where `change.isDrafted === false`
4. Persist the updated change manifest if `fn` resolves successfully (via the repository's internal manifest-write primitive)
5. Reconcile by re-reading the change through the same load path used by `get` (including artifact-file drift detection and disk re-derive when artifact types are resolved). If that reconcile requires further manifest persistence, persist again before releasing the lock
6. Release the exclusive access before returning or throwing

`mutate` MUST return `{ result, change }` where:

- `result` is the value returned by `fn` (including `void` / `undefined`)
- `change` is the post-reconcile `Change` from step 5 — not the pre-reconcile callback snapshot

Callers that need the durable aggregate MUST use `.change`. The callback `fresh` object is not guaranteed equivalent to a subsequent `get()` after artifact bytes or disk state diverge during the callback.

If no active change with the given name exists, `mutate()` MUST throw `ChangeNotFoundError`.

If `fn` throws, `mutate()` MUST release the exclusive access and MUST NOT persist a partial manifest update produced by the failed callback.

The serialized section MUST cover the full persisted mutation window — fresh load, callback execution, manifest persistence, and post-save reconcile. Locking only the final manifest write is insufficient.

Exclusive access is per change name, not global. Mutations targeting different change names MAY proceed concurrently.

### Requirement: mutateDraft serializes drafted change updates

`mutateDraft(name, fn)` MUST provide serialized read-modify-write semantics for one existing **drafted** persisted change.

Resolution MUST use the same rules as `getDraft(name)` — only `drafts/`. If the name exists only under active storage, `mutateDraft()` MUST throw `ChangeNotFoundError`.

The callback MUST receive a fresh mutable `Change` with `isDrafted === true` before any transforming operation in the callback. Only `RestoreChange` and `DiscardChange` (and repository internals) MAY call `mutateDraft` in production code.

On success, the repository MUST:

1. Persist the manifest and perform any required directory move (`drafts/` ↔ `changes/` or `drafts/` → `discarded/`)
2. Reconcile by re-reading through the load path appropriate to the change's post-persist bucket (including drift detection when applicable)
3. Return `{ result, change }` with the same semantics as `mutate` — `result` from `fn`, `change` post-reconcile

If `fn` throws, `mutateDraft()` MUST NOT persist partial updates, matching `mutate` failure semantics.

### Requirement: Auto-invalidation on get when artifact files drift

The `FsChangeRepository` implementation of `get()` MUST detect artifact file drift and auto-invalidate the change when appropriate, provided that the repository is fully initialized with resolved artifact types. After loading a change, the repository compares the current cleaned file hash against each file's stored `validatedHash` for files that were previously validated. If the repository is not initialized with artifact types, drift detection is bypassed.

To support clean delegation and avoid deadlocks, the core loading, status mapping, and lock-based drift invalidation/sync checks MUST be encapsulated in a single internal read path (e.g., a private helper like `_getInternal`) shared by `get()` and `mutate()`.

A file is drifted when:

- `validatedHash` is a SHA-256 value recorded by prior validation, and
- the current cleaned content hash no longer matches that `validatedHash`

When drift is detected, the repository MUST:

1. Acquire the repository's change lock (`_withChangeLock`) for the change name.
2. Inside the lock, reload the manifest from disk to ensure consistency.
3. If drift is still present on the reloaded state, scan the full affected artifact set first, collecting every drifted file key grouped by artifact type. It MUST NOT stop at the first mismatch.
4. Mark each drifted file as `drifted-pending-review`.
5. Recompute every affected artifact's aggregate `state`.
6. Invalidate the change back to `designing` using the domain invalidation mechanism, preserving `drifted-pending-review` on the drifted files and downgrading the remaining files to `pending-review`.
7. Persist the updated manifest inside the lock boundary before returning.

This invalidation is lifecycle-independent: if a validated file drifts, the change is invalidated back to `designing` regardless of whether the current lifecycle state is `designing`, `ready`, `implementing`, `verifying`, `done`, or `archivable`.

The invalidation history entry MUST record:

- `cause: "artifact-drift"`
- a clear `message`
- `affectedArtifacts`, including each affected artifact type and the full list of drifted file keys captured in step 3

The `SYSTEM_ACTOR` constant (`{ name: 'specd', email: 'system@getspecd.dev' }`) is used as the actor for these automated invalidations.

### Requirement: list returns active changes in creation order

`list(options?)` MUST return `ListResult<ActiveChangeListEntry>` for all active (non-drafted, non-discarded) changes.

`ActiveChangeListOptions` extends `ListOptions` with:

- `includeDescription?: boolean` — when `true`, projected entries MAY include `description`; when `false` or omitted, `description` MUST NOT appear.

Sort order MUST be canonical: `createdAt` ascending (oldest → newest). The sort key aligns with the timestamped directory name, but pagination and cursors use `createdAt`.

`list()` MUST NOT return full `Change` aggregates, artifact content, history, or derived artifact state maps. Those belong on `get(name)`.

`meta.total` and `count()` MUST read from the same index source.

### Requirement: listDrafts returns drafted changes in creation order

`listDrafts(options?)` MUST return `ListResult<DraftedChangeListEntry>` for all drafted changes.

`DraftedChangeListOptions` extends `ListOptions` with:

- `includeDescription?: boolean` — projected `description` when `true`
- `includeReason?: boolean` — projected `reason` when `true`

Sort order MUST be canonical: `draftedAt` descending (newest → oldest).

`listDrafts()` MUST NOT return `DraftedChangeView`, mutable `Change` instances, artifact content, or history. Detail belongs on `getDraft(name)`.

`meta.total` and `countDrafts()` MUST read from the same index source.

### Requirement: listDiscarded returns discarded changes in creation order

`listDiscarded(options?)` MUST return `ListResult<DiscardedChangeListEntry>` for all discarded changes.

`DiscardedChangeListOptions` extends `ListOptions` with:

- `includeDescription?: boolean` — projected `description` when `true`
- `includeReason?: boolean` — projected `reason` when `true`
- `includeSupersededBy?: boolean` — projected `supersededBy` when `true`

Sort order MUST be canonical: `discardedAt` descending (newest → oldest).

`listDiscarded()` MUST NOT return `DiscardedChangeView`, mutable `Change` instances, artifact content, or history. Detail belongs on `getDiscarded(name)`.

`meta.total` and `countDiscarded()` MUST read from the same index source.

### Requirement: Change list counts

`ChangeRepository` MUST expose:

- `count()` — returns the total number of active changes (same value as `list().meta.total`)
- `countDrafts()` — returns the total number of drafted changes (same value as `listDrafts().meta.total`)
- `countDiscarded()` — returns the total number of discarded changes (same value as `listDiscarded().meta.total`)

Each method MUST be efficient and MUST NOT materialize full change aggregates. Filesystem implementations MUST delegate to the corresponding index helper's `count()`.

### Requirement: Change list reindex

`ChangeRepository` MUST expose:

- `reindex()` — rebuilds active, drafted, and discarded list indexes
- `reindexActive()` — rebuilds the active-changes index only
- `reindexDrafts()` — rebuilds the drafts index only
- `reindexDiscarded()` — rebuilds the discarded index only

Each method MUST force a full rebuild of the relevant filesystem index cache bucket under `{configPath}/tmp/fs-cache/`. Implementations MUST NOT require callers to know JSONL layout.

### Requirement: Change list include projection

For each change list method, `include*` flags control **response projection only**. The filesystem index helper MUST store the full CLI-usable entry payload (including optional fields). When an include flag is set, the corresponding optional field MUST appear on returned items if present in the cached entry. When an include flag is not set, that field MUST NOT appear on returned items.

Implementations and use cases MUST NOT perform extra `get` / manifest reads to satisfy an include flag.

### Requirement: create persists a new change; save is internal

**Public first persist — `create`**

`create(change)` MUST persist a change that does not yet exist under active, drafted, or discarded storage. It MUST write the change manifest atomically (e.g. temp file + rename) and create the change directory. It MUST NOT write artifact file content.

If a change with the same name already exists in any bucket, `create` MUST fail with `ChangeAlreadyExistsError` (or the repository's equivalent conflict error).

`CreateChange` and other first-time constructors MUST call `create`. They MUST NOT call an application-facing `save` API.

**Internal manifest write**

Manifest persistence for an **existing** change (status, validated hashes, history, approvals, directory moves between buckets) MUST occur only inside `mutate` / `mutateDraft` (or equivalent repository-internal paths such as `get` auto-invalidation under lock).

Adapters MAY keep an internal manifest-write helper used by `create`, `mutate`, `mutateDraft`, and locked `get` drift persistence. That helper MUST NOT be part of the application-facing port surface that use cases call. Use cases MUST NOT persist an existing change by writing a caller-held snapshot outside `mutate` / `mutateDraft`.

The internal manifest write MUST NOT write artifact file content. Artifact content is written exclusively via `saveArtifact()`.

If an internal write targets a drafted change, it MUST be rejected with `DraftedChangeReadOnlyError` unless it originates from the serialized `mutateDraft` (or active `mutate`) window for that change name.

### Requirement: delete removes the entire change directory

`delete(change)` MUST remove the entire change directory and all its contents from the filesystem.

### Requirement: artifact loads content with originalHash

`artifact(change, filename)` MUST load the content of a single artifact file within a change and return a `SpecArtifact`. The returned artifact's `originalHash` MUST be set to the `sha256` hash of the content read from disk, enabling conflict detection on subsequent saves. If the file does not exist, the method MUST return `null`.

### Requirement: saveArtifact with optimistic concurrency

`saveArtifact(change, artifact, options?)` MUST write an artifact file within a change directory and MUST return `void`.

`saveArtifact` MUST run only inside an active `mutate` or `mutateDraft` window for that change name (repository-internal per-name mutation tracking). If no such window is active, `saveArtifact` MUST reject before any filesystem write. Callers do not need a public `isMutating` API.

If `change.isDrafted === true` and the call is outside the drafted mutation window, `saveArtifact` MUST throw `DraftedChangeReadOnlyError` before any filesystem write (same drafted guard as today, subsumed by the mutate-window rule when windows are tracked for all changes).

If `artifact.originalHash` is set, the implementation MUST compare it against the current hash of the file on disk before writing. If the hashes differ, the save MUST be rejected by throwing `ArtifactConflictError` — this prevents silently overwriting concurrent modifications. When `options.force` is `true`, the conflict check MUST be skipped and the file MUST be overwritten unconditionally.

After a successful write, `saveArtifact` MUST NOT mutate the in-memory `Change` aggregate: it MUST NOT change file/artifact status, validated hashes, history, or approvals (including any `setFileStatus` / `in-progress` reopen). Drift classification and status updates are owned by the load/reconcile path used by `get` and by the post-`mutate` / post-`mutateDraft` reconcile step.

### Requirement: artifactExists checks file presence without loading

`artifactExists(change, filename)` MUST return `true` if the artifact file exists within the change directory, `false` otherwise. It MUST NOT load the file content.

### Requirement: deltaExists checks delta file presence

`deltaExists(change, specId, filename)` MUST return `true` if the specified delta file exists for the given change and spec ID, `false` otherwise. Delta files are located within a subdirectory of the change directory identified by the spec ID.

### Requirement: changePath returns the absolute path to a change directory

`changePath(change)` MUST accept a `Change` and return the absolute filesystem path to that change's directory. This is used by use cases that need the change path for template variable construction (e.g. `change.path` in `TemplateVariables`). The implementation resolves the path from its internal storage layout.

### Requirement: draftChangePath returns the drafted directory path

`draftChangePath(view)` MUST accept a `DraftedChangeView` (or the internal drafted `Change` during `mutateDraft`) and return the absolute filesystem path under `drafts/` for template variables and CLI display.

`changePath(change)` MUST continue to resolve paths under `changes/` for active changes only.

### Requirement: internalPaths returns absolute storage paths

`internalPaths()` MUST return an array of absolute filesystem paths to internal specd management directories owned by the repository, or `undefined` when the concept does not apply.

Returning `undefined` signals that internal-path exclusion is not applicable (e.g. remote backends that do not manage local filesystem directories). Implementations MUST NOT return an empty array to signal inapplicability; an empty array means "no paths to exclude".

For `FsChangeRepository`, this MUST include:

- the absolute path to `changes/`
- the absolute path to `drafts/`
- the absolute path to `discarded/`

These paths are used by implementation discovery to avoid tracking specd's own metadata.

### Requirement: scaffold creates artifact directories

`scaffold(change, specExists)` MUST create the directory structure needed for the change's
artifacts. For `scope: spec` artifacts, it creates `specs/<ws>/<capPath>/` or
`deltas/<ws>/<capPath>/` directories under the change directory. For `scope: change`
artifacts, the root directory already exists. The `specExists` callback is an async function
that returns whether a spec already exists in the repository, used to determine whether
to create spec-scoped or delta-scoped directories.

### Requirement: unscaffold removes spec directories

`unscaffold(change, specIds)` MUST remove the scaffolded directories for the given
spec IDs from the change directory. For each spec ID, it MUST remove:

- `specs/<workspace>/<capability-path>/` — new-spec artifact directories
- `deltas/<workspace>/<capability-path>/` — delta artifact directories

The operation MUST be idempotent — if a directory does not exist, it MUST be silently
skipped. If a directory contains files, all files and subdirectories MUST be removed
along with the directory itself.

### Requirement: Abstract class with abstract methods

`ChangeRepository` MUST be defined as an `abstract class`, not an `interface`. All application-facing storage operations (`get`, `getDraft`, `getDiscarded`, `mutate`, `mutateDraft`, `list`, `listDrafts`, `listDiscarded`, `count`, `countDrafts`, `countDiscarded`, `reindex`, `reindexActive`, `reindexDrafts`, `reindexDiscarded`, `create`, `delete`, `artifact`, `saveArtifact`, `artifactExists`, `deltaExists`, `changePath`, `draftChangePath`, `scaffold`, `unscaffold`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

Internal manifest-write helpers used by adapters are not required to appear as abstract port methods.

### Requirement: artifact only loads tracked change artifact files

`artifact(change, filename)` MUST accept only filenames that correspond to tracked artifact files declared on the change's artifact file list.

If `filename` does not match a tracked artifact file for that change, the repository MUST reject the read rather than treating the change directory as a general-purpose file container.

### Requirement: Change artifact path confinement

`artifact(change, filename)`, `artifactExists(change, filename)`, and any related change-artifact file lookup MUST enforce strict confinement to the change directory.

The repository MUST reject any path that would escape the change directory or address an arbitrary file outside the tracked artifact set, including path traversal forms and alternate relative-path encodings.

### Requirement: Change artifact resolution debug logging

Implementations SHOULD emit debug-level logs when resolving tracked change artifact files, rejecting untracked filenames, or rejecting a path-confinement violation.

These logs MUST follow the project's global logging conventions.

## Constraints

- Changes are stored globally, not per-workspace — the inherited workspace context is unused
- `get()` in `FsChangeRepository` may auto-invalidate and persist the change under the mutation lock before returning, if artifact drift is detected and the change is beyond `designing` or has active approvals
- `list`, `listDrafts`, and `listDiscarded` return lightweight list entries with no artifact content, history, or derived artifact state maps
- `get`, `getDraft`, and `getDiscarded` remain the detail surfaces for full manifest-backed inspection
- List pagination has no default `limit`; when omitted, `list()` returns the full bucket and `meta.limit` equals `meta.total` per `core:repository-port`
- Application use cases persist new changes via `create` and existing changes via `mutate` / `mutateDraft` only
- `saveArtifact()` writes file content only and MUST NOT mutate the in-memory `Change`; manifest status updates come from mutate/reconcile/`get`
- `ArtifactConflictError` is the sole error type for concurrent modification detection on artifact bytes
- The `force` option on `saveArtifact()` bypasses conflict detection entirely
- `originalHash` on loaded artifacts MUST use `sha256` of the file content as read from disk
- Manifest writes MUST be atomic to prevent corruption from partial reads
- `mutate` / `mutateDraft` return `{ result, change }` where `change` is post-reconcile

## Spec Dependencies

- [`core:repository-port`](../repository-port/spec.md) — shared repository base contract and list pagination types
- [`core:change-list-entry`](../change-list-entry/spec.md) — `ActiveChangeListEntry`, `DraftedChangeListEntry`, and `DiscardedChangeListEntry`
- [`default:_global/architecture`](../../_global/architecture/spec.md) — application ports and ownership boundaries
- [`core:change`](../change/spec.md) — change entity state, invalidation, and artifact semantics
- [`core:read-only-change-view`](../read-only-change-view/spec.md) — shared read-only facade
- [`core:drafted-change-view`](../drafted-change-view/spec.md) — read model returned by `getDraft`
- [`core:discarded-change-view`](../discarded-change-view/spec.md) — read model returned by `getDiscarded`
- [`core:drafted-change-read-only-error`](../drafted-change-read-only-error/spec.md) — secondary persistence guard
- [`core:storage`](../storage/spec.md) — filesystem persistence and change directory layout
- [`core:change-manifest`](../change-manifest/spec.md) — manifest fields persisted by the repository
- [`default:_global/logging`](../../_global/logging/spec.md) — debug logging requirements for tracked artifact resolution and path-confinement diagnostics
