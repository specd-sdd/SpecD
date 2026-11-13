# Delivery compliance audit — indexer, composition, SDK impact, CLI impact

## Requirements Summary

Audited the merged `spec.md` and `verify.md` views for:

- `code-graph:indexer` — 26 requirements, 104 scenarios.
- `code-graph:composition` — 12 requirements, 54 scenarios.
- `sdk:run-graph-impact` — 5 requirements, 14 scenarios.
- `cli:graph-impact` — 13 requirements, 59 scenarios.

The review followed the merged previews, current source, focused tests, public barrels, user documentation, global architecture/conventions, and direct depth-1 dependency contracts. The focused verification command passed **7 files / 203 tests**. Passing tests do not establish full compliance here: one required negative identity case is reproducibly wrong, one compatibility test intentionally exercises behavior forbidden by the new SDK contract, and several normative scenario variants are absent.

## Implementation Status per spec

### `code-graph:indexer` — PARTIAL

Implemented and evidenced:

- Role-aware declaration input filters lexical-binding and physical-only descriptors out of logical projection.
- Owner materialization is recursive/owner-first; missing or cyclic owners are conservatively omitted.
- Occurrence forms are retained in declaration mappings.
- Incremental indexing computes an affected file closure using stored dependency relations and reference steps, rehydrates unaffected facts, reprocesses newly resolvable addition candidates, and reprojects coverage.
- Existing focused tests cover filtering, owner-first members, compatible overload grouping, mismatched group keys, one overload mutation versus a clean rebuild, implementation-only coverage changes, and newly resolvable imports.

Not compliant / incompletely evidenced:

- Same-name declarations with no explicit grouping evidence are merged into one logical target (D1), contrary to the merged requirement and scenario.
- The required identity-sensitive mutation matrix is not present (T1). The only normalized incremental-vs-clean comparison changes a single TypeScript function into an overload set and omits relations, evidence, and coverage from its normalized comparison.

### `code-graph:composition` — PASS WITH COVERAGE GAP

Implemented and evidenced:

- `CodeGraphProvider.analyzeResolvedSymbolImpact` is a required public provider operation and delegates the complete `ResolvedSymbolTarget` to the domain traversal after one availability check.
- Domain traversal seeds every declaration for logical targets, only the selected declaration for exact physical targets, retains physical evidence, aggregates logical targets, computes semantic count units, and projects logical coverage.
- Public binding impact remains a separate provider operation with distinct exact-route and canonical-target results.
- Public exports expose the provider/result contracts; concrete SQLite implementation remains behind the internal/composition boundary.

Coverage limitation:

- Provider delegation is integration-tested for a logical target, but the merged verification requirement also calls for exact-declaration and public-binding discriminants through the resolved-impact surface. Public binding separation is tested through `analyzePublicBindingImpact`, not through a public-binding `ResolvedSymbolTarget` passed to `analyzeResolvedSymbolImpact` (T2). The code has distinct public-export behavior, so this is presently classified as a test/spec-surface ambiguity rather than a confirmed runtime defect.

### `sdk:run-graph-impact` — PARTIAL

Implemented and evidenced:

- The normal provider path forwards the complete discriminated target to `analyzeResolvedSymbolImpact`.
- Ambiguous/not-found selector outcomes return without traversal.
- Declarations, semantic targets, physical evidence, covering specs, explicit count units, and compatibility aggregate fields are exposed.
- Configuration-only projection is used for the separate projected declaration/evidence fields; no graph reads occur during those projections.
- Types are exported from both SDK orchestration and root barrels and documented in `docs/sdk/index.md`.

Not compliant:

- A runtime compatibility fallback still selects `resolvedTarget.declarations[0]` and calls legacy `provider.analyzeImpact(firstId, ...)` (D2). That is exactly the primary-declaration collapse prohibited by the merged requirement.
- The returned `resolvedTarget` is the raw domain target, while a separate `declarations` array is projected. Consequently declaration locations retained inside `resolvedTarget` do not receive `projectRelativePath` (D3).

### `cli:graph-impact` — PARTIAL (downstream SDK defect)

Implemented and evidenced:

- The command imports platform behavior through `@specd/sdk`, invokes `runGraphImpact` once, and does not recompute grouping, coverage, counts, or risk.
- Text output labels logical/declaration/public-binding impact and renders declarations, semantic count units, logical targets, physical evidence, and covering specs.
- JSON/TOON retain the new semantic fields and compatibility aggregate fields.
- Documentation describes the discriminated output, count semantics, examples, and removal of `displayPath`; documentation coverage tests pass.

Not compliant / incompletely evidenced:

- Structured output emits `result.resolvedTarget` unchanged, propagating D3 into JSON/TOON even though the same response also contains the correctly projected sibling `declarations` field.
- Tests cover logical text and JSON plus ambiguity, but do not assert the required exact-declaration text label or the nested `resolvedTarget` path projection (T3).

## Discrepancies

### D1 — HIGH — declarations without grouping evidence are falsely merged

**Spec:** `code-graph:indexer / Classification-aware logical identity construction` requires groups to come from explicit language-provided evidence; same-name declarations with no grouping evidence must remain distinct.

**Code evidence:** `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts:283-336` creates identity from workspace/surface/name/space/owner/member semantics, but does not include `groupKey`. Two descriptors with the same computed identity and both `groupKey === undefined` pass the compatibility check and are stored under the same logical ID. `uniqueLogicalMap` then deduplicates them.

**Reproduction:** a read-only `node --import tsx` probe with two same-name function descriptors on one surface and no group key produced two declarations, **one unique logical ID**.

**Tests:** `reference-fact-helpers.spec.ts:523-624` covers equal explicit keys and conflicting explicit keys, but omits the no-evidence case. The mismatched-key behavior drops both mappings; it does not prove that ungrouped declarations remain distinct.

**Assessment:** code defect. The normative text is explicit. If the intended conservative behavior is instead to omit ambiguous ungrouped declarations, the spec/scenario must be revised; silently merging them cannot satisfy either conservative interpretation.

### D2 — HIGH — SDK legacy fallback collapses a logical target to its first declaration

**Spec:** `sdk:run-graph-impact / Resolution-preserving symbol impact orchestration` says a logical target MUST be passed with its complete declaration set and the SDK MUST NOT invoke impact using one physical declaration ID.

**Code evidence:** `packages/sdk/src/orchestration/run-graph-impact.ts:543-585` branches when `analyzeResolvedSymbolImpact` is absent, selects `resolvedTarget.declarations[0]`, and invokes `provider.analyzeImpact(firstId, ...)`; it then fabricates empty semantic evidence/counts.

**Test evidence:** `run-graph-impact.spec.ts:151-203` deliberately casts an incomplete legacy mock to `CodeGraphProvider` and validates this fallback. The current `CodeGraphProvider` type requires `analyzeResolvedSymbolImpact`, so the fallback is unnecessary for conforming providers yet remains reachable for JavaScript/legacy providers.

**Assessment:** code defect under the merged contract. If runtime backward compatibility is required, the spec needs an explicit, time-bounded exception and truthful degraded result; the current unconditional MUST leaves no such exception.

### D3 — MEDIUM — retained `resolvedTarget` declaration paths are not projected

**Spec:** `sdk:run-graph-impact` requires every retained declaration and evidence location to receive `projectRelativePath` without additional graph reads. `cli:graph-impact` requires structured formats to preserve the SDK contract.

**Code evidence:** `packages/sdk/src/orchestration/run-graph-impact.ts:588-748` constructs `projectedDeclarations` and projected evidence, but `:765-790` returns `resolvedTarget: result.resolvedTarget` unchanged. `packages/cli/src/commands/graph/impact.ts:917-940` emits that raw target in JSON/TOON.

**Test evidence:** SDK/CLI tests assert `result.declarations[*].projectRelativePath`, but do not assert `result.resolvedTarget.declarations[*].location.projectRelativePath`.

**Assessment:** code defect if `resolvedTarget` is part of the retained public result as specified and documented. The alternative is a spec/API clarification that `resolvedTarget` is canonical-only and only the sibling projected declarations are host-facing; that would conflict with the current phrase “every retained declaration.”

## Test Coverage

- Focused run: **203/203 passing** across reference-fact helpers, index integration, traversal, provider composition, SDK impact, CLI impact, and documentation coverage.
- Strong coverage exists for logical all-declaration traversal, exact physical non-widening in domain traversal, physical evidence, semantic counts, covering specs, ambiguity without traversal, public-export dual views, provider filter forwarding, and logical CLI presentation.
- Documentation/public API conformance is covered by barrel exports, SDK/CLI/code-graph documentation, ADR-0029, and `documentation-coverage.spec.ts`.

## Missing Tests

- **T1 (HIGH):** the task-marked mutation matrix is absent. Add incremental-vs-clean comparisons for body edit, move, signature change, overload regroup, owner change, rename, delete, add, and newly resolvable target. Compare logical symbols, declaration mappings/forms, local/public bindings, dependency relations, resolution evidence, and coverage; assert no dangling physical relation endpoints.
- **T2 (MEDIUM):** provider resolved-impact tests should pass exact-declaration and public-binding discriminants and assert the intended separation semantics. If public bindings are intentionally supported only by `analyzePublicBindingImpact`, narrow the merged provider requirement/result union accordingly.
- **T3 (MEDIUM):** SDK and CLI should assert exact-declaration presentation and every nested path-bearing field, especially declarations inside `resolvedTarget` and evidence inside semantic targets.
- **T4 (HIGH):** add the exact scenario “same-name declarations, no grouping evidence” and assert they do not share a logical ID. This test currently fails against D1.
- **T5 (MEDIUM):** replace the incomplete legacy SDK provider mock with a fully typed provider mock. Add a separate explicit compatibility/error test only if legacy runtime providers remain supported.

## Dependency/Global Conformance

- **Architecture:** no new forbidden direction was found. CLI consumes platform behavior from `@specd/sdk`; SDK depends on Code Graph/Core; domain traversal remains a pure domain service; composition owns provider wiring. No concrete store adapter is imported by CLI/SDK delivery code.
- **Conventions:** reviewed changed public functions/types use named ESM exports and explicit contracts; focused strict compilation was already exercised by the passing repository hooks, and focused tests contain no snapshot-only assertions for these scenarios.
- **Symbol model / language adapter dependencies:** classification and owner-first projection align with the partial-mapping model, except D1's unsupported merge. Physical dependency relations remain declaration-level while logical impact is query-time aggregation.
- **Traversal / resolver dependencies:** the normal provider path preserves resolver discriminants and delegates aggregation/risk/coverage to traversal. Exact declaration traversal remains narrow; ambiguous results do not traverse.
- **SDK host/provider lifecycle:** caller-owned providers and transient `withOpenGraphProvider` paths remain distinct and tested; projection is configuration-only.
- **CLI entrypoint/context:** expected output paths and SDK-only platform imports conform. Documentation explains the new schema. D3 is the only structured-output conformance defect found in this slice.
- **Public API/documentation:** required SDK result types and Code Graph provider operation are exported; `docs/code-graph/index.md`, `docs/sdk/index.md`, `docs/cli/graph.md`, and ADR-0029 describe the intended contract. Documentation is ahead of runtime behavior for D2/D3.

## Summary counts

- Specs audited: **4**
- Merged requirements reviewed: **56**
- Merged scenarios inventoried: **231**
- Focused tests executed: **203 passed, 0 failed**
- Confirmed discrepancies: **3** — **2 HIGH**, **1 MEDIUM**
- Missing/insufficient test areas: **5** — **2 HIGH**, **3 MEDIUM**
- Spec status: **1 pass with coverage gap**, **3 partial**, **0 fully blocked**
- Recommendation: **Fix implementation and tests before proceeding**. D1 and D2 contradict explicit MUST-level behavior; D3 should be fixed or the public result contract clarified before signoff.
