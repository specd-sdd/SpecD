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

`get()` is a snapshot read for **active** changes. It MAY auto-invalidate and persist drifted artifacts before returning, but it MUST NOT be the repository's serialized mutation primitive. Callers that need a coordinated read-modify-write section for an existing active change MUST use `mutate(name, fn)` instead of relying on a later `save()` against a stale snapshot.

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
2. Reload the freshest persisted `Change` state from active storage after the exclusive access is acquired
3. Invoke `fn(change)` with that fresh `Change` where `change.isDrafted === false`
4. Persist the updated change manifest if `fn` resolves successfully
5. Release the exclusive access before returning or throwing

If no active change with the given name exists, `mutate()` MUST throw `ChangeNotFoundError`.

If `fn` throws, `mutate()` MUST release the exclusive access and MUST NOT persist a partial manifest update produced by the failed callback.

The serialized section MUST cover the full persisted mutation window — fresh load, callback execution, and manifest persistence. Locking only the final manifest write is insufficient.

Exclusive access is per change name, not global. Mutations targeting different change names MAY proceed concurrently.

### Requirement: mutateDraft serializes drafted change updates

`mutateDraft(name, fn)` MUST provide serialized read-modify-write semantics for one existing **drafted** persisted change.

Resolution MUST use the same rules as `getDraft(name)` — only `drafts/`. If the name exists only under active storage, `mutateDraft()` MUST throw `ChangeNotFoundError`.

The callback MUST receive a fresh mutable `Change` with `isDrafted === true` before any transforming operation in the callback. Only `RestoreChange` and `DiscardChange` (and repository internals) MAY call `mutateDraft` in production code.

On success, the repository MUST persist the manifest and perform any required directory move (`drafts/` ↔ `changes/` or `drafts/` → `discarded/`).

If `fn` throws, `mutateDraft()` MUST NOT persist partial updates, matching `mutate` failure semantics.

### Requirement: Auto-invalidation on get when artifact files drift

The `FsChangeRepository` implementation of `get()` MUST detect artifact file drift and auto-invalidate the change when appropriate. After loading a change, the repository compares the current cleaned file hash against each file's stored `validatedHash` for files that were previously validated.

A file is drifted when:

- `validatedHash` is a SHA-256 value recorded by prior validation, and
- the current cleaned content hash no longer matches that `validatedHash`

When drift is detected, the repository MUST:

1. Scan the full affected artifact set first, collecting every drifted file key grouped by artifact type. It MUST NOT stop at the first mismatch.
2. Mark each drifted file as `drifted-pending-review`.
3. Recompute every affected artifact's aggregate `state`.
4. Invalidate the change back to `designing` using the domain invalidation mechanism, preserving `drifted-pending-review` on the drifted files and downgrading the remaining files to `pending-review`.
5. Persist the updated manifest before returning.

This invalidation is lifecycle-independent: if a validated file drifts, the change is invalidated back to `designing` regardless of whether the current lifecycle state is `designing`, `ready`, `implementing`, `verifying`, `done`, or `archivable`.

The invalidation history entry MUST record:

- `cause: "artifact-drift"`
- a clear `message`
- `affectedArtifacts`, including each affected artifact type and the full list of drifted file keys captured in step 1

The `SYSTEM_ACTOR` constant (`{ name: 'specd', email: 'system@getspecd.dev' }`) is used as the actor for these automated invalidations.

### Requirement: Shared drift reconciliation hook

`FsChangeRepository` MUST expose a single drift-reconciliation algorithm used by both `get()` (before return) and **`SaveChangeArtifact`** (after a successful artifact write).

The hook MUST:

- Compare on-disk content to `validatedHash` for tracked artifact files
- Support excluding one or more file keys (the just-saved file during human save)
- Apply the same invalidation semantics as auto-invalidation on drift (`artifact-drift`, `designing`, file states)

`SaveChangeArtifact` MUST invoke this hook after writing file bytes and before final `save(change)` so agent edits to sibling artifacts are detected in the same pass as load-time drift.

### Requirement: Idempotent drift reconciliation persistence

Drift reconciliation invoked during `get()` (and any shared hook used by load paths) MUST NOT rewrite the change manifest when `Change.invalidate('artifact-drift', ...)` is a deduped no-op per `core:change`.

The repository MUST detect whether new history was appended (for example by comparing history length or an explicit signal from the domain invalidation) **before** calling `_writeManifestAtomic` or equivalent direct manifest persistence.

When invalidation is deduped:

- The manifest file on disk MUST remain unchanged
- `reconcileArtifactDrift()` (or the internal helper) MUST return `false`

When invalidation appends new history:

- The updated manifest MUST be persisted atomically before the loaded change is returned
- The helper MUST return `true`

Repeated read-only loads with unchanged drift scope MUST therefore be safe for polling clients: history event count and manifest revision MUST remain stable across consecutive polls.

### Requirement: list returns active changes in creation order

`list()` MUST return all active (non-drafted, non-discarded) changes sorted by creation order, oldest first. Each returned `Change` MUST include artifact state (derived statuses) but MUST NOT include artifact content. Content is loaded on demand via `artifact()`.

### Requirement: listDrafts returns drafted changes in creation order

`listDrafts()` MUST return all drafted changes sorted by creation order, oldest first. Each entry MUST be a `DraftedChangeView` with artifact state (derived statuses) but MUST NOT include artifact content. The repository MUST NOT return mutable `Change` instances to callers.

### Requirement: listDiscarded returns discarded changes in creation order

`listDiscarded()` MUST return all discarded changes sorted by creation order, oldest first. Each entry MUST be a `DiscardedChangeView` built via the shared inspection facade. The repository MUST NOT return mutable `Change` instances to callers.

### Requirement: save persists the change manifest only

`save(change)` MUST persist the change manifest — state, artifact statuses, validated hashes, history events, and approvals. It MUST NOT write artifact file content. Artifact content is written exclusively via `saveArtifact()`. The write MUST be atomic (e.g. temp file + rename) to prevent partial reads.

If `change.isDrafted === true`, `save(change)` MUST throw `DraftedChangeReadOnlyError` unless the call originates from the serialized `mutateDraft` window for that change name.

`save()` is a low-level persistence operation. Atomic manifest writing prevents partial-file corruption, but `save()` alone does not serialize a caller's earlier snapshot read. Use cases that mutate an existing active persisted change and need concurrency safety MUST perform that mutation through `mutate(name, fn)`.

### Requirement: delete removes the entire change directory

`delete(change)` MUST remove the entire change directory and all its contents from the filesystem.

### Requirement: artifact loads content with originalHash

`artifact(change, filename)` MUST load the content of a single artifact file within a change and return a `SpecArtifact`. The returned artifact's `originalHash` MUST be set to the `sha256` hash of the content read from disk, enabling conflict detection on subsequent saves. If the file does not exist, the method MUST return `null`.

### Requirement: artifactReadOnly loads bytes without returning Change

`artifactReadOnly(readOnlyOrigin, name, filename)` MUST load tracked artifact file content for a {@link ReadOnlyChangeView} storage location (`draft`, `discarded`; `archived` when wired). It MUST use the same confinement and `originalHash` semantics as `artifact(change, filename)` but MUST NOT return a mutable `Change` aggregate to callers.

`readOnlyOrigin` MUST be a {@link ReadOnlyChangeOrigin} value. Implementations MUST resolve the change directory from `drafts/` or `discarded/` only for the matching origin.

### Requirement: saveArtifact with optimistic concurrency

`saveArtifact(change, artifact, options?)` MUST write an artifact file within a change directory. If `change.isDrafted === true`, `saveArtifact` MUST throw `DraftedChangeReadOnlyError` before any filesystem write.

If `artifact.originalHash` is set, the implementation MUST compare it against the current hash of the file on disk before writing. If the hashes differ, the save MUST be rejected by throwing `ArtifactConflictError` — this prevents silently overwriting concurrent modifications. When `options.force` is `true`, the conflict check MUST be skipped and the file MUST be overwritten unconditionally. After a successful write, the corresponding `ChangeArtifact` status in the change manifest MUST be reset to `in-progress`; the caller is responsible for calling `save(change)` to persist this state change.

### Requirement: artifactExists checks file presence without loading

`artifactExists(change, filename)` MUST return `true` if the artifact file exists within the change directory, `false` otherwise. It MUST NOT load the file content.

### Requirement: deltaExists checks delta file presence

`deltaExists(change, specId, filename)` MUST return `true` if the specified delta file exists for the given change and spec ID, `false` otherwise. Delta files are located within a subdirectory of the change directory identified by the spec ID.

### Requirement: changePath returns the absolute path to a change directory

`changePath(change)` MUST accept a `Change` and return the absolute filesystem path to that change's directory. This is used by use cases that need the change path for template variable construction (e.g. `change.path` in `TemplateVariables`). The implementation resolves the path from its internal storage layout.

### Requirement: draftChangePath returns the drafted directory path

`draftChangePath(view)` MUST accept a `DraftedChangeView` (or the internal drafted `Change` during `mutateDraft`) and return the absolute filesystem path under `drafts/` for template variables and CLI display.

`changePath(change)` MUST continue to resolve paths under `changes/` for active changes only.

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

`ChangeRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`get`, `getDraft`, `getDiscarded`, `mutate`, `mutateDraft`, `list`, `listDrafts`, `listDiscarded`, `save`, `delete`, `artifact`, `saveArtifact`, `artifactExists`, `deltaExists`, `changePath`, `draftChangePath`, `scaffold`, `unscaffold`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

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
- `get()` in `FsChangeRepository` may auto-invalidate and persist the change before returning, if artifact drift is detected and the change is beyond `designing` or has active approvals
- All list methods return `Change` objects with derived artifact state but without artifact content
- `save()` writes the manifest only; `saveArtifact()` writes file content only — these are separate operations
- `ArtifactConflictError` is the sole error type for concurrent modification detection
- The `force` option on `saveArtifact()` bypasses conflict detection entirely
- `originalHash` on loaded artifacts MUST use `sha256` of the file content as read from disk
- Manifest writes MUST be atomic to prevent corruption from partial reads

## Spec Dependencies

- [`core:repository-port`](../repository-port/spec.md) — shared repository base contract
- [`default:_global/architecture`](../../_global/architecture/spec.md) — application ports and ownership boundaries
- [`core:change`](../change/spec.md) — change entity state, invalidation, and artifact semantics
- [`core:read-only-change-view`](../read-only-change-view/spec.md) — shared read-only facade
- [`core:drafted-change-view`](../drafted-change-view/spec.md) — read model returned by `getDraft`
- [`core:discarded-change-view`](../discarded-change-view/spec.md) — read model returned by `getDiscarded`
- [`core:drafted-change-read-only-error`](../drafted-change-read-only-error/spec.md) — secondary persistence guard
- [`core:storage`](../storage/spec.md) — filesystem persistence and change directory layout
- [`core:change-manifest`](../change-manifest/spec.md) — manifest fields persisted by the repository
- [`default:_global/logging`](../../_global/logging/spec.md) — debug logging requirements for tracked artifact resolution and path-confinement diagnostics
