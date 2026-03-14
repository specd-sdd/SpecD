# ChangeRepository Port

## Purpose

Without an abstraction over change storage, use cases would couple directly to filesystem layout and I/O, making them untestable and locked to a single storage strategy. `ChangeRepository` is the application-layer port for reading and writing changes, extending the shared `Repository` base class for interface consistency while operating globally — changes live in a single `changes/` directory, not per-workspace. This spec defines the contract that all implementations must satisfy.

## Requirements

### Requirement: Inheritance from Repository base

`ChangeRepository` MUST extend `Repository`. The inherited `workspace()`, `ownership()`, and `isExternal()` accessors MUST be present but carry default values — no use case relies on them for `ChangeRepository`. They exist solely to satisfy the shared base contract.

### Requirement: get returns a Change or null

`get(name)` MUST accept a change name string and return the `Change` with that name, or `null` if no change with that name exists. The returned `Change` MUST have its artifact statuses derived at load time by comparing the current file hash against the stored `validatedHash` (see `specs/core/change/spec.md` — Requirement: Artifacts). A hash mismatch MUST reset the artifact status to `in-progress`.

### Requirement: list returns active changes in creation order

`list()` MUST return all active (non-drafted, non-discarded) changes sorted by creation order, oldest first. Each returned `Change` MUST include artifact state (derived statuses) but MUST NOT include artifact content. Content is loaded on demand via `artifact()`.

### Requirement: listDrafts returns drafted changes in creation order

`listDrafts()` MUST return all drafted (shelved) changes sorted by creation order, oldest first. Each returned `Change` MUST include artifact state but MUST NOT include artifact content.

### Requirement: listDiscarded returns discarded changes in creation order

`listDiscarded()` MUST return all discarded changes sorted by creation order, oldest first. Each returned `Change` MUST include artifact state but MUST NOT include artifact content.

### Requirement: save persists the change manifest only

`save(change)` MUST persist the change manifest — state, artifact statuses, validated hashes, history events, and approvals. It MUST NOT write artifact file content. Artifact content is written exclusively via `saveArtifact()`. The write MUST be atomic (e.g. temp file + rename) to prevent partial reads.

### Requirement: delete removes the entire change directory

`delete(change)` MUST remove the entire change directory and all its contents from the filesystem.

### Requirement: artifact loads content with originalHash

`artifact(change, filename)` MUST load the content of a single artifact file within a change and return a `SpecArtifact`. The returned artifact's `originalHash` MUST be set to the `sha256` hash of the content read from disk, enabling conflict detection on subsequent saves. If the file does not exist, the method MUST return `null`.

### Requirement: saveArtifact with optimistic concurrency

`saveArtifact(change, artifact, options?)` MUST write an artifact file within a change directory. If `artifact.originalHash` is set, the implementation MUST compare it against the current hash of the file on disk before writing. If the hashes differ, the save MUST be rejected by throwing `ArtifactConflictError` — this prevents silently overwriting concurrent modifications. When `options.force` is `true`, the conflict check MUST be skipped and the file MUST be overwritten unconditionally. After a successful write, the corresponding `ChangeArtifact` status in the change manifest MUST be reset to `in-progress`; the caller is responsible for calling `save(change)` to persist this state change.

### Requirement: artifactExists checks file presence without loading

`artifactExists(change, filename)` MUST return `true` if the artifact file exists within the change directory, `false` otherwise. It MUST NOT load the file content.

### Requirement: deltaExists checks delta file presence

`deltaExists(change, specId, filename)` MUST return `true` if the specified delta file exists for the given change and spec ID, `false` otherwise. Delta files are located within a subdirectory of the change directory identified by the spec ID.

### Requirement: changePath returns the absolute path to a change directory

`changePath(change)` MUST accept a `Change` and return the absolute filesystem path to that change's directory. This is used by use cases that need the change path for template variable construction (e.g. `change.path` in `TemplateVariables`). The implementation resolves the path from its internal storage layout.

### Requirement: Abstract class with abstract methods

`ChangeRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`get`, `list`, `listDrafts`, `listDiscarded`, `save`, `delete`, `artifact`, `saveArtifact`, `artifactExists`, `deltaExists`, `changePath`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

## Constraints

- Changes are stored globally, not per-workspace — the inherited workspace context is unused
- All list methods return `Change` objects with derived artifact state but without artifact content
- `save()` writes the manifest only; `saveArtifact()` writes file content only — these are separate operations
- `ArtifactConflictError` is the sole error type for concurrent modification detection
- The `force` option on `saveArtifact()` bypasses conflict detection entirely
- `originalHash` on loaded artifacts MUST use `sha256` of the file content as read from disk
- Manifest writes MUST be atomic to prevent corruption from partial reads

## Spec Dependencies

- [`specs/core/repository-port/spec.md`](../repository-port/spec.md) — `Repository` base class, `RepositoryConfig`, shared accessors
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — ports as abstract classes, application layer uses ports only
- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, artifact status derivation, history events
- [`specs/core/storage/spec.md`](../storage/spec.md) — change directory naming, manifest format, atomic writes
- [`specs/core/change-manifest/spec.md`](../change-manifest/spec.md) — manifest structure persisted by `save()`
