# UpdatePersistedSpecOptimizations

## Purpose

Optimized fields are durable authoring decisions, so setting or clearing them must capture the exact artifact and schema baseline they were produced from — never a stale or borrowed one. `UpdatePersistedSpecOptimizations` is the application use case that sets or clears `optimizedDescription` and `optimizedContext` on a spec's persisted semantic state, capturing a fresh baseline only for the fields an operation actually changes.

## Requirements

### Requirement: Input contract

`UpdatePersistedSpecOptimizations.execute` SHALL accept an `UpdatePersistedSpecOptimizationsInput` with:

- `specId` (required, string) — the spec whose persisted optimizations are being mutated
- `set` (optional, object) — a partial map of `optimizedDescription` and/or `optimizedContext` string values to persist
- `clear` (optional, readonly array of `'optimizedDescription' | 'optimizedContext'`) — field names to remove

### Requirement: Mutual exclusivity and minimum operation

`set` and `clear` MUST NOT be provided together. If neither is provided, or `set` is an empty object, or `clear` is an empty array, the use case MUST throw a typed validation error.

### Requirement: Set captures a fresh baseline per changed field

For each field key present in `set`, the use case MUST record:

- `value` — the exact provided string
- `schema` — the spec's current persisted schema identity when persisted state already exists, or the effective project schema when persisted state is being created by this call
- `artifactState` — the current baseline: every present schema-declared `scope: spec` artifact for `specId`, sorted by filename, with each entry's raw UTF-8 SHA-256 content hash and `lastModified`, obtained via `SpecRepository.artifactMeta()`

Fields present in `set` MUST have a freshly captured baseline. Fields not present in `set` MUST retain their previously persisted value and baseline unchanged — updating one field never refreshes the other.

### Requirement: Set creates missing persisted state

When persisted state does not exist and `set` is provided, the use case MUST resolve an initial base through the same `resolveInitialPersistedDependsOn()` service used by [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md), then apply the requested field values as a patch on top of that initial base.

### Requirement: Clear removes selected fields

For each field name in `clear`, the use case MUST remove that field from the persisted `optimizations` block when present. A field name in `clear` that is already absent from the persisted `optimizations` block is a no-op for that field and MUST NOT be treated as an error.

When clearing removes the last remaining optimization field, the use case MUST omit the `optimizations` block entirely from the resulting persisted state rather than leaving an empty object.

### Requirement: Clear against missing persisted state is a no-op

When persisted state does not exist and `clear` is provided, the use case MUST NOT create persisted state. It MUST return a result with no `optimizations` and `created: false` without calling `writePersistedState`.

### Requirement: Applying the mutation through the shared patch helper

The use case MUST pass the resulting `optimizations` value as a patch to the shared pure `applyPersistedSpecStatePatch()` service, then pass the complete resulting `PersistedSpecState` to `SpecRepository.writePersistedState()` with `expectedRevision` equal to the observed `originalHash`, or `null` when persisted state was absent.

### Requirement: Conflict handling

When the repository detects that the observed revision no longer matches the persisted state at write time, the use case MUST propagate `ArtifactConflictError` rather than retrying or silently rebasing the mutation.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`.

### Requirement: Result contract

On success, `execute` SHALL return an `UpdatePersistedSpecOptimizationsResult` containing:

- `specId` — the fully-qualified spec identity
- `optimizations` — the resulting persisted optimization values (without baseline detail) after the mutation, or absent when none remain
- `created` — `true` when persisted state was newly created by this call, `false` otherwise

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps

The config-based `createUpdatePersistedSpecOptimizations(config, options?)` form MUST derive `UpdatePersistedSpecOptimizationsDeps` through `resolveUpdatePersistedSpecOptimizationsDeps(resolver)` and then delegate to canonical `createUpdatePersistedSpecOptimizations(deps)`.

`resolveUpdatePersistedSpecOptimizationsDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace
- `initializePersistedSpecState` collaborator sufficient to invoke `resolveInitialPersistedDependsOn()` for the set creation path

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case never validates or interprets the effective `llmOptimizedContext` project configuration flag — gating optimizer-driven writes to that flag is the responsibility of the calling skill or agent template, not this use case
- This use case does not regenerate, read, or invalidate generated metadata — freshness of the write result follows directly from the freshly captured baseline
- readOnly workspace ownership MUST reject the write with `ReadOnlyWorkspaceError` before any persisted-state I/O
- `set` accepts arbitrary caller-supplied strings; this use case performs no LLM invocation and has no opinion on how the value was produced

## Spec Dependencies

- [`core:spec-optimization`](../spec-optimization/spec.md) — persisted optimization field shape and artifact/schema baseline construction
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState`, `artifactMeta()`, `writePersistedState`, and conditional persisted-state writes
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
- [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md) — shared `resolveInitialPersistedDependsOn()` service used for incidental first-state creation
