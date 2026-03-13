# SpecRepository Port

## Purpose

Use cases need to read and write specs without knowing how or where they are stored on disk, so a port boundary is essential for testability and storage-strategy independence. `SpecRepository` is the application-layer port for reading and writing specs within a single workspace, extending the shared `Repository` base class with immutable `workspace()`, `ownership()`, and `isExternal()` accessors set at construction time. Use cases that need multiple workspaces receive a separate `SpecRepository` instance per workspace.

## Requirements

### Requirement: Inheritance from Repository base

`SpecRepository` MUST extend `Repository`. The `workspace()`, `ownership()`, and `isExternal()` accessors MUST reflect the values provided at construction time and MUST NOT change during the lifetime of the instance.

### Requirement: Workspace scoping

Each `SpecRepository` instance is bound to exactly one workspace. All operations (`get`, `list`, `artifact`, `save`, `delete`, `resolveFromPath`) MUST operate within the scope of that workspace. A use case requiring access to specs in multiple workspaces MUST receive multiple `SpecRepository` instances.

### Requirement: get returns a Spec or null

`get(name)` MUST accept a `SpecPath` and return the `Spec` metadata for that name within this workspace, or `null` if no such spec exists. The returned `Spec` contains only metadata (workspace, name, filenames) — no artifact content is loaded.

### Requirement: list returns spec metadata with optional prefix filter

`list(prefix?)` MUST return all `Spec` metadata in this workspace. When a `SpecPath` prefix is provided, only specs whose path starts with that prefix MUST be returned (e.g. prefix `auth` returns `auth/login`, `auth/oauth`, etc.). The returned `Spec` objects MUST be lightweight — no artifact content is loaded.

### Requirement: artifact loads a single artifact file

`artifact(spec, filename)` MUST load the content of the specified artifact file within the spec directory. It MUST return a `SpecArtifact` with the file content, or `null` if the file does not exist. When loaded from storage, the `SpecArtifact`'s `originalHash` MUST be set to enable conflict detection on subsequent saves.

### Requirement: save persists a single artifact with conflict detection

`save(spec, artifact, options?)` MUST write a single artifact file within the spec directory. If the spec directory does not exist, it MUST be created. If `artifact.originalHash` is set and does not match the current file hash on disk, the save MUST be rejected by throwing `ArtifactConflictError` to prevent silently overwriting concurrent modifications. When `options.force` is `true`, the conflict check MUST be skipped and the file MUST be overwritten unconditionally.

### Requirement: delete removes the entire spec directory

`delete(spec)` MUST remove the entire spec directory and all its artifact files.

### Requirement: resolveFromPath resolves storage paths to spec identity

`resolveFromPath(inputPath, from?)` MUST resolve a storage path to a spec identity within this workspace. The method MUST support both absolute paths and relative spec links. When `inputPath` is relative (e.g. `../storage/spec.md`), `from` MUST be provided as the reference spec. The method MUST return one of three results:

- `{ specPath, specId }` — the path resolved to a spec within this workspace
- `{ crossWorkspaceHint }` — the relative path escaped this workspace; the caller SHOULD try other repositories with the hint segments
- `null` — the input is not a valid spec link

Relative resolution MUST be pure computation (no I/O). Absolute resolution MAY require filesystem access.

### Requirement: Abstract class with abstract methods

`SpecRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`get`, `list`, `artifact`, `save`, `delete`, `resolveFromPath`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

## Constraints

- Each instance is bound to a single workspace; workspace is immutable after construction
- `get` and `list` return lightweight `Spec` metadata — artifact content is never loaded by these methods
- `save` creates the spec directory if it does not already exist
- `ArtifactConflictError` is the sole error type for concurrent modification detection on `save`
- `resolveFromPath` with a relative path and no `from` parameter is invalid and the implementation MUST handle this as an error or return `null`
- `originalHash` on loaded artifacts MUST use `sha256` of the file content as read from disk

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — ports as abstract classes, application layer uses ports only
- [`specs/core/change/spec.md`](../change/spec.md) — Change entity references specIds that resolve to specs managed by this port
- [`specs/core/storage/spec.md`](../storage/spec.md) — storage layer design, filesystem adapter constraints
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace identity and scoping semantics
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical spec ID format used in `resolveFromPath` results
