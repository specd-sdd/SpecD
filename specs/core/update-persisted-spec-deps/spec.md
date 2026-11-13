# UpdatePersistedSpecDeps

## Purpose

Canonical persisted dependencies must be mutable outside the archive pipeline — for correcting a lock after the fact, or for adopting external dependency knowledge that a schema cannot extract from artifacts. `UpdatePersistedSpecDeps` is the application use case that applies list/add/remove/set/clear mutations directly to a spec's persisted `dependsOn` and conditionally persists the result through the shared semantic patch helper.

## Requirements

### Requirement: Input contract

`UpdatePersistedSpecDeps.execute` SHALL accept an `UpdatePersistedSpecDepsInput` with:

- `specId` (required, string) — the spec whose persisted dependencies are being mutated
- `add` (optional, readonly string array) — dependency spec IDs to merge with existing dependencies
- `remove` (optional, readonly string array) — dependency spec IDs to remove from existing dependencies
- `set` (optional, readonly string array) — replaces the entire persisted dependency list
- `clear` (optional, boolean) — replaces the persisted dependency list with an empty array

### Requirement: Mutual exclusivity and minimum operation

`set` and `clear` MUST NOT be combined with each other or with `add`/`remove`. If none of `add`, `remove`, `set`, or `clear` is provided, the use case MUST throw a typed validation error. These rules and the underlying add/remove normalization reuse the mutation semantics extracted from [`core:update-spec-deps`](../update-spec-deps/spec.md), applied to persisted lock state instead of a change's draft `specDependsOn`.

### Requirement: Spec ID validation and existing targets

The use case MUST validate and normalize `specId` and every entry of `add` and `set` with `parseSpecId` and the configured workspaces (the keys of the workspace repository map), per `core:spec-id-format`, before any persisted-state I/O. An invalid ID fails with `InvalidSpecIdError` and an unknown workspace with `WorkspaceNotFoundError`; nothing is written when any entry is invalid. Stored dependencies are always fully qualified.

Persisted dependencies act on existing specs, so every target of `add` and `set` MUST exist in its workspace repository; a missing target fails with `SpecNotFoundError` naming it and nothing is written. A dependency on a spec that does not exist yet belongs in the change (`core:update-spec-deps`), not in the lock. Entries of `remove` that are valid spec IDs are normalized like `add` entries (a bare `auth/shared` matches the stored `default:auth/shared`); entries that are not valid spec IDs are matched literally and are never rejected, so an invalid value already stored can always be removed.

Reading a lock that fails validation raises `InvalidSpecLockError` (`core:spec-lock`), with one exception: `remove`, `set`, and `clear` read the lock with the lenient `dependsOn` read of `core:spec-lock`, which tolerates invalid `dependsOn` entries (and only those) so that they can be removed or replaced. `add` always reads strictly. If, after the mutation, any `dependsOn` entry is still not a valid fully-qualified spec ID, the use case throws `InvalidSpecLockError` naming the failing `dependsOn` field and writes nothing.

### Requirement: Remove is applied before add

When both `remove` and `add` are provided in the same call, removals MUST be processed against the current persisted list before additions. `add` is idempotent — a dependency spec ID already present after removals is not duplicated.

### Requirement: Reading current persisted state

The use case MUST resolve the spec's workspace repository and call `SpecRepository.readPersistedState(spec)` to obtain the current snapshot, including its `originalHash` for optimistic concurrency.

### Requirement: Set and clear create missing persisted state

When persisted state does not exist and the operation is `set` or `clear`, the use case MUST construct an initial base with the effective project schema and a `dependsOn` value equal to the explicitly supplied `set` list, or `[]` for `clear`. It MUST NOT invoke deterministic artifact-based dependency derivation in this case, because the caller has supplied a complete authoritative value.

### Requirement: Non-empty add creates missing persisted state

When persisted state does not exist and `add` is non-empty, the use case MUST resolve an initial base through the same `resolveInitialPersistedDependsOn()` service used by [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md) — deriving `dependsOn` from the current canonical artifact projection under the effective project schema, or `[]` when that schema cannot extract dependencies — then apply `remove` (when provided) to that derived base, then merge `add`, and create the persisted state with `created: true`. A dependency named in `remove` that the derived base contains MUST NOT survive unless the same ID is also in `add`.

### Requirement: Remove and empty add against missing state are no-ops

When persisted state does not exist and the requested operation is `remove` alone, or an `add` whose resulting merge would be empty, the use case MUST NOT create persisted state. It MUST return a result reflecting `dependsOn: []`, `created: false`, and `initialized: false` without calling `writePersistedState`. A `remove` combined with a non-empty `add` is not a no-op and follows "Non-empty add creates missing persisted state".

### Requirement: Applying the mutation through the shared patch helper

Once the effective base (existing snapshot or initial base) and the target `dependsOn` value are determined, the use case MUST call the shared pure `applyPersistedSpecStatePatch()` service with a patch containing only the updated `dependsOn`, and pass the complete resulting `PersistedSpecState` to `SpecRepository.writePersistedState()`.

### Requirement: Conditional write and concurrency

`writePersistedState` MUST be called with `expectedRevision` equal to the `originalHash` observed by `readPersistedState`, or `null` when persisted state was absent. When the repository detects that the observed revision no longer matches the persisted state at write time, the use case MUST propagate `ArtifactConflictError` rather than retrying or silently rebasing the mutation onto a concurrent winner.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`.

### Requirement: Result contract

On success, `execute` SHALL return an `UpdatePersistedSpecDepsResult` containing:

- `specId` — the fully-qualified spec identity
- `dependsOn` — the resulting persisted dependency list after the mutation
- `created` — `true` when persisted state was newly created by this call, `false` otherwise
- `initialized` — `true` when persisted state exists after the call, `false` when it does not (the only case is a `remove` or empty `add` against a spec with no persisted state, which is a no-op)

Delivery adapters MUST use `initialized`, not an assumption, to tell a no-op on an uninitialized spec apart from a mutation of existing state.

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecDepsDeps

The config-based `createUpdatePersistedSpecDeps(config, options?)` form MUST derive `UpdatePersistedSpecDepsDeps` through `resolveUpdatePersistedSpecDepsDeps(resolver)` and then delegate to canonical `createUpdatePersistedSpecDeps(deps)`.

`resolveUpdatePersistedSpecDepsDeps(resolver)` MUST resolve:

- `specRepositories: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace
- `getActiveSchema: GetActiveSchema`
- `parsers: ArtifactParserRegistry`
- `extractorTransforms: ExtractorTransformRegistry`
- `contentHasher: ContentHasher`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case never mutates a change's draft `specDependsOn`; it mutates only canonical persisted lock state
- This use case MUST NOT import dependency values from persisted metadata under any circumstance
- readOnly workspace ownership MUST reject the write with `ReadOnlyWorkspaceError` before any persisted-state I/O
- The use case does not resolve actor identity — persisted dependency updates are not recorded as actor-attributed events
- Spec ID validation and target existence checks run before any persisted-state write

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState`, `writePersistedState`, and conditional persisted-state writes
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
- [`core:update-spec-deps`](../update-spec-deps/spec.md) — source of the reused add/remove/set mutation and validation semantics
- [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md) — shared `resolveInitialPersistedDependsOn()` service used for incidental first-state creation
