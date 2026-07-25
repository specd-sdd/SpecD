# GetPersistedSpecOptimizations

## Purpose

An optimized field is only useful to a consumer if it can be trusted, so reading persisted optimizations must expose freshness alongside value. `GetPersistedSpecOptimizations` is the read-only application use case that returns the lock-owned `optimizedDescription` and `optimizedContext` fields together with per-field and aggregate freshness, computed against the spec's current artifacts and schema — without regenerating or mutating anything.

## Requirements

### Requirement: Input contract

`GetPersistedSpecOptimizations.execute` SHALL accept a `GetPersistedSpecOptimizationsInput` with:

- `specId` (required, string) — the fully-qualified spec identity to read
- `field` (optional, `'optimizedDescription' | 'optimizedContext'`) — when provided, restricts the result to that single field

### Requirement: Reads persisted state through the repository port

The use case MUST resolve the spec's workspace repository and call `SpecRepository.readPersistedState(spec)` to obtain the persisted `optimizations` block, if any. It MUST NOT read `spec-lock.json` directly and MUST NOT materialize or read generated metadata to answer this query.

### Requirement: Result contract for a spec with no persisted state

When `readPersistedState` returns `null`, `execute` SHALL return a `GetPersistedSpecOptimizationsResult` with `initialized: false`, no fields, and `fresh: false`.

### Requirement: Result contract for an initialized spec with no optimizations

When persisted state exists but has no `optimizations` block, or the requested `field` is absent from it, `execute` SHALL return `initialized: true` with that field omitted from the result and annotated with reason `missing` rather than treated as a validation error.

### Requirement: Per-field freshness computation

For each present optimization field, the use case MUST compare the field's recorded `artifactState` baseline against the current schema-declared `scope: spec` artifact set for `specId`, obtained via `SpecRepository.artifactMeta()` for each canonical filename:

- an artifact present only in the current set (not in the baseline) yields reason `artifact-added`
- an artifact present only in the baseline (not in the current set) yields reason `artifact-removed`
- an artifact present in both with unequal content hash yields reason `artifact-changed`
- an artifact present in both with equal content hash but unequal `lastModified` yields a diagnostic only and does not affect freshness
- when every baseline and current artifact hash matches, and the field's recorded `schema` equals the spec's current persisted schema identity, the field is `fresh`
- when the field's recorded `schema` does not equal the spec's current persisted schema identity, the field is `stale` with reason `schema-changed`, even when every artifact hash still matches

A field with any `artifact-added`, `artifact-removed`, `artifact-changed`, or `schema-changed` reason is `stale`.

### Requirement: Field result shape

Each present field in the result MUST include:

- `value` — the persisted optimized string
- `freshness` — `'fresh' | 'stale'`
- `reasons` — the ordered list of staleness reasons that produced a non-fresh result (empty when fresh)

### Requirement: Aggregate freshness

`execute` SHALL return a top-level `fresh` boolean that is `true` only when persisted state exists, at least one optimization field is present, and every present field (or the single field requested via `field`) is `fresh`.

### Requirement: Unknown spec fails with a typed error

When the spec identity cannot be resolved to an existing spec artifact set in its workspace, `execute` SHALL throw `SpecNotFoundError`.

### Requirement: Config-based factory delegates through resolveGetPersistedSpecOptimizationsDeps

The config-based `createGetPersistedSpecOptimizations(config, options?)` form MUST derive `GetPersistedSpecOptimizationsDeps` through `resolveGetPersistedSpecOptimizationsDeps(resolver)` and then delegate to canonical `createGetPersistedSpecOptimizations(deps)`.

`resolveGetPersistedSpecOptimizationsDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>` — one repository instance per workspace

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- This use case is read-only — it never creates, mutates, regenerates, or writes persisted state, metadata, or optimization values
- Freshness is computed purely from persisted state and current artifact/schema observations — it never reads generated metadata to make this determination
- readOnly workspace ownership does not affect this operation — reads are always permitted

## Spec Dependencies

- [`core:spec-optimization`](../spec-optimization/spec.md) — persisted optimization field shape, artifact/schema baselines, and staleness reasons
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `readPersistedState`, `artifactMeta()`, and workspace-scoped repository access
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
