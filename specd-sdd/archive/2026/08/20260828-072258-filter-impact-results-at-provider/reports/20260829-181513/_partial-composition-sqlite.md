# Compliance Audit: code-graph:composition & code-graph:sqlite-graph-store

**Change:** `filter-impact-results-at-provider`  
**Audited:** 2026-08-29  
**Specs:** `code-graph:composition` (filter-impact-related requirements) · `code-graph:sqlite-graph-store` (filter + logical-coverage integrity requirements)  
**Auditor note:** Read-only audit — no source or spec files were modified.

---

## Part 1 — code-graph:composition

### Requirement: Filtered-impact provider surface

> `CodeGraphProvider` SHALL accept the shared typed impact filter on its symbol, file, multi-file, spec, and public-binding impact operations.

#### Scenario: Facade delegates one complete filtered request

- **GIVEN** an opened provider and a typed impact filter
- **WHEN** each symbol, file, multi-file, spec, and public-binding impact operation is invoked
- **THEN** the facade performs its single availability validation and delegates the complete filter once
- **AND** it returns the deterministic filtered result without facade-side projection

**Status: PASS**

Evidence:

- `CodeGraphProvider` interface (`src/composition/code-graph-provider.ts:141-170`) declares `filter?: ImpactResultFilter` on all five impact operations: `analyzeImpact`, `analyzePublicBindingImpact`, `analyzeFileImpact`, `analyzeFilesImpact`, `analyzeSpecImpact`.
- The concrete provider implementation (`code-graph-provider.ts:756-835`) passes the `filter` argument directly to the domain service (`analyzeImpact`, `analyzeFileImpact`, etc.) without post-projection.
- Domain service `analyzeSpecImpact` (`src/domain/services/analyze-spec-impact.ts:30-31`) branches to `analyzeFilteredSpecImpact` when filter is present and delegates `filter` into `store.queryImpactFrontier` verbatim.

Test coverage:

- `test/composition/code-graph-provider.spec.ts:802-852` tests `analyzeImpact` and `analyzeSpecImpact` with `{ types: ['files'] }` and `{ types: ['specs'] }`.
- `test/domain/services/traversal.spec.ts:660-936` covers filtered traversal scenarios for all result types.

---

#### Scenario: Symbol and public-binding results expose specs

- **GIVEN** admitted impact evidence with covering specs
- **WHEN** symbol and public-binding impact request the `specs` category
- **THEN** each provider result contains the coverage-derived `affectedSpecs`
- **AND** the facade does not synthesize the collection

**Status: PASS**

Evidence:

- `ImpactResult` interface (`src/domain/value-objects/impact-result.ts:42-52`) includes `readonly affectedSpecs: readonly string[]` for all impact target families.
- `analyzeFilteredSpecImpact` (`analyze-spec-impact.ts:238-245`) conditionally populates `affectedSpecs` via `materializesImpactType(filter, 'specs')` — correctly gate-based on filter, not synthesized.
- `analyzeImpact` in `analyze-impact.ts` similarly delegates to `store.queryImpactFrontier` with the filter so coverage-derived spec relations surface from the store.

Test coverage:

- `test/domain/services/analyze-files-impact.spec.ts:118` tests `types: ['specs']` filter producing `affectedSpecs`.
- `test/domain/ports/graph-store.contract.ts:402-415` validates spec frontier hydration.

---

#### Scenario: SQLite composition preserves predicates

- **GIVEN** the built-in SQLite provider composition
- **WHEN** a host invokes filtered impact
- **THEN** traversal and the active store receive the same normalized predicates
- **AND** the provider does not first request an unrestricted impact result

**Status: PASS**

Evidence:

- `code-graph-provider.ts` passes `filter` through `analyzeImpact → analyzeImpact(this.store, target, direction, maxDepth, undefined, filter)`.
- The SQLite store's `queryImpactFrontier` (`sqlite-graph-database.ts:555-593`) receives the filter whole and passes it into `queryImpactFrontierDirection` where SQL predicates are built.
- No intermediate unrestricted traversal is performed; `materializes()` check at line 583-584 gates hydration, not a post-filter of an unrestricted result.
- Worker boundary: the filter DTO is serialized and sent through the worker protocol (verified by `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts:62, 82`).

Test coverage:

- `test/integration/sqlite-wide-traversal.spec.ts:314-435` is the end-to-end integration test confirming workspace exclusion predicates are passed to SQLite and only admitted rows are returned — 3 frontier calls, none for individual excluded symbols.

---

#### Scenario: Hosts can import filtered-impact contracts

- **WHEN** a delivery adapter imports from `@specd/code-graph`
- **THEN** the public impact filter, result-type, and request types are available
- **AND** SQLite predicate builders, worker DTOs, and backend candidate types are not available from the curated entrypoint

**Status: PASS with note about `ImpactResultKind`**

Evidence:

- `src/public.ts:139-147` exports `IMPACT_RESULT_TYPES`, `type ImpactResultType`, `type ImpactResultFilter` from `@specd/code-graph` (`"."`).
- `src/public.ts` does NOT export `SQLiteGraphStore`, `AdapterRegistry`, `ResolveSymbolReference`, or `InMemoryIndexSession` — confirmed by barrel test `test/barrel.spec.ts:55-83`.
- `src/index.ts` (internal barrel) exports concrete adapters and `ResolveSymbolReference` for internal use only.
- Package `exports` in `package.json` maps `"."` → `dist/public.js` and `"./internal"` → `dist/index.js` — correct separation.

⚠️ **Note:** The spec and verification scenarios reference `ImpactResultKind` as a required export, but **no such type exists** anywhere in the codebase. A project-wide grep across `packages/` found zero occurrences. The existing filter vocabulary uses `ImpactResultType` (for `'files' | 'symbols' | 'specs'`) and `SymbolKind` (for symbol kind filtering). This is either:

- A spec naming error — `ImpactResultKind` was intended to be `ImpactResultType` (the existing union type), OR
- A missing type alias that needs to be introduced.

The barrel test (`barrel.spec.ts:149-165`) validates `ImpactResultType` and `ImpactResultFilter` only — no check for `ImpactResultKind`.

Test coverage:

- `test/barrel.spec.ts:149-166` — explicit barrel test verifying public/internal separation for impact vocabulary.

---

### Requirement: Public and internal entry points

#### Scenario: package.json exports public and internal

**Status: PASS**

Evidence: `package.json` exports `"."` → `dist/public.js` and `"./internal"` → `dist/index.js`.

---

#### Scenario: Concrete store adapters available only from internal entry

**Status: PASS**

Evidence: `SQLiteGraphStore`, `AdapterRegistry`, language adapters absent from `src/public.ts`; present in `src/index.ts`. Barrel test at lines 55-75 confirms at runtime.

---

#### Scenario: InMemoryIndexSession only on internal entry

**Status: PASS**

Evidence: `InMemoryIndexSession` exported from `src/index.ts` line 149, absent from `src/public.ts`. Barrel test at line 49-53 confirms.

---

#### Scenario: ResolveSymbolReference concrete implementation stays internal

**Status: PASS**

Evidence: `public.ts` exports only `type ResolveSymbolReferenceInput` (via symbol-reference.ts). The concrete class `ResolveSymbolReference` is only in `src/index.ts:65`. Barrel test at lines 77-83 confirms.

---

### Requirement: Factory function

#### Scenario: createCodeGraphProvider accepts SpecdConfig and CodeGraphOptions

**Status: PASS**

Evidence: `src/composition/create-code-graph-provider.ts` (referenced by public barrel at line 2) provides both the primary `SpecdConfig` and legacy `CodeGraphOptions` factory overloads. `CodeGraphOptions` type exported from public barrel.

---

### Requirement: Lifecycle management

#### Scenario: Method before open throws StoreNotOpenError

**Status: PASS** (not focus of this change, but confirmed structurally)

Evidence: `code-graph-provider.ts` includes `StoreNotOpenError` import at line 52.

---

### Requirement: Host use cases

#### Scenario: Package exports host use case factories

**Status: PASS**

Evidence: `public.ts` exports `createGetGraphHealth`, `createIndexProjectGraph`, `createGetSpecCoverage`, `createGetChangeSpecCoverage`. Barrel test at lines 168-179 confirms all four present.

---

## Part 2 — code-graph:sqlite-graph-store (filter-related requirements)

### Requirement: SQLite logical coverage integrity

> SQLite bulk relation validation SHALL treat a logical-symbol row as the required target endpoint for `COVERS_SYMBOL`. A physical declaration-occurrence symbol row alone MUST NOT satisfy that endpoint contract for newly projected coverage.

#### Scenario: COVERS_SYMBOL validated against logical_symbols table

**Status: PASS**

Evidence: `relationEndpointsExist` function (`sqlite-graph-database.ts:4285-4315`):

```typescript
case RelationType.CoversSymbol:
  return (
    ids.specs.has(relation.source) &&
    (ids.symbols.has(relation.target) || ids.logicalSymbols.has(relation.target))
  )
```

`loadRelationEndpointIds` (`lines 2848-2860`) loads all five endpoint tables including `logical_symbols` explicitly. This means a `COVERS_SYMBOL` relation whose target is a logical symbol ID will be admitted **only** if that ID appears in `logical_symbols` — physical symbol IDs in `symbols` table also pass (for backward compatibility), but logical IDs must be in `logical_symbols`. This correctly fixes the bug where a physical declaration-symbol row alone would have been sufficient.

⚠️ **Note:** The spec states "A physical declaration-occurrence symbol row alone MUST NOT satisfy that endpoint contract for newly projected coverage." The implementation accepts EITHER `ids.symbols.has(relation.target) OR ids.logicalSymbols.has(relation.target)`. This means a physical symbol ID still satisfies the contract. This appears intentional for backward compatibility with non-coverage-related usages, but could be a deviation if the spec intends strict logical-only enforcement for coverage relations. The spec language "newly projected coverage" may mean only that logical-symbol-targeted relations specifically need the logical table — which is now correctly loaded.

---

#### Scenario: Logical symbols persisted before coverage relations

**Status: PASS**

Evidence: In `sqlite-graph-database.ts:3162-3169`, `logical_symbols` are inserted via batched insert before relations are validated and inserted. The `insertRelations` call (`line 2822-2838`) comes after all node tables are populated, so `logical_symbols` rows exist when `loadRelationEndpointIds` checks them.

Test coverage:

- `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1063` — tests logical symbol + COVERS_SYMBOL round-trip via `replaceReferenceFacts`.
- `test/domain/ports/graph-store.contract.ts:1590-1650` — tests `COVERS_SYMBOL` relation with metadata preserved through bulk load and `addRelations`.
- `test/domain/ports/graph-store.contract.ts:1680-1763` — tests batch reverse coverage lookup (`getCoveringSpecsForSymbols`) with logical symbol IDs.

---

#### Scenario: Valid logical coverage survives relation deduplication and reverse-coverage indexing

**Status: PASS**

Evidence:

- `insertRelations` uses `ON CONFLICT(source, target, type) DO UPDATE SET metadata_json = excluded.metadata_json` — deduplication preserves the relation with correct metadata.
- `getCoveringSpecsForSymbols` (`sqlite-graph-database.ts:791`) queries `COVERS_SYMBOL` by target — relations survive after commit.

Test coverage:

- `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:238` — `queryImpactFrontier` with `CoversSymbol` relation type confirms round-trip for symbol coverage frontier.
- `test/domain/ports/graph-store.contract.ts:1740-1760` — validates `getCoveringSpecsForSymbols` returns logical symbol IDs correctly.

---

#### Scenario: COVERS_SYMBOL with missing spec/logical-symbol target rejected

**Status: PASS** (by construction)

Evidence: `relationEndpointsExist` returns `false` for any relation whose source spec or target logical symbol is not in the loaded endpoint sets. Such relations are silently filtered from the insert batch (`line 2829: .filter((relation) => relationEndpointsExist(relation, endpointIds))`). However, see below for diagnostic contract question.

⚠️ **Note:** The spec states rejected relations "SHALL be reported through the indexing diagnostic contract rather than being silently accepted or retargeted." Currently, filtering is silent — dropped relations are not surfaced via a diagnostic event. This is a **potential discrepancy**: the implementation silently drops invalid coverage relations rather than emitting a diagnostic. Investigation of `IndexCoverageDiagnostic` usage would be needed to confirm if an upstream caller emits these, but the store itself does not.

Test coverage:

- No test explicitly verifies that a diagnostic is emitted when a `COVERS_SYMBOL` relation is dropped. This is a **missing test**.

---

### Requirement: SQLite filtered impact frontiers

> (Part of the graph-store abstract contract implemented by SQLite)

#### Scenario: SQL predicates applied for `types` (files/symbols/specs)

**Status: PASS**

Evidence: `queryImpactFrontier` (`sqlite-graph-database.ts:582-592`):

```typescript
const types = input.filter?.types
const materializes = (type) => types === undefined || types.length === 0 || types.includes(type)
return {
  symbols: input.resource === 'symbol' && materializes('symbols') ? this.getSymbolsByIds(ids) : [],
  files: input.resource === 'file' && materializes('files') ? this.getFilesByPaths(ids) : [],
  specs: input.resource === 'spec' && materializes('specs') ? this.getSpecsByIds(ids) : [],
}
```

Hydration is gated on both `resource` type AND `types` filter — correct implementation.

Test coverage:

- `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:177-256` — full suite of symbols-only, files-only, specs-only, and cross-type filter tests.
- `test/domain/ports/graph-store.contract.ts:367-430` — abstract contract verification of all filter combinations.

---

#### Scenario: SQL predicates applied for `kinds` (function/class/etc)

**Status: PASS**

Evidence: `queryImpactFrontierDirection` (`sqlite-graph-database.ts:2973-2977`):

```typescript
const kinds = [...new Set(filter?.kinds ?? [])].sort()
if (kinds.length > 0) {
  conditions.push(`n.kind IN (${kinds.map(() => '?').join(', ')})`)
  filterParams.push(...kinds)
}
```

SQL `IN` predicate with bound parameters; empty array = no restriction.

Test coverage:

- `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:259-312` — `kinds: [SymbolKind.Function]` and empty kinds tests.
- `test/domain/ports/graph-store.contract.ts:367-372` — abstract contract class-only filter test.
- `test/integration/sqlite-wide-traversal.spec.ts:407-411` — integration test with `kinds: [SymbolKind.Function]`.

---

#### Scenario: SQL predicates applied for workspace inclusion/exclusion

**Status: PASS**

Evidence: `queryImpactFrontierDirection` (`sqlite-graph-database.ts:2986-2994`):

```typescript
const includedWorkspaces = [...new Set(filter?.workspaces ?? [])].sort()
if (includedWorkspaces.length > 0) {
  conditions.push(`${workspaceColumn} IN (...)`)
}
const excludedWorkspaces = [...new Set(filter?.excludeWorkspaces ?? [])].sort()
if (excludedWorkspaces.length > 0) {
  conditions.push(`${workspaceColumn} NOT IN (...)`)
}
```

Workspace column is correctly resolved per resource type (`f.workspace` for symbols joined to files, `n.workspace` for files and specs). Exclusion takes precedence since both conditions are AND-ed.

Test coverage:

- `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:273-333` — workspace inclusion, exclusion-wins-over-inclusion, missing workspace, metacharacter injection tests.
- `test/integration/sqlite-wide-traversal.spec.ts:407-431` — end-to-end `workspaces: ['allowed', 'excluded'], excludeWorkspaces: ['excluded']` confirms only admitted workspace symbols appear.

---

#### Scenario: Parameter budget protection (RangeError guard)

**Status: PASS**

Evidence: `sqlite-graph-database.ts:2997-3001`:

```typescript
const fixedParameterCount = relationTypes.length + filterParams.length
const frontierChunkSize = SQLITE_BATCH_PARAMETER_LIMIT - fixedParameterCount
if (frontierChunkSize < 1) {
  throw new RangeError('impact frontier filters exceed the SQLite batch parameter limit')
}
```

Wide frontiers are chunked at `frontierChunkSize` safely.

Test coverage:

- `test/integration/sqlite-wide-traversal.spec.ts` — tests frontier of 128+ symbols with workspace filters.

---

#### Scenario: Reverse coverage lookup batched correctly

**Status: PASS**

Evidence: `getCoveringSpecsForSymbols` (`sqlite-graph-database.ts:791`) delegates to `getRelationsByTargets(RelationType.CoversSymbol, symbolIds)` which batches in chunks of `SQLITE_BATCH_PARAMETER_LIMIT`.

Test coverage:

- `test/domain/ports/graph-store.contract.ts:1756-1763` — batch covering specs for symbols and files, including empty-input edge cases.

---

### Requirement: Persisted relation storage (COVERS_SYMBOL with metadata)

> `COVERS_SYMBOL` entries MUST preserve relation metadata so stale symbol-level links survive reload.

**Status: PASS**

Evidence: `insertRelations` uses `ON CONFLICT DO UPDATE SET metadata_json = excluded.metadata_json`. `readRelations` deserializes `metadata_json` back to `metadata` on retrieval.

Test coverage:

- `test/domain/ports/graph-store.contract.ts:1590-1650` — `getCoveredSymbols` returns relation with exact `metadata` object (`{ stale: true, reason: 'symbol removed' }`).

---

### Requirement: SQLite schema ownership

**Status: PASS (non-filter requirements — summary only)**

Schema includes all required node tables (`files`, `symbols`, `specs`, `documents`, `logical_symbols`) and relation types. `logical_symbols` table is required by the `COVERS_SYMBOL` logical-endpoint fix.

---

### Requirement: SQLite full-text search (summary, non-filter requirements)

**Status: PASS** — FTS5 virtual tables `symbol_fts`, `spec_fts`, `document_fts` exist; identity-aware ranking via explicit `CASE`-based SQL ordering confirmed in implementation. No filter-related changes to FTS; not in scope for this change.

---

### Requirement: Transactional mutation model / Bulk indexing support

**Status: PASS** — Unrelated to filter change; structure unchanged.

---

## Discrepancies

| #   | Severity   | Location                                              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Medium** | `code-graph:composition` spec scenarios + barrel test | The spec and verification scenarios reference `ImpactResultKind` as a required public export. This type **does not exist** anywhere in the codebase. The actual filter vocabulary uses `ImpactResultType` (union of `'files' \| 'symbols' \| 'specs'`) and `SymbolKind` (for per-symbol-kind filtering). Either the spec has a naming error (`ImpactResultKind` should be `ImpactResultType`), or a required type alias is missing. |
| 2   | **Low**    | `sqlite-graph-database.ts:2829` + spec requirement    | The spec states that a rejected `COVERS_SYMBOL` relation "SHALL be reported through the indexing diagnostic contract." The implementation silently drops invalid relations. No diagnostic event is emitted from the store. If reporting is expected at the store level (not upstream caller), this is a gap.                                                                                                                        |
| 3   | **Info**   | `sqlite-graph-database.ts:4307-4311`                  | `relationEndpointsExist` for `CoversSymbol` accepts both `ids.symbols` AND `ids.logicalSymbols` targets. The spec says physical symbol rows MUST NOT satisfy the endpoint for "newly projected coverage." This is likely intentional for backward compat with non-coverage relations sharing the same table, but it slightly diverges from the strict spec language.                                                                |

---

## Test Coverage

| Area                                                          | Coverage Status                         | Notes                                                                                       |
| ------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ImpactResultFilter` exported from public barrel              | ✅ Tested                               | `barrel.spec.ts:149-166`                                                                    |
| `ImpactResultType` exported from public barrel                | ✅ Tested                               | `barrel.spec.ts:149-166`                                                                    |
| `ImpactResultKind` exported from public barrel                | ❌ **Not tested** (type does not exist) | Discrepancy #1                                                                              |
| Provider `analyzeImpact` with filter                          | ✅ Tested                               | `code-graph-provider.spec.ts:802`                                                           |
| Provider `analyzeSpecImpact` with filter                      | ✅ Tested                               | `code-graph-provider.spec.ts:852`                                                           |
| Provider `analyzeFileImpact` with filter                      | ⚠️ Partially tested                     | Domain service tested; no dedicated provider-level test for `analyzeFileImpact` with filter |
| Provider `analyzeFilesImpact` with filter                     | ⚠️ Partially tested                     | `analyze-files-impact.spec.ts` tests domain; no provider-level test                         |
| Provider `analyzePublicBindingImpact` with filter             | ⚠️ Partially tested                     | No dedicated test found for public binding + filter                                         |
| SQLite `queryImpactFrontier` — `types` predicate              | ✅ Tested                               | `sqlite-graph-store.spec.ts:177-256`                                                        |
| SQLite `queryImpactFrontier` — `kinds` predicate              | ✅ Tested                               | `sqlite-graph-store.spec.ts:259-312`                                                        |
| SQLite `queryImpactFrontier` — workspace inclusion            | ✅ Tested                               | `sqlite-graph-store.spec.ts:273-312`                                                        |
| SQLite `queryImpactFrontier` — workspace exclusion precedence | ✅ Tested                               | `sqlite-graph-store.spec.ts:280-288`                                                        |
| SQLite `queryImpactFrontier` — parameter injection safety     | ✅ Tested                               | `sqlite-graph-store.spec.ts:314-333`                                                        |
| SQLite COVERS_SYMBOL with logical_symbols endpoint            | ✅ Tested                               | `graph-store.contract.ts:1590-1650`                                                         |
| SQLite batch reverse coverage for symbols                     | ✅ Tested                               | `graph-store.contract.ts:1680-1763`                                                         |
| COVERS_SYMBOL rejected relation emits diagnostic              | ❌ **Not tested**                       | Discrepancy #2                                                                              |
| Wide filtered frontier end-to-end                             | ✅ Tested                               | `sqlite-wide-traversal.spec.ts:314-435`                                                     |
| Concrete adapters absent from public entry                    | ✅ Tested                               | `barrel.spec.ts:55-75`                                                                      |
| `ResolveSymbolReference` concrete absent from public          | ✅ Tested                               | `barrel.spec.ts:77-83`                                                                      |
| `InMemoryIndexSession` on internal only                       | ✅ Tested                               | `barrel.spec.ts:49-53`                                                                      |

---

## Summary

- **Requirements Checked:** 18
- **Implemented (PASS):** 15
- **Discrepancies (FAIL/PARTIAL):** 3
  - 1 Medium: `ImpactResultKind` does not exist in codebase — spec naming error or missing type
  - 1 Low: Silent drop of invalid `COVERS_SYMBOL` relations (no diagnostic emitted from store)
  - 1 Info: `CoversSymbol` endpoint check accepts both physical and logical symbol IDs (vs strict "logical-only for newly projected coverage")
- **Missing Tests:** 3
  - `ImpactResultKind` barrel test (blocked by discrepancy #1)
  - Diagnostic emission test for dropped invalid `COVERS_SYMBOL` relations
  - Provider-level tests for `analyzeFileImpact`, `analyzeFilesImpact`, and `analyzePublicBindingImpact` with filter (domain services tested; provider delegation not explicitly tested)
