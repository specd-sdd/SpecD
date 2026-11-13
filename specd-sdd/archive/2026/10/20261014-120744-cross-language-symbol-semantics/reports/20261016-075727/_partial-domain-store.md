# Domain, traversal, and store compliance audit

Scope: merged previews for `code-graph:symbol-model`, `code-graph:resolve-symbol-reference`, `code-graph:traversal`, `code-graph:graph-store`, and `code-graph:sqlite-graph-store`, including their verification artifacts, global specs, and direct depth-1 dependencies. The code graph was current (`stale: false`, schema compatible, coverage complete). This was a read-only audit; only this report was written.

## Requirements Summary

The five merged specs contain 98 unique requirement sections and 378 verification scenarios. The change-specific additions introduce these contracts:

- Three non-bijective identity layers: physical declaration occurrences, lexical `LocalBinding`s, and stable `LogicalSymbol`s.
- Evidence-preserving semantic projection, logical `COVERS_SYMBOL` endpoints, and explicit logical-versus-physical count units.
- Discriminated logical, exact-declaration, and public-binding resolution results with complete declaration evidence.
- Logical-target impact seeded from every declaration, physical-edge traversal, shallowest-depth logical aggregation, and physical-only classification.
- Backend-neutral, bounded logical/declaration batch mappings with deduplication, unknown omission, deterministic ordering, and empty-input no-work behavior.
- SQLite schema/worker support for occurrence forms, one-RPC logical batches, chunked set-based SQL, and strict reverse logical coverage.

## Implementation Status per spec

### `code-graph:symbol-model` — substantially implemented

Implemented evidence includes `DeclarationOccurrenceForm`, `DeclarationOccurrence`, `LogicalSymbol`, `LocalBinding`, discriminated `ResolvedSymbolTarget`, and semantic impact DTOs in `packages/code-graph/src/domain/value-objects/symbol-reference.ts` and `impact-result.ts`. Public barrels export the new contracts. Physical dependency evidence retains source/target declaration IDs, locations, relation type, and depth. Tests cover scope-distinct locals, physical-only navigation, occurrence form, discriminants, and aggregation.

No implementation discrepancy was found in the two requirements added by this change. Their behavior is, however, affected by the traversal coverage defect described in finding DS-2.

### `code-graph:resolve-symbol-reference` — implemented

`ResolveSymbolReferenceInput` exposes exact declaration and position selectors. `ResolvedSymbolTarget` explicitly discriminates `logical-target`, `declaration`, and `public-binding`. `ResolveSymbolReference` batches exact physical reads, maps exact declarations to logical symbols when possible, loads all declarations for logical candidates, groups ambiguity at the selected identity layer, and retains deprecated `target` only as a compatibility projection. Tests cover exact ID/position resolution, selector exclusivity and coordinates, physical-only exact declarations, target-layer ambiguity, and complete logical declarations.

No discrepancy was found for the change-added resolution requirement.

### `code-graph:traversal` — partially implemented

`analyzeResolvedSymbolImpact` seeds logical targets from all distinct declarations and exact targets from only the selected declaration. It traverses the physical relation families, hydrates source locations, aggregates mapped declarations once at shallowest depth, preserves physical-only results, separates semantic and occurrence counts, and derives risk from logical plus physical-only targets. Tests cover all-declaration seeding, exact non-widening, shallow aggregation, evidence/count preservation, physical-only classification, and logical coverage evidence.

Reverse coverage is correct when at least one reached declaration maps to a logical target, but the all-physical-only path violates the merged spec (DS-2).

### `code-graph:graph-store` — implemented at the port/backend contract, with one consuming-service violation

`GraphStore` exposes `findDeclarations(logicalSymbolIds)`, `findLogicalDeclarationsByDeclarationIds(declarationSymbolIds)`, `findLogicalSymbolsByIds(ids)`, and explicit logical-ID coverage methods. SQLite and the in-memory test implementation preserve forward/reverse mapping semantics. The shared contract suite covers repeated/unknown identities, first-request order for declaration mappings, occurrence forms, empty batches, and strict logical coverage endpoints.

The port and both store implementations satisfy the new requirements. A traversal consumer bypasses their identity-domain discipline by passing physical IDs into a spec frontier when mapping returns no logical IDs (DS-2).

### `code-graph:sqlite-graph-store` — code implements the intended schema-15 design, but merged spec contradicts it

SQLite persists non-null `occurrence_form`; host methods deduplicate and issue one typed worker request; the protocol distinguishes `logicalSymbolIds` and `declarationSymbolIds`; the worker dispatches explicit operations; database queries chunk parameters inside the worker and preserve mapping order; reverse coverage joins `logical_symbols`; empty batches avoid RPCs. Relevant integration and protocol tests pass.

The implementation intentionally uses schema version 15, while the still-merged base requirement mandates version 14 and explicitly treats 15 as incompatible. This is a blocking spec/code contradiction (DS-1).

## Discrepancies

### DS-1 — CRITICAL — merged SQLite spec still mandates schema 14 while code and change tasks implement schema 15

Evidence:

- `specs/code-graph/sqlite-graph-store/spec.md:342-360` says the reference schema version **MUST be 14**, requires `SQLITE_SCHEMA_VERSION` 14, describes version-14 columns, and requires worker rows to use version-14 columns.
- Its merged verification scenarios include “Version 14 opens without rebuild” and “Any other version is incompatible”, explicitly using version 15 as an incompatible example.
- `packages/code-graph/src/infrastructure/sqlite/schema.ts:1` defines `SQLITE_SCHEMA_VERSION = 15`; `logical_declarations.occurrence_form` is non-null at line 92.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1598-1611` explicitly expects version 15 and `occurrence_form`.
- Change task 5.3 explicitly says “Persist occurrence form in schema 15” and “bump 14 to 15”, but the SQLite spec delta only adds logical mapping/coverage requirements and never modifies the existing version requirement.

Spec-vs-code assessment:

- Code-correct/spec-drift possibility: strongest evidence. Adding a non-null persisted column justifies a derived-store rebuild and version bump, and the implementation, tasks, and tests consistently use 15.
- Spec-correct/code-bug possibility: if version 14 truly remains the supported contract, the implementation and tests are breaking and databases marked 14 are incorrectly rejected.
- Both-partially-wrong possibility: schema 15 may be correct, but the intended compatibility/rebuild scenarios for 14→15 have not been specified. The merged contract is internally impossible until the base requirement and verification scenarios are revised.

Impact: verification cannot honestly mark `sqlite-graph-store` compliant because the same merged spec simultaneously requires the new persisted field and the old schema version.

### DS-2 — HIGH — physical-only declarations are passed to logical coverage traversal when no mapping exists

Evidence:

- The merged traversal requirement says reverse `COVERS_SYMBOL` lookup must use logical IDs, must never query with a `SymbolNode.id`, and physical-only declarations are coverage-not-applicable.
- `packages/code-graph/src/domain/services/collect-impact-specs.ts:27-38` maps physical IDs, but falls back to `uniqueSymbols` when no mapping exists.
- The same file at lines 100-105 sets `symbolFrontier` to `physicalDeclIds` when `logicalDepths` is empty, then issues a `CoversSymbol` `queryImpactFrontier` at lines 117-127.
- Consequently, an impact containing only unmapped physical declarations crosses a logical coverage boundary with physical IDs. SQLite's strict join normally prevents a false match, but the call itself violates the contract and other `GraphStore` implementations are forced to receive an invalid identity domain.
- Current traversal tests assert that an unmapped reached declaration is classified as `physical-only`, but they do not spy on the coverage frontier to prove that its physical ID was not queried.

Spec-vs-code assessment:

- Code-bug/spec-correct possibility: strongest evidence. Removing the physical-ID fallback and skipping logical symbol coverage for the unmapped subset matches the port, SQLite, traversal, and symbol-model contracts.
- Code-correct/spec-drift possibility: only plausible if legacy physical `COVERS_SYMBOL` endpoints remain intentionally supported, but the merged specs repeatedly and explicitly prohibit them.
- Both-partially-wrong possibility: if a compatibility fallback is still required, it needs a separately named physical-coverage endpoint/result classification rather than reuse of the logical endpoint.

Impact: the strict identity-domain invariant is violated in both `collectImpactSpecIds` and `collectLogicalCoveringSpecs`; a non-SQLite backend could accidentally match or retarget a physical relation.

## Test Coverage

Focused package execution completed successfully: **66 test files, 1005 tests passed**. The command selected the code-graph package and, due the package script's argument handling, exercised the full package suite rather than only the requested files.

Strong coverage observed:

- Identity forms, logical stability, physical-only navigation, and resolved-target discriminants.
- Exact declaration selector validation, complete logical declarations, and ambiguity behavior.
- All-declaration traversal seeding, exact non-widening, shallow logical aggregation, physical evidence, distinct count units, and risk stability.
- Backend-neutral mapping order/deduplication/unknown omission/empty input.
- SQLite occurrence-form round trip, >parameter-limit chunking, strict logical join behavior, schema constant/DDL, one-RPC payloads, and empty no-RPC semantics.

## Missing Tests

1. Add a traversal/coverage test where every reached symbol is physical-only and assert that no `COVERS_SYMBOL` frontier or `getCoveringSpecsForSymbols` call receives a physical declaration ID. This would expose DS-2.
2. Add a merged-spec lifecycle test (or update the existing verification artifact) covering schema 14→15 rebuild, version-15 open without rebuild, and rejection of versions other than 15. Current code tests assert 15, while the merged verification artifact still asserts 14.
3. A direct public-binding domain traversal test would strengthen the scenario that exact public-binding impact preserves route semantics; current coverage is strongest at provider/SDK layers and exact-declaration traversal.

## Dependency/Global Conformance

- `default:_global/architecture`: conformant. `GraphStore` remains a domain port; SQLite details remain under infrastructure; domain traversal depends only on the port; no outer-layer import was found in the audited implementation.
- `default:_global/conventions`: conformant in inspected code. Contracts are readonly, named exports are used, strict identity-domain names are present in new payloads, and no `any` was introduced in the audited surfaces.
- `default:_global/testing`: conformant. Vitest tests mirror source areas, use explicit assertions rather than snapshots, and SQLite integration fixtures use temporary directories/cleanup.
- `default:_global/error-handling-conventions`: no new expected user-facing failure shape in this batch conflicts with the convention.
- `code-graph:language-adapter`, `workspace-integration`, `document-model`, and `staleness-detection`: no direct contradiction found. The new physical/logical projection preserves workspace-qualified identities and does not change document semantics or freshness ownership.
- `core:config`: SQLite persistence remains derived from the configured graph root; no caller-visible SQLite companion-path configuration was introduced.
- Internal dependency conformance among the five specs is sound except for DS-1 (SQLite version contract) and DS-2 (traversal crossing the logical coverage boundary with physical IDs).

## Summary counts

- Specs audited: **5**
- Unique requirement sections reviewed: **98**
- Verification scenarios in merged previews: **378**
- Fully conformant specs: **2** (`symbol-model`, `resolve-symbol-reference`)
- Substantially conformant with an inherited/consumer defect: **2** (`traversal`, `graph-store`)
- Non-conformant due blocking spec/code contradiction: **1** (`sqlite-graph-store`)
- Findings: **2** total — **1 critical**, **1 high**, **0 medium**, **0 low**
- Missing/insufficient test cases called out: **3**
- Executed tests: **1005 passed**, **0 failed** across **66 files**
