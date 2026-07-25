# GetPersistedSpecDeps

## Purpose

Commands and diagnostics that need the canonical, lock-owned dependency list for a spec must not read `spec-lock.json` directly or infer dependencies from generated metadata. `GetPersistedSpecDeps` is the single read-only application use case that exposes the persisted `dependsOn` list recorded in a spec's persisted semantic state.

## Requirements

### Requirement: Input contract

`GetPersistedSpecDeps.execute` SHALL accept a `GetPersistedSpecDepsInput` with:

- `specId` (required, string) — the fully-qualified spec identity to read

### Requirement: Reads persisted state through the repository port

The use case MUST resolve the spec's workspace repository and call `SpecRepository.readPersistedState(spec)`. It MUST NOT read `spec-lock.json` or any adapter-owned sidecar directly, and MUST NOT read or materialize generated metadata to answer this query.

### Requirement: Result contract for an initialized spec

When persisted state exists, `execute` SHALL return a `GetPersistedSpecDepsResult` containing:

- `specId` — the fully-qualified spec identity
- `dependsOn` — the exact `readonly string[]` recorded in the persisted state snapshot, in stored order

The use case MUST NOT reorder, deduplicate, or otherwise transform the stored list before returning it.

### Requirement: Result contract for a spec with no persisted state

When `readPersistedState` returns `null`, `execute` SHALL return a `GetPersistedSpecDepsResult` with `dependsOn: []` and an `initialized: false` flag. When persisted state exists, `initialized` SHALL be `true`.

The use case MUST NOT create persisted state as a side effect of this read, and MUST NOT fall back to a deterministic artifact projection to synthesize a value for an uninitialized spec.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw a typed `SpecdError` subclass identifying the unresolved spec, rather than returning an empty result.

### Requirement: Config-based factory delegates through resolveGetPersistedSpecDepsDeps

The config-based `createGetPersistedSpecDeps(config, options?)` form MUST derive `GetPersistedSpecDepsDeps` through `resolveGetPersistedSpecDepsDeps(resolver)` and then delegate to canonical `createGetPersistedSpecDeps(deps)`.

`resolveGetPersistedSpecDepsDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case is read-only — it never creates, mutates, or writes persisted state
- The returned `dependsOn` list is the canonical persisted value; it MUST NOT be confused with a deterministic dependency projection derived from current artifacts
- readOnly workspace ownership does not affect this operation — reads are always permitted

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState` and workspace-scoped repository access
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
