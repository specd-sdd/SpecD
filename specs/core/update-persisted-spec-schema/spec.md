# UpdatePersistedSpecSchema

## Purpose

Repositories occasionally need to rebind a spec's persisted state to a different, compatible schema — for example after adopting an externally authored format — without conflating that explicit decision with initial adoption or accidentally discarding canonical dependencies, implementation links, or optimization history. `UpdatePersistedSpecSchema` is the explicit, guarded reassignment operation: it requires an already-initialized spec, verifies compatibility with the target schema, and never silently fabricates or drops persisted values.

## Requirements

### Requirement: Input contract

`UpdatePersistedSpecSchema.execute` SHALL accept an `UpdatePersistedSpecSchemaInput` with:

- `specId` (required, string) — the spec whose persisted schema is being reassigned
- `schemaRef` (required, string) — a resolvable schema reference for the target schema

Unlike [`core:initialize-persisted-spec-state`](../initialize-persisted-spec-state/spec.md), `schemaRef` has no effective-project-schema fallback: reassignment is always explicit.

### Requirement: Requires an existing lock; never creates one

The use case MUST call `SpecRepository.readPersistedState(spec)` before doing anything else. When it returns `null`, `execute` SHALL throw `SpecNotInitializedError` identifying `specId`. This use case MUST NOT create persisted state and MUST NOT delegate to `InitializePersistedSpecState` or any initial-base construction path.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`. This check MUST occur before the initialization check.

### Requirement: Resolving the target schema

The use case MUST resolve `schemaRef` to a `Schema` through `GetActiveSchema` in `{ mode: 'ref', ref: schemaRef }` mode. It MUST NOT apply project plugins or overrides beyond what `GetActiveSchema` performs for ref-mode resolution.

### Requirement: Loading and parsing declared artifacts under the target schema

The use case MUST load the spec's current schema-declared canonical artifacts and verify that they parse successfully under the resolved target schema, using the same parsing and content-extraction infrastructure used by deterministic metadata projection. A parse failure under the target schema MUST abort the reassignment with a typed error and MUST NOT mutate persisted state.

### Requirement: Selecting the already-persisted schema is a no-op

When the resolved target schema identity equals the spec's currently persisted schema identity, the use case MUST treat the call as a semantic no-op: it MUST NOT perform dependency-conflict validation, MUST NOT write persisted state, and MUST return the unchanged current schema identity with `changed: false`.

### Requirement: Dependency compatibility when the target schema does not extract dependencies

When the resolved target schema does not declare dependency extraction for the spec's artifacts, the use case MUST preserve the spec's current canonical `dependsOn` list unchanged in the reassigned state.

### Requirement: Dependency compatibility when the target schema extracts dependencies

When the resolved target schema declares dependency extraction for the spec's artifacts, the use case MUST extract the dependency list from the current artifacts under the target schema.

When the extracted list is not equal to the spec's current canonical `dependsOn` list, the use case MUST throw `PersistedSchemaDependencyConflictError` identifying `specId`, the current dependencies, and the extracted dependencies. It MUST NOT silently adopt the extracted value and MUST NOT mutate persisted state. Users change dependencies explicitly through [`core:update-persisted-spec-deps`](../update-persisted-spec-deps/spec.md), never as a side effect of schema selection.

When the extracted list equals the current canonical `dependsOn` list, reassignment proceeds using the current `dependsOn` value unchanged.

### Requirement: Implementation and optimization values are preserved verbatim

Reassignment MUST preserve the spec's current `implementation` links and `optimizations` block unchanged — including each optimization field's recorded `value` and `artifactState` baseline. The use case MUST NOT clear, regenerate, or re-baseline optimizations as part of a schema change.

Because each optimization field's baseline records the schema identity it was captured under, a successful reassignment makes any existing optimization field stale relative to the new persisted schema; freshness reported by [`core:get-persisted-spec-optimizations`](../get-persisted-spec-optimizations/spec.md) reflects this automatically without any special-casing in this use case.

### Requirement: Constructing and writing the reassigned state

The generic `applyPersistedSpecStatePatch()` helper rejects schema replacement on an existing base. `UpdatePersistedSpecSchema` MUST NOT use that generic path to change `schema`. After the compatibility checks in this spec succeed, it MUST construct the complete resulting `PersistedSpecState` directly — new `schema`, the `dependsOn` value determined above, and the preserved `implementation`/`optimizations` — and pass it to `SpecRepository.writePersistedState()` with `expectedRevision` equal to the `originalHash` observed by the initial `readPersistedState` call.

No other use case in this change may construct a complete persisted state with a schema different from an existing snapshot's schema.

### Requirement: Conflict handling

When the repository detects that the observed revision no longer matches the persisted state at write time, the use case MUST propagate `ArtifactConflictError` rather than retrying or silently rebasing the reassignment.

### Requirement: Result contract

On success, `execute` SHALL return an `UpdatePersistedSpecSchemaResult` containing:

- `specId` — the fully-qualified spec identity
- `schema` — the resulting persisted schema identity
- `dependsOn` — the resulting persisted dependency list
- `changed` — `false` when the target schema equaled the previously persisted schema, `true` otherwise

### Requirement: Config-based factory delegates through resolveUpdatePersistedSpecSchemaDeps

The config-based `createUpdatePersistedSpecSchema(config, options?)` form MUST derive `UpdatePersistedSpecSchemaDeps` through `resolveUpdatePersistedSpecSchemaDeps(resolver)` and then delegate to canonical `createUpdatePersistedSpecSchema(deps)`.

`resolveUpdatePersistedSpecSchemaDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace
- `getActiveSchema: GetActiveSchema`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This operation rebinds compatible existing artifacts to a new schema identity; it MUST NOT attempt to transform artifact content between incompatible formats — that remains a separate future migration capability
- readOnly workspace ownership MUST reject the write with `ReadOnlyWorkspaceError` before any persisted-state I/O
- This use case MUST NOT import dependency values from persisted metadata under any circumstance
- `specs init` and `UpdatePersistedSpecSchema` are mutually exclusive entry points: initialization never rewrites an existing lock, and this use case never creates one

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState`, `writePersistedState`, and conditional persisted-state writes
- [`core:spec-lock`](../spec-lock/spec.md) — persisted schema identity, dependency, implementation, and optimization shape being reassigned
- [`core:schema-format`](../schema-format/spec.md) — schema `metadataExtraction`/dependency-extraction declarations used to determine compatibility
- [`core:get-active-schema`](../get-active-schema/spec.md) — ref-mode schema resolution for `schemaRef`
- [`core:content-extraction`](../content-extraction/spec.md) — extraction infrastructure used to derive dependencies under the target schema
- [`core:spec-optimization`](../spec-optimization/spec.md) — optimization field and baseline shape preserved verbatim during reassignment
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
- [`core:composition-resolver`](../composition-resolver/spec.md) — normalized public composition path for the factory
