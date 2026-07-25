# GetPersistedSpecImplementation

## Purpose

Reviewers and tooling that need to know which files and symbols a spec's archived implementation is anchored to must read the canonical `spec-lock.json` record, not a regenerated metadata projection. `GetPersistedSpecImplementation` is the read-only application use case that exposes the persisted implementation links recorded in a spec's persisted semantic state.

## Requirements

### Requirement: Input contract

`GetPersistedSpecImplementation.execute` SHALL accept a `GetPersistedSpecImplementationInput` with:

- `specId` (required, string) — the fully-qualified spec identity to read

### Requirement: Reads persisted state through the repository port

The use case MUST resolve the spec's workspace repository and call `SpecRepository.readPersistedState(spec)`. It MUST NOT read `spec-lock.json` directly and MUST NOT materialize or read generated metadata to answer this query.

### Requirement: Result contract for an initialized spec

When persisted state exists, `execute` SHALL return a `GetPersistedSpecImplementationResult` containing:

- `specId` — the fully-qualified spec identity
- `implementation` — the exact `readonly PersistedImplementationLink[]` recorded in the persisted state snapshot, in stored order
- `initialized` — `true`

Each `PersistedImplementationLink` MUST preserve the distinction between a file-level link (`symbols` absent) and a symbol-level link (`symbols` present and non-empty), unchanged from storage.

### Requirement: Result contract for a spec with no persisted state

When `readPersistedState` returns `null`, `execute` SHALL return a `GetPersistedSpecImplementationResult` with `implementation: []` and `initialized: false`. The use case MUST NOT create persisted state as a side effect of this read.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`.

### Requirement: Config-based factory delegates through resolveGetPersistedSpecImplementationDeps

The config-based `createGetPersistedSpecImplementation(config, options?)` form MUST derive `GetPersistedSpecImplementationDeps` through `resolveGetPersistedSpecImplementationDeps(resolver)` and then delegate to canonical `createGetPersistedSpecImplementation(deps)`.

`resolveGetPersistedSpecImplementationDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case is read-only — it never creates, mutates, or writes persisted state
- The returned `implementation` list is the durable archived traceability record; it MUST NOT be confused with autodetected candidates or in-progress change tracking state
- readOnly workspace ownership does not affect this operation — reads are always permitted

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState` and workspace-scoped repository access
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
