# Spec Compliance Audit — `persist-spec-context-optimizations` (core persisted state)

**Change:** `persist-spec-context-optimizations`  
**Audit scope:** 20 core specs (merged previews via `changes spec-preview`)  
**Mode:** Read-only  
**Graph freshness:** 2026-07-23 (not stale)  
**Date:** 2026-07-24

---

## Requirements Summary

| Spec                                        | Requirements checked | Primary implementation                                                                                                |
| ------------------------------------------- | -------------------: | --------------------------------------------------------------------------------------------------------------------- |
| `core:spec-lock`                            |                   11 | `packages/core/src/infrastructure/fs/spec-repository.ts`, `parse-spec-lock.ts`, `apply-persisted-spec-state-patch.ts` |
| `core:spec-optimization`                    |                    9 | `domain/services/spec-optimization.ts`, `spec-optimization-freshness.ts`                                              |
| `core:materialize-spec-metadata`            |                    8 | `application/use-cases/materialize-spec-metadata.ts`                                                                  |
| `core:persist-spec-metadata`                |                    6 | `application/use-cases/persist-spec-metadata.ts`                                                                      |
| `core:get-spec-metadata`                    |                    4 | `application/use-cases/get-spec-metadata.ts`                                                                          |
| `core:regenerate-spec-metadata`             |                    5 | `application/use-cases/regenerate-spec-metadata.ts`                                                                   |
| `core:initialize-persisted-spec-state`      |                   10 | `application/use-cases/initialize-persisted-spec-state.ts`                                                            |
| `core:get-persisted-spec-deps`              |                    6 | `application/use-cases/get-persisted-spec-deps.ts`                                                                    |
| `core:update-persisted-spec-deps`           |                   12 | `application/use-cases/update-persisted-spec-deps.ts`                                                                 |
| `core:get-persisted-spec-implementation`    |                    6 | `application/use-cases/get-persisted-spec-implementation.ts`                                                          |
| `core:update-persisted-spec-implementation` |                   12 | `application/use-cases/update-persisted-spec-implementation.ts`                                                       |
| `core:get-persisted-spec-optimizations`     |                    8 | `application/use-cases/get-persisted-spec-optimizations.ts`                                                           |
| `core:update-persisted-spec-optimizations`  |                   11 | `application/use-cases/update-persisted-spec-optimizations.ts`                                                        |
| `core:get-persisted-spec-schema`            |                    6 | `application/use-cases/get-persisted-spec-schema.ts`                                                                  |
| `core:update-persisted-spec-schema`         |                   12 | `application/use-cases/update-persisted-spec-schema.ts`                                                               |
| `core:fs-spec-repository`                   |                    9 | `infrastructure/fs/spec-repository.ts`                                                                                |
| `core:spec-repository-port`                 |                   19 | `application/ports/spec-repository.ts`                                                                                |
| `core:generate-metadata`                    |                   11 | `application/use-cases/generate-spec-metadata.ts`                                                                     |
| `core:spec-metadata`                        |                   11 | `domain/services/parse-metadata.ts`, `metadata-projection.ts`                                                         |
| **Total**                                   |              **176** |                                                                                                                       |

---

## Implementation Status

### Generally conformant areas

- **Persisted-state read use cases** (`get-persisted-spec-deps`, `get-persisted-spec-implementation`, `get-persisted-spec-schema`): Read via `readPersistedState`, typed errors, composition/kernel wiring present.
- **`update-persisted-spec-deps`**: Correct no-op for `remove` against missing state (`_createMissingState` early return); `set`/`clear` create state; patch helper used.
- **`initialize-persisted-spec-state`**: One-time adoption, `SpecAlreadyInitializedError`, batch reporting, `expectedRevision: null` writes.
- **`update-persisted-spec-schema`**: Requires existing lock, no-op when schema unchanged, direct state construction (not generic patch for schema).
- **`fs-spec-repository` / port**: `spec-lock.json` excluded from artifacts; `readPersistedState`/`writePersistedState`; revision guards; `persistedStateMeta` with optional hash; metadata snapshot read/write split.
- **Metadata pipeline**: `MaterializeSpecMetadata` → internal `PersistSpecMetadata`; `GetSpecMetadata` delegates; `RegenerateSpecMetadata` uses `policy: 'force'`; `GenerateSpecMetadata` projects fresh optimizations only from lock snapshot.
- **Domain freshness**: `classifyOptimizationFieldFreshness` implements artifact/schema reasons and `missing` for undefined fields (unit-tested).

### Non-conformant / partial areas

- **`update-persisted-spec-optimizations`**: Two confirmed behavioral bugs vs spec (see Discrepancies #1–#2).
- **`get-persisted-spec-optimizations`**: Missing-field semantics and aggregate `fresh` logic diverge from spec (see Discrepancy #3).
- **Test depth**: Most persisted-mutation verify scenarios are untested; optimizations use cases have minimal coverage (1–2 tests each).

---

## Discrepancies

### D1 — `update-persisted-spec-optimizations`: clear on uninitialized creates lock (should be no-op)

**Candidate issue #1: CONFIRMED**

**Spec (`core:update-persisted-spec-optimizations`):**

> When persisted state does not exist and `clear` is provided, the use case MUST NOT create persisted state. It MUST return a result with no `optimizations` and `created: false` without calling `writePersistedState`.

Also aligned with `core:spec-lock` semantic no-op mutations against lock-less specs.

**Code evidence** (`packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts`):

```112:180:packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts
    let current = await repo.readPersistedState(spec)
    let created = false
    if (current === null) {
      // ... always builds initial base and sets created = true
      created = true
    }
    // ... clear deletes from nextOptimizations
    await repo.writePersistedState(spec, state, {
      expectedRevision: created ? null : current.originalHash,
    })
```

Unlike sibling `UpdatePersistedSpecDeps`, there is no early return for clear-only on missing state:

```115:120:packages/core/src/application/use-cases/update-persisted-spec-deps.ts
    const createsState =
      input.clear === true ||
      input.set !== undefined ||
      (input.add !== undefined && input.add.length > 0)
    if (!createsState) {
      return { specId: input.specId, dependsOn: [], created: false }
```

**(A) Code wrong:** `clear` on uninitialized spec creates `spec-lock.json`, sets `created: true`, and calls `writePersistedState`.  
**(B) Spec wrong:** Unlikely — consistent with deps/implementation/spec-lock no-op semantics and explicit verify scenario.

---

### D2 — `update-persisted-spec-optimizations`: set uses active schema, not persisted schema when state exists

**Candidate issue #2: CONFIRMED**

**Spec (`core:update-persisted-spec-optimizations`, Set captures a fresh baseline):**

> `schema` — the spec's **current persisted schema identity when persisted state already exists**, or the effective project schema when persisted state is being created by this call

Verify scenario: persisted state with `{ name: 'default', version: 1 }` → new field's recorded `schema` must equal that identity.

**Code evidence:**

```104:150:packages/core/src/application/use-cases/update-persisted-spec-optimizations.ts
    const schemaResult = await this.getActiveSchema.execute()
    const schemaIdentity = {
      name: schemaResult.schema.name(),
      version: schemaResult.schema.version(),
    }
    // ...
    if (input.set !== undefined) {
      for (const [field, value] of Object.entries(input.set) as Array<...>) {
        nextOptimizations[field] = {
          value,
          schema: schemaIdentity,  // always active schema, not current.schema
          artifactState: normalizeArtifactState(artifactState),
        }
      }
    }
```

When `current !== null` (existing lock), baseline should use `current.schema`, not `getActiveSchema()` result. If project effective schema differs from lock schema (expected after archive or schema reassignment), newly set optimization fields get wrong baseline schema → incorrect freshness in `GetPersistedSpecOptimizations` / `GenerateSpecMetadata`.

**(A) Code wrong:** Should branch: `const fieldSchema = created ? schemaIdentity : current.schema`.  
**(B) Spec wrong:** Unlikely — matches `core:spec-optimization` per-field baseline semantics and schema-reassignment staleness model.

---

### D3 — `get-persisted-spec-optimizations`: absent fields omitted; aggregate `fresh` wrong; `missing` not surfaced

**Candidate issue #3: CONFIRMED (partial)**

**Spec (`core:get-persisted-spec-optimizations`):**

- Initialized spec with absent optimization field: field omitted **and annotated with reason `missing`** (not a validation error).
- Aggregate `fresh`: `true` only when persisted state exists, **at least one optimization field is present**, and every present/requested field is fresh.
- Verify: no optimizations block → `fresh: false`.

**Spec (`core:spec-optimization`):** field with no persisted value MUST be reported as `missing`.

**Code evidence:**

```118:127:packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts
  private _fieldResult(..., field, ..., name) {
    if (filter !== undefined && filter !== name) return undefined
    if (field === undefined) return undefined  // skips classifyOptimizationFieldFreshness
```

Domain service already supports `missing`:

```35:37:packages/core/src/domain/services/spec-optimization-freshness.ts
  if (field === undefined) {
    return { fresh: false, reasons: ['missing'] }
  }
```

Aggregate freshness treats omitted fields as satisfying the fresh check:

```95:97:packages/core/src/application/use-cases/get-persisted-spec-optimizations.ts
    const fresh =
      (optimizedDescription === undefined || optimizedDescription.freshness === 'fresh') &&
      (optimizedContext === undefined || optimizedContext.freshness === 'fresh')
```

When initialized with no `optimizations` block, both fields are `undefined` → `fresh: true` (violates spec).

When filtering `field: 'optimizedContext'` but only `optimizedDescription` exists, result omits `optimizedContext` with no `missing` annotation.

**(A) Code wrong:** Should call freshness classifier for requested-but-absent fields; aggregate `fresh` must require ≥1 present field and treat `missing` as non-fresh for filtered queries.  
**(B) Spec wrong:** Possible ambiguity — result type has no explicit `missing` slot; verify text says both "omit" and "annotate with reason `missing`". Spec may need a concrete result shape (e.g. `{ freshness: 'stale', reasons: ['missing'] }` without `value`, or a `missingFields` array). Domain model already defines `missing` reason.

---

### D4 — Cross-spec: `persistedStateHash` naming (spec-lock vs repository port)

**Spec (`core:spec-lock`, merged preview):**

> `SpecRepository.persistedStateHash(spec)` — application callers MUST obtain digest only through repository port.

**Spec (`core:fs-spec-repository` / `core:spec-repository-port`, merged preview):**

> There MUST NOT be a `persistedStateHash(spec)` method; use `persistedStateMeta(spec, { includeHash: true })`.

**Code:** No `persistedStateHash` method exists; `generate-spec-metadata.ts` uses `persistedStateMeta(..., { includeHash: true })?.hash` — **matches port/fs specs**.

**(A) Code wrong:** No — implementation follows port/fs.  
**(B) Spec wrong:** `core:spec-lock` merged preview still names removed API; change specs should align on `persistedStateMeta`.

---

### D5 — Composition factory shape for `update-persisted-spec-optimizations` (minor)

**Spec:** `resolveUpdatePersistedSpecOptimizationsDeps` MUST resolve `initializePersistedSpecState` collaborator for `resolveInitialPersistedDependsOn()`.

**Code:** Resolves `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` directly (`composition/use-cases/update-persisted-spec-optimizations.ts`) — functionally equivalent to sibling deps/update use cases but not the literal collaborator named in spec.

**(A) Code wrong:** Debatable — behavior depends on shared service, not collaborator type.  
**(B) Spec wrong:** May over-specify wiring shape when direct `resolveInitialPersistedDependsOn` deps suffice.

---

## Test Coverage

| Area                                       | Test files                                             | Assessment                                            |
| ------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| `fs-spec-repository` persisted state       | `spec-repository.spec.ts` (~15 scenarios)              | Good for lock I/O, revision guards, sidecar exclusion |
| `spec-optimization-freshness`              | `spec-optimization-freshness.spec.ts` (7 tests)        | Good domain coverage                                  |
| `initialize-persisted-spec-state`          | `initialize-persisted-spec-state.spec.ts` (5 tests)    | Basic happy path + errors                             |
| `get-persisted-spec-deps`                  | `get-persisted-spec-deps.spec.ts` (5 tests)            | Moderate                                              |
| `materialize-spec-metadata`                | `materialize-spec-metadata.spec.ts` (7 tests)          | Moderate                                              |
| `update-persisted-spec-deps`               | `update-persisted-spec-deps.spec.ts` (1 test)          | No-op only                                            |
| `get-persisted-spec-optimizations`         | `get-persisted-spec-optimizations.spec.ts` (1 test)    | Uninitialized only                                    |
| `update-persisted-spec-optimizations`      | `update-persisted-spec-optimizations.spec.ts` (1 test) | Empty input validation only                           |
| `get/update-persisted-spec-implementation` | 1–2 tests each                                         | Smoke-level                                           |
| `get/update-persisted-spec-schema`         | 1–2 tests each                                         | Smoke-level                                           |
| `persist-spec-metadata`                    | 1 test                                                 | Happy-path write only                                 |
| `get/regenerate-spec-metadata`             | 1–2 tests each                                         | Delegation smoke                                      |
| Composition factories                      | smoke tests                                            | Factory wiring only                                   |

**No tests** exercise D1–D3 failure modes. `update-persisted-spec-deps` no-op test exists but **no parallel test** for optimizations clear no-op.

---

## Missing Tests

High-priority gaps tied to confirmed discrepancies and verify scenarios:

1. **`update-persisted-spec-optimizations`**: clear on lock-less spec → `created: false`, no `writePersistedState` (D1).
2. **`update-persisted-spec-optimizations`**: set on initialized spec with lock schema ≠ active schema → recorded `schema` equals `current.schema` (D2).
3. **`update-persisted-spec-optimizations`**: set/clear mutual exclusivity, empty set/clear validation, conflict propagation, last-field clear omits `optimizations` block.
4. **`get-persisted-spec-optimizations`**: initialized, no optimizations → `fresh: false` (D3).
5. **`get-persisted-spec-optimizations`**: filter requested absent field → `missing` reason surfaced (D3).
6. **`get-persisted-spec-optimizations`**: per-field staleness (`artifact-added/changed/removed`, `schema-changed`, lastModified diagnostic).
7. **`get-persisted-spec-optimizations`**: aggregate fresh with mixed fresh/stale fields.
8. **`update-persisted-spec-deps`**: set/clear create, remove-before-add, conflict — most verify scenarios.
9. **`update-persisted-spec-implementation`**: add/remove paths, boundary errors, no-op remove.
10. **`update-persisted-spec-schema`**: no-op same schema, dependency conflict, preservation of optimizations.
11. **`generate-spec-metadata`**: stale optimization omitted; dependsOn conflict when persisted ≠ extracted.
12. **`materialize-spec-metadata`**: force failure propagation, conflict retry, cache-write-failed warning.

---

## Spec Dependency Chain Notes

- Persisted mutations correctly funnel through `applyPersistedSpecStatePatch` (except schema reassignment, which correctly bypasses patch for `schema` field per spec).
- `resolveInitialPersistedDependsOn` shared across init and incidental creation paths.
- `GenerateSpecMetadata` ↔ `spec-optimization` freshness alignment depends on D2 fix for write path baselines.

---

## Summary Counts

| Metric                                        |                           Count |
| --------------------------------------------- | ------------------------------: |
| Specs audited                                 |                              20 |
| Requirements checked                          |                             176 |
| **Discrepancies (actionable)**                | **4** (D1–D4; D5 informational) |
| Confirmed candidate issues                    |                3/3 (D1, D2, D3) |
| Missing test areas (high priority)            |                              12 |
| Verify scenarios with no matching test (est.) |        ~85+ across scoped specs |

**Verdict:** Core persisted-state infrastructure and most read/mutation use cases are largely aligned. **`update-persisted-spec-optimizations` and `get-persisted-spec-optimizations` have confirmed spec violations** that should block verify/sign-off until fixed or specs reconciled. Test coverage for optimization flows is insufficient to catch regressions.
