# UpdatePersistedSpecImplementation

## Purpose

Archived implementation traceability sometimes needs correction outside the change lifecycle — a rename missed by materialization, or a symbol link added after the fact. `UpdatePersistedSpecImplementation` is the canonical-spec counterpart of change-time implementation tracking: it adds, enriches, or removes implementation links directly on a spec's persisted semantic state, using the same file-existence and link-normalization discipline as change tracking, but operating on canonical `workspace:path` identities instead of raw project-relative paths.

## Requirements

### Requirement: Input contract

`UpdatePersistedSpecImplementation.execute` SHALL accept an `UpdatePersistedSpecImplementationInput` with:

- `specId` (required, string) — the spec whose persisted implementation links are being mutated
- `action` (required, `'add' | 'remove'`)
- `file` (required, string) — a project-relative file path, relative to the codeRoot of `specId`'s workspace
- `symbols` (optional, readonly string array) — symbol refinements for the link

### Requirement: Spec ID validation

Before workspace resolution, schema resolution, artifact reads, or persisted-state I/O, the use case MUST validate and normalize `specId` with `parseSpecId` and the configured workspaces (see `core:spec-id-format`). A bare path is resolved to the `default` workspace, so the input accepts a bare or fully-qualified valid ID, and every `specId` in the result is the fully-qualified form. An invalid ID fails with `InvalidSpecIdError` and an unknown workspace with `WorkspaceNotFoundError`, quoting the full original value, and nothing is written. Delivery adapters pass the raw string and perform no validation of their own.

### Requirement: File must exist for add

When `action = 'add'`, the use case MUST require the target file to exist on disk within the codeRoot of `specId`'s workspace. When it does not, the use case MUST throw `ImplementationFileNotFoundError` and MUST NOT mutate persisted state.

### Requirement: Canonical file identity and workspace confinement

Before mutating persisted state, the use case MUST normalize `file` into the canonical `workspace:path` implementation identity defined by [`core:spec-lock`](../spec-lock/spec.md): forward-slash-normalized, relative to the codeRoot of `specId`'s workspace, using workspace lookup from [`core:workspace`](../workspace/spec.md) and path resolution from [`core:storage`](../storage/spec.md).

Confinement MUST be decided by a path-relative containment test: the resolved path relative to the codeRoot MUST NOT be empty, MUST NOT be `..` or start with `..` followed by a path separator (a name such as `..foo/x` is a legitimate path inside the codeRoot), and MUST NOT be absolute. A bare string-prefix comparison is not acceptable, because a sibling directory whose name starts with the codeRoot's name (for example `/repo/core-evil` next to `/repo/core`) is outside the codeRoot. The same test applies to a `file` that already carries a `workspace:` qualifier: `core:../x` and `core:../../etc/passwd` resolve against the codeRoot of the named workspace and are rejected when they leave it. A qualifier naming a workspace other than the one implied by `specId` is also outside the boundary. Because workspace names have at least two characters, a leading single letter followed by `:` (a Windows drive such as `C:\x`) is never read as a workspace qualifier; it is treated as an absolute host path and confined like any other.

When `file` resolves outside the codeRoot implied by `specId`'s workspace, the use case MUST throw `ImplementationWorkspaceBoundaryError` and MUST NOT mutate persisted state. It MUST NOT silently coerce or drop an out-of-boundary path. The file-existence check for `add` runs only on a path that passed confinement.

### Requirement: Add creates or enriches a canonical link

When `action = 'add'`, the use case MUST create or enrich the confirmed implementation link for the normalized `file` identity, using symbol refinements when `symbols` is provided.

When `symbols` is provided, the use case MUST add those symbols to the link's symbol set without discarding previously recorded symbols for the same file. When `symbols` is omitted, the use case MUST ensure a file-level link exists (an entry with no `symbols` field) without altering any existing symbol-level entries for that file.

### Requirement: Remove removes canonical links

When `action = 'remove'` and `symbols` is provided, the use case MUST remove only those symbol names from the link's symbol set for the normalized `file` identity. When the remaining symbol set becomes empty and no explicit file-level link was separately recorded, the use case MAY remove the entry entirely.

When `action = 'remove'` and `symbols` is omitted, the use case MUST remove the whole implementation entry for the normalized `file` identity, including any symbol-level refinements.

### Requirement: Add creates missing persisted state

When persisted state does not exist and `action = 'add'`, the use case MUST resolve an initial base through the same `resolveInitialPersistedDependsOn()` service used by [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md), defaulting `implementation` to `[]` before applying the requested link addition.

### Requirement: Remove against missing state is a no-op

When persisted state does not exist and `action = 'remove'`, the use case MUST NOT create persisted state. It MUST return a result reflecting `implementation: []` and `created: false` without calling `writePersistedState`.

### Requirement: Applying the mutation through the shared patch helper

The use case MUST compute the resulting `implementation` array and pass it as a patch to the shared pure `applyPersistedSpecStatePatch()` service, then pass the complete resulting `PersistedSpecState` to `SpecRepository.writePersistedState()` with `expectedRevision` equal to the observed `originalHash`, or `null` when persisted state was absent.

### Requirement: Conflict handling

When the repository detects that the observed revision no longer matches the persisted state at write time, the use case MUST propagate `ArtifactConflictError` rather than retrying or silently rebasing the mutation.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`.

### Requirement: Result contract

On success, `execute` SHALL return an `UpdatePersistedSpecImplementationResult` containing:

- `specId` — the fully-qualified spec identity
- `implementation` — the resulting persisted implementation link list after the mutation
- `created` — `true` when persisted state was newly created by this call, `false` otherwise

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecImplementationDeps

The config-based `createUpdatePersistedSpecImplementation(config, options?)` form MUST derive `UpdatePersistedSpecImplementationDeps` through `resolveUpdatePersistedSpecImplementationDeps(resolver)` and then delegate to canonical `createUpdatePersistedSpecImplementation(deps)`.

`resolveUpdatePersistedSpecImplementationDeps(resolver)` MUST resolve:

- `specRepositories: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace
- `listWorkspaces: ListWorkspaces` — workspace configuration lookup used to resolve `codeRoot` for path normalization
- `files: FileReader` — used for file-existence checks
- `getActiveSchema: GetActiveSchema`
- `parsers: ArtifactParserRegistry`
- `extractorTransforms: ExtractorTransformRegistry`
- `contentHasher: ContentHasher`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case never mutates a change's draft `trackedImplementationFiles` or in-progress confirmed links; it mutates only canonical persisted lock state
- readOnly workspace ownership MUST reject the write with `ReadOnlyWorkspaceError` before any persisted-state I/O
- Link normalization and symbol-refinement rules mirror change-tracking behavior but always operate on the canonical `workspace:path` identity, never on raw project-relative paths in storage

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState`, `writePersistedState`, and conditional persisted-state writes
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
- [`core:update-implementation-tracking`](../update-implementation-tracking/spec.md) — source of the reused add/enrich/remove link semantics
- [`core:storage`](../storage/spec.md) — path resolution and repository rooting
- [`core:workspace`](../workspace/spec.md) — codeRoot and workspace boundary semantics
- [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md) — shared `resolveInitialPersistedDependsOn()` service used for incidental first-state creation
