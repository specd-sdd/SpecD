# Spec compliance report — cross-language-symbol-semantics

- Mode: change
- Change: `cross-language-symbol-semantics`
- Generated: 2026-10-16 07:57:27 Europe/Madrid
- State audited: `verifying`
- Scope: 14 changed specs plus global directives and direct depth-1 dependencies
- Graph: current, schema-compatible, coverage complete
- Verification evidence: full monorepo test pipeline passed (24/24 tasks); code-graph 66 files / 1005 tests; SDK 13 files / 111 tests; CLI 87 files / 1137 tests; typecheck 25/25 tasks; lint passed.

## Executive Summary

The implementation is not ready to transition to `done`. The audit confirmed 10 discrepancies: 1 critical, 7 high, and 2 medium. It also identified 15 missing or insufficient test areas.

The critical issue is an internally contradictory merged SQLite contract: the merged spec still mandates schema 14 while the change tasks, code, and tests implement schema 15 with non-null `occurrence_form`.

High-severity implementation defects include physical IDs crossing a logical-only coverage boundary, ungrouped same-name declarations collapsing into one logical target, an SDK compatibility fallback collapsing logical impact to the first declaration, speculative import relations, incomplete imported-hierarchy provenance, TypeScript lexical function identity collapse, and PHP regex-derived Pass-2 structural facts.

No lifecycle transition was performed. The change remains in `verifying` pending the user's remediation choice.

## Aggregate Findings

- Specs audited: 14
- Confirmed discrepancies: 10
  - Critical: 1
  - High: 7
  - Medium: 2
  - Low: 0
- Missing or insufficient test areas: 15
- Recommended workflow: update the SQLite spec contradiction first, then fix implementation/test gaps, then rerun full verification and compliance.

## Detailed Findings

# Adapter compliance audit

## Requirements Summary

Audited merged change specs:

- `code-graph:language-adapter`: unified single-pass adapter contract; parser-authoritative structural facts; strict callable containment; deterministic bindings/calls/imports; truthful capabilities; logical owners; complete ranges; shared hierarchy/provenance; explicit unsupported coverage; cross-language conformance tests.
- `code-graph:typescript-language-adapter`: TS/TSX/JS/JSX declarations, overload groups, object-property filtering, imports/re-exports, scoped dependencies, lexical caller/identity semantics, hierarchy and build-context boundary.
- `code-graph:python-language-adapter`: Python declarations/owners, imports, annotations/decorators, callable containment, conservative nested functions, ordered bases and unsupported MRO behavior.
- `code-graph:go-language-adapter`: Go declarations/receivers, package bindings/imports, selectors/construction, caller containment, embedding, proven interface satisfaction and unsupported build context.
- `code-graph:php-language-adapter`: PHP declarations/owners, namespaces/Composer, literal loaders, scoped aliases, calls/construction, caller containment, hierarchy/traits and truthful coverage.

Direct dependencies checked for consistency: `code-graph:symbol-model`, `code-graph:workspace-integration`, and the common `code-graph:language-adapter` contract. Global conventions were considered through the dependency chain reported by change status.

## Implementation Status per spec

### `code-graph:language-adapter` — PARTIAL

The unified interface and built-in migration exist; all four adapters expose `analyzeFile`, `resolveImports`, `buildRelations`, manifests, capabilities and declaration policy. Shared range-based caller selection is centralized in `reference-fact-helpers.ts:212-251`, uses line+column half-open containment, and has focused tests. The registry is extension-driven and the indexer uses stored analyses plus shared scoped dependency resolution.

The contract is not fully met because several adapters still emit unproven import targets, imported hierarchy relations can lack matching shared hierarchy provenance, and PHP relation construction still derives assignments/calls from source text rather than parser facts.

### `code-graph:typescript-language-adapter` — PARTIAL

Implemented: complete parser ranges/selection ranges, anonymous argument-object key filtering, physical-only anonymous callbacks, common caller containment, overload occurrence forms, imports/re-exports, member owners, type/value facts, hierarchy relations, manifest declaration and `buildContext: false`. The 72-call ArchiveChange regression has direct production-corpus coverage.

Not compliant: unrelated/nested same-name functions are assigned ownerless file-surface logical identities and may be grouped as overloads; relative imports are emitted to the first syntactic candidate without indexed proof; imported hierarchy relations lack corresponding shared hierarchy/provenance facts.

### `code-graph:python-language-adapter` — PARTIAL

Implemented: parser-driven declarations/imports/calls, complete ranges, class/member owners, nested functions kept physical-only, decorators and annotations, common caller containment, deterministic pyproject identity, local ordered hierarchy evidence and `buildContext: false`.

Not compliant: relative imports are emitted to the first path candidate without proof; imported base/protocol relations can be persisted without matching shared hierarchy/provenance evidence.

### `code-graph:go-language-adapter` — PARTIAL

Implemented: parser-driven declarations, receiver ownership and pointer evidence, fields/parents, grouped import classification, common caller containment, local interface embedding, complete same-file method-set proof, no member-level override invention, exact `go.mod` manifest declaration and `buildContext: false`.

Not compliant: `buildRelations` emits `IMPORTS` from every declaration directly to the raw import specifier, including unresolved packages. A current test explicitly expects target `fmt`, which conflicts with the merged detectable-target/common relation contract.

### `code-graph:php-language-adapter` — PARTIAL

Implemented: AST-driven declarations/ranges, properties/constants/enum cases, owners, namespaces/use aliases, require/include extraction, parser-proven framework-loader discovery, caller containment, local hierarchy evidence, Composer identity and exact manifest declaration.

Not compliant: Pass 2 reconstructs alias assignments, explicit constructions and method calls with regexes over callable text; dynamic loader resolution falls back to a nonexistent first candidate; PSR-4 metadata may be read during Pass 2 into adapter-instance state; imported hierarchy relations lack shared provenance.

## Discrepancies

### HIGH — Unresolved imports are persisted as concrete `IMPORTS` edges

The merged common contract requires deterministic/resolvable targets and says unresolved imports/bindings must be dropped from persisted output. Implementations instead manufacture targets:

- TypeScript `buildRelations` resolves a relative specifier syntactically and always takes candidate zero (`typescript-language-adapter.ts:1240-1252`), independent of `context.resolvedImports` or indexed-file existence.
- Python does the same for relative imports (`python-language-adapter.ts:797-811`).
- Go emits every import directly to its raw specifier (`go-language-adapter.ts:638-651`); `go-language-adapter.spec.ts:676-727` codifies the unresolved target `fmt` as expected behavior.
- PHP dynamic loaders choose an indexed candidate but fall back to `loader.candidates[0]` when none exists (`php-language-adapter.ts:1523-1537`), despite the PHP spec requiring indexed candidate proof.

This can create orphan/speculative graph edges and contradicts `Detectable dependency boundary`, `Import specifier resolution`, and the language-specific import requirements. Either the code must consume only proven `ResolvedImports.fileImports`/session hits, or the merged spec would need to explicitly define unresolved external-import nodes (it currently does not).

### HIGH — Imported hierarchy relations are not mirrored by shared hierarchy/provenance facts

TypeScript, Python and PHP build reference hierarchy only when the parent is a same-file/local declaration:

- TypeScript local-only descriptors: `typescript-language-adapter.ts:985-1013`; imported targets are nevertheless accepted for persisted relations at `:1258-1314`.
- Python local-only descriptors: `python-language-adapter.ts:635-655`; `buildRelations` also resolves imported bases/protocols.
- PHP local-only descriptors: `php-language-adapter.ts:1332-1371`; imported parents/contracts are accepted by `extractHierarchyRelationsFromState` (`:1603-1675`).

Thus an adapter can advertise `hierarchy: true` and emit `EXTENDS`/`IMPLEMENTS` while the shared `ReferenceFacts.hierarchy` and ordered steps contain no matching imported-owner route. This directly violates `Hierarchy evidence consistency`, the language-specific provenance requirements, and the explicit rule that a relation alone does not satisfy resolver capability. Code should create pass-2 shared hierarchy/provenance for resolved imported owners, or refrain from persisting/advertising that unsupported edge.

### HIGH — TypeScript unrelated lexical functions can collapse into one logical target

`buildReferenceFacts` gives every non-anonymous `SymbolKind.Function` the file surface with no owner (`typescript-language-adapter.ts:945-978`). When more than one function has the same name anywhere in the file, all receive `groupKey = function:<file>:<name>` without proving an overload group. Nested function declarations and callable variables are extracted recursively, so equal names in distinct outer functions/blocks can become one logical identity.

This violates `TypeScript overload and declaration-group identity` and `TypeScript caller and local-binding semantics`, which require unrelated lexical scopes to remain distinct and demand deterministic lexical ownership for nested callables exposed logically. The current suite covers method overloads and ordinary block locals, but not two equal nested named/callable declarations in sibling scopes.

### HIGH — PHP Pass 2 still manufactures structural binding/call facts with regexes

Although loader discovery itself was migrated to AST nodes, `buildRelations` stores full callable source text and then:

- finds alias assignments with regex (`php-language-adapter.ts:638-653`),
- finds explicit constructed/acquired instances with regex (`:655-686`), and
- finds receiver method calls with a dynamically built regex over `scopeText` (`:1539-1597`).

This path can match call-shaped text inside a string/heredoc within a real method and emit a `CALLS` relation when a compatible alias/target symbol exists. It also re-derives assignment/call structure instead of consuming the parser-proven `bindingFacts` and `callFacts` already present in the analysis. That contradicts both parser-authoritative structural extraction requirements and the PHP requirement that framework rules inspect parser-proven calls/arguments. The existing lookalike regression checks only `analyzeFile` loader/require state (`php-language-adapter.spec.ts:1529-1620`), not relations produced by this regex compatibility path.

### MEDIUM — PHP PSR-4 metadata can perform Pass-2 I/O outside `IndexSession`

`resolveImports` calls `resolveQualifiedNameToPath` (`php-language-adapter.ts:1439-1441`, `:1474-1476`), which lazily calls `buildPsr4Map`; that reads `composer.json` through `findManifestField` and stores the result in an adapter-instance `psr4Cache` (`:1027`, `:2350-2395`). The common merged spec requires metadata needed during Pass 2 to have been prepared during analysis or live in deterministic run-scoped `IndexSession` cache state, and forbids Pass-2 filesystem probing per import. Adapter-instance cache lifetime can also cross indexing sessions. Either preload PSR-4 state into the session or revise the common contract/interface documentation, which currently disagrees with the merged requirement.

## Test Coverage

Present coverage is strong for:

- shared half-open containment, innermost caller selection, no nearest-preceding fallback, ownership, physical-only declarations, determinism and basic lookalike isolation;
- TypeScript declaration/range breadth, array/object filtering, imports/re-exports, method overloads, nested/chained calls and the 72 ArchiveChange cases;
- Python declarations/imports, package identity, annotations/decorators, nested-function policy, containment and string/comment isolation;
- Go declarations/receivers/import forms, fields, interface embedding/satisfaction, containment and lookalike isolation;
- PHP declarations/owners, Composer/PSR-4 basics, loaders, scoped alias behavior, hierarchy basics, containment and loader/require lookalikes.

The six focused Vitest files were started together. Vitest reached `RUN v4.1.10` but produced no case results for roughly 40 seconds and was interrupted to avoid leaving a hung verification process. Therefore this partial audit does not claim a fresh green execution; it relies on static inspection plus the test definitions. The parent verifier should record the authoritative full-suite result separately.

## Missing Tests

- Cross-language negative test: unresolved relative/package/framework imports produce no persisted `IMPORTS` edge and no orphan target.
- TypeScript: same-name nested functions and callable variables in sibling scopes do not share a logical ID or overload group; invalid duplicate implementations are not treated as overloads.
- TypeScript/Python/PHP: imported `EXTENDS`/`IMPLEMENTS` must have matching shared hierarchy facts and ordered provenance steps, or explicit unsupported coverage.
- PHP: a method string/heredoc containing `$alias->method()` after a real loader must not produce `CALLS`; comments/strings that resemble alias assignments or `new` expressions must not seed aliases.
- PHP: Pass-2 import resolution performs no filesystem read and cache state is isolated per indexing session.
- Conformance boundary matrix per built-in adapter for optional/chained/computed/generic calls, nested expressions and compact same-line constructs. The generic fixture currently proves comments/strings and one multiline call, not the full mandatory matrix for every language.
- Go: replace the current raw-specifier expectation with an indexed resolved target plus a negative unresolved-package case.

## Dependency/Global Conformance

- **Symbol model:** complete ranges, logical owners and declaration occurrences are generally used correctly. The TypeScript lexical-function collapse and imported-hierarchy provenance gaps violate the symbol-model owner/provenance semantics.
- **Workspace integration:** manifest searches are bounded in tests and package identities are present. PHP's adapter-instance PSR-4 cache/Pass-2 I/O does not honor the shared session boundary.
- **General adapter contract:** all built-ins use the unified three-phase API and common caller containment. Speculative import targets and PHP regex relation construction violate deterministic shared-fact boundaries.
- **Global conventions:** no error-handling or architecture issue was found in the audited paths beyond the ownership/session-boundary findings above.

## Summary counts

- Specs audited: **5**
- Status: **0 fully compliant, 5 partial, 0 absent**
- Discrepancies: **5 total — 4 HIGH, 1 MEDIUM**
- Missing test groups: **7**
- Fresh targeted test result: **inconclusive (runner stalled before reporting cases)**

---

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

---

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
