# core:initialize-persisted-spec-state

## Purpose

Imported repositories and specs created before persisted lock state existed have no `spec-lock.json`, and incidental lock creation as a side effect of a mutating command is not sufficient for deliberately adopting an existing spec, or a whole repository of specs, under an explicitly chosen schema. `InitializePersistedSpecState` is the explicit, one-time adoption operation that creates persisted semantic state for one lock-less spec or a batch of lock-less specs, deriving initial dependencies from current artifacts rather than from any cache snapshot.

## Requirements

### Requirement: Input shape

`InitializePersistedSpecState.execute()` MUST accept an `InitializePersistedSpecStateInput`:

- `target` — either `{ kind: 'spec', specId }` for a single spec, or `{ kind: 'all', workspaces? }` for a batch, optionally scoped to the given workspace names;
- `schemaRef` — optional; when provided, selects the schema to initialize under explicitly.

### Requirement: Schema selection

When `schemaRef` is provided, the use case MUST resolve that schema explicitly. When `schemaRef` is omitted, the use case MUST use the effective project schema.

One invocation MUST resolve and apply exactly one schema across its entire target set. Repositories or subsets that require different schemas MUST run targeted initialization separately with a different `schemaRef`.

### Requirement: Per-target initialization algorithm

For each target spec, `InitializePersistedSpecState` MUST:

1. resolve the schema once through Core composition (shared across the whole invocation, not re-resolved per spec) and derive canonical schema identity via `schema.canonicalSpecSchema()`;
2. discover the raw spec identity without materializing metadata;
3. read the aggregate persisted-state snapshot for that spec;
4. reject the target with `SpecAlreadyInitializedError` if any persisted state already exists, regardless of whether its schema identity matches the selected schema;
5. load the schema-declared canonical `scope: spec` artifacts for that spec and verify that they can be parsed under the selected schema;
6. resolve initial dependencies through the shared `resolveInitialPersistedDependsOn()` service;
7. call `applyPersistedSpecStatePatch()` with an `{ kind: 'initial', schema: canonicalSpecSchema, dependsOn }` base and an empty patch;
8. conditionally write the resulting complete state with `expectedRevision: null`.

### Requirement: No import from generated metadata

Initialization MUST NOT import dependency, optimization, or implementation values from any persisted metadata cache. It MUST create `implementation: []`, MUST omit `optimizations`, and MUST derive `dependsOn` only from the current artifact projection under the selected schema.

### Requirement: No eager metadata materialization

`InitializePersistedSpecState` MUST NOT eagerly materialize or persist a metadata projection as part of initialization. The lock write alone is sufficient; the next normal metadata consumer self-heals any cache made stale by the new lock's existence.

### Requirement: Initial dependency resolution rules

For a target with no existing persisted state, initial `dependsOn` MUST be resolved as:

1. when a complete dependency value is explicitly supplied by the caller (for example through an accompanying `deps set`/`deps clear` intent or an archive publication plan), that value wins;
2. otherwise, the `dependsOn` from the fresh deterministic projection of the current canonical artifacts under the selected schema;
3. when the selected schema's extraction cannot produce a `dependsOn` value from those artifacts, `[]`.

This resolution MUST reuse the deterministic projection logic behind `GenerateSpecMetadata` directly rather than persisting an intermediate cache entry, and MUST NOT read a persisted metadata snapshot as an input.

### Requirement: One-time operation, no force or reassignment path

Initialization MUST be a one-time operation. It MUST NOT expose a `--force` option and MUST NOT expose a schema-reassignment path.

A single-spec request (`target.kind: 'spec'`) against a spec that already has persisted state MUST fail with `SpecAlreadyInitializedError`, regardless of whether the caller's `schemaRef` matches the existing persisted schema.

### Requirement: Batch selection and result reporting

For `target.kind: 'all'`, the use case MUST first select only specs that currently have no persisted state (optionally scoped by `workspaces`). It MUST NOT attempt to reinitialize specs that already have persisted state.

The batch MUST continue processing across all eligible (lock-less) targets even if some fail, and MUST return a result containing:

- `initialized` — the specs successfully given persisted state;
- `failed` — the specs that were eligible but failed during initialization, with per-spec failure detail;
- `existingSkipped` — a count of specs that already had persisted state and were therefore excluded from the eligible set.

If at least one eligible entry fails, the overall batch outcome MUST be reported as a failure, even though other eligible entries may have succeeded.

A read-only workspace target MUST surface as a failure for the affected spec(s) rather than being silently skipped or silently counted as `existingSkipped`.

### Requirement: Concurrency

The conditional write in step 8 MUST use `expectedRevision: null`, meaning the write MUST fail if persisted state for that spec already exists at write time. This closes the creation race between concurrent initializers of the same lock-less spec.

### Requirement: Construction and composition

`InitializePersistedSpecState` MUST follow the standard Core use-case and composition contract: a class with an async `execute(input)` method, explicit constructor dependencies, and a composition module exposing:

- `InitializePersistedSpecStateDeps`
- `resolveInitializePersistedSpecStateDeps(resolver: CompositionResolver): InitializePersistedSpecStateDeps`
- `createInitializePersistedSpecState(deps): InitializePersistedSpecState`
- `createInitializePersistedSpecState(config: SpecdConfig, options?: CompositionResolutionOptions): InitializePersistedSpecState`

`resolveInitializePersistedSpecStateDeps(resolver)` MUST resolve at least:

- workspace `SpecRepository` instances
- `ListWorkspaces`
- schema resolution via `GetActiveSchema`
- the shared `resolveInitialPersistedDependsOn()` service (itself built on `GenerateSpecMetadata`'s deterministic projection and content extraction)

The config-based `createInitializePersistedSpecState(config, options?)` form MUST create one `CompositionResolver`, derive dependencies through `resolveInitializePersistedSpecStateDeps(resolver)`, and delegate to the canonical `createInitializePersistedSpecState(deps)` form.

`InitializePersistedSpecState`, its `Input`/`Result` types, `Deps`, and `create*` factory MUST be exported through the Core public surface, re-exported by the SDK, and exposed on `Kernel.specs` as `initializePersistedState`.

## Constraints

- `InitializePersistedSpecState` creates persisted semantic state for artifacts that already exist; it MUST NOT create spec artifacts itself.
- The shared `resolveInitialPersistedDependsOn()` service used here MUST also be the one used by incidental first-lock creation in other mutation use cases and by `ArchiveChange`; this rule MUST NOT be reimplemented independently in this use case.
- Initialization MUST NOT construct the legacy fallback `{ schema: { name: 'unknown', version: 0 } }`.

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — aggregate persisted-state read and conditional complete-state write
- [`core:spec-lock`](../spec-lock/spec.md) — the persisted state shape being created
- [`core:schema-format`](../schema-format/spec.md) — schema-declared canonical `scope: spec` artifacts used to verify parseability
- [`core:get-active-schema`](../get-active-schema/spec.md) — resolving the effective or explicitly referenced schema
- [`core:content-extraction`](../content-extraction/spec.md) — deterministic extraction reused for initial dependency projection
- [`core:list-workspaces`](../list-workspaces/spec.md) — batch target discovery for `target.kind: 'all'`
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing for single-spec targets
- [`core:composition-resolver`](../composition-resolver/spec.md) — shared resolver used by the config-based factory
- [`core:generate-metadata`](../generate-metadata/spec.md) — deterministic projection logic reused by `resolveInitialPersistedDependsOn()`
