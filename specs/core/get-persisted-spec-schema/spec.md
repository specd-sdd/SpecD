# GetPersistedSpecSchema

## Purpose

Compatibility decisions — whether a spec can be safely reassigned to a different schema, or whether a consumer needs to branch on schema-specific behaviour — depend on knowing exactly which schema identity was recorded when the spec was initialized. `GetPersistedSpecSchema` is the read-only application use case that returns the schema identity assigned by a spec's persisted semantic state.

## Requirements

### Requirement: Input contract

`GetPersistedSpecSchema.execute` SHALL accept a `GetPersistedSpecSchemaInput` with:

- `specId` (required, string) — the fully-qualified spec identity to read

### Requirement: Reads persisted state through the repository port

The use case MUST resolve the spec's workspace repository and call `SpecRepository.readPersistedState(spec)`. It MUST NOT read `spec-lock.json` directly and MUST NOT materialize or read generated metadata to answer this query.

### Requirement: Requires an initialized spec

`schema get` reads a value that only exists once a spec has been initialized. When `readPersistedState` returns `null`, `execute` SHALL throw `SpecNotInitializedError` identifying `specId`, rather than returning a partial or default schema identity.

### Requirement: Result contract

When persisted state exists, `execute` SHALL return a `GetPersistedSpecSchemaResult` containing:

- `specId` — the fully-qualified spec identity
- `schema` — the exact `PersistedSchemaIdentity` (`{ name, version }`) recorded in the persisted state snapshot

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`. This check MUST occur before the initialization check, so an unknown spec is never reported as merely uninitialized.

### Requirement: Config-based factory delegates through resolveGetPersistedSpecSchemaDeps

The config-based `createGetPersistedSpecSchema(config, options?)` form MUST derive `GetPersistedSpecSchemaDeps` through `resolveGetPersistedSpecSchemaDeps(resolver)` and then delegate to canonical `createGetPersistedSpecSchema(deps)`.

`resolveGetPersistedSpecSchemaDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case is read-only — it never creates, mutates, or writes persisted state
- This use case never resolves or validates a schema reference; it only reports the identity already recorded in persisted state
- readOnly workspace ownership does not affect this operation — reads are always permitted

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState` and workspace-scoped repository access
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
