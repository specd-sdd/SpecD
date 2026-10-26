# Spec Compliance Report — optimize-language-adapter-ast-traversals

## Audit Metadata

- Mode: change-scoped compliance audit
- Change: `optimize-language-adapter-ast-traversals`
- Timestamp: `20261025-175608`
- Lifecycle state during audit: `verifying`
- Change specs: `code-graph:language-adapter`, `code-graph:php-language-adapter`, `code-graph:python-language-adapter`, `code-graph:typescript-language-adapter`, `code-graph:go-language-adapter`
- Direct dependencies: `code-graph:symbol-model`, `code-graph:workspace-integration`
- Applicable global constraints: architecture, conventions, testing, docs, ESLint, continuous integration
- Graph: fresh; aggregate propagation risk is CRITICAL
- Audit behavior: read-only except for report artifacts

## Executive Summary

The optimized AST traversal implementation is behaviorally strong: all 13 changed scenarios have conforming implementation evidence, focused affected tests pass 522/522, SDK and CLI downstream suites pass 1,264/1,264, and code-graph typecheck, lint, and build pass. No demonstrated semantic regression was found in ownership, ranges, caller containment, hierarchy, unresolved behavior, or persisted graph output.

The audit is not clean enough for an automatic lifecycle transition. The most material issue is that a package-internal structural-work observer leaked into three already-public adapter constructor signatures and introduces adapter-instance state, contradicting the no-public-change/stateless intent. PHP also lacks the deterministic work-counter proof required by its acceptance scenario and rebuilds one callable policy in two phases. Across adapters, tests labelled “complete baseline parity” are spot checks rather than complete normalized comparisons. Additional medium/low coverage and design-residue findings are detailed below.

Recommended disposition: **Fix Implementation**. Remove the observer from public constructors, provide internal test seams, share/clarify PHP callable-index scope, add the missing deterministic and parity assertions, and rerun full verification. Updating specs is warranted only if maintainers intentionally want public observer injection or weaker/per-phase acceptance language.

## Aggregated Results

- Change specs audited: **5**
- Direct dependency specs audited: **2**
- Changed requirements audited: **5**
- Changed scenarios audited: **13**
- Scenarios with conforming implementation evidence: **13/13**
- Findings after deduplicating overlapping partial reports: **0 critical, 0 high, 6 medium, 4 low**
- Primary medium findings: public observer constructor leakage; PHP deterministic-work/callable-reuse gap; incomplete full-output parity evidence; Python lexical binding matrix gaps
- Primary low findings: retained optional PHP `scopes` type member; TypeScript member-kind centralization drift; missing direct abstract/Go `OVERRIDES`/unknown-cache assertions
- Informational external issue: one persistent unrelated `index-lock` EPERM test failure

## Verification Evidence

- Affected helper/adapter/conformance suites: **522 passed, 0 failed**
- TypeScript + Go independent focused rerun: **196 passed, 0 failed**
- `@specd/code-graph` typecheck: **passed**
- `@specd/code-graph` lint: **passed**
- `@specd/code-graph` build: **passed**
- `@specd/sdk`: **122 passed, 0 failed**
- `@specd/cli`: **1,142 passed, 0 failed**
- Full `@specd/code-graph`: **1,468 passed, 1 failed**; the failure is the unrelated `index-lock` EPERM liveness test and reproduces in isolation

## Recommended Disposition

Route back to implementation/tests before transition:

1. Remove `StructuralWorkObserver` from the public TypeScript, Python, and Go adapter constructors; use package-internal builders/test harnesses.
2. Build/share the PHP callable containment index at the intended boundary and add deterministic owner/member/callable build counters.
3. Add complete typed normalized baseline expectations or bounded independent slow references across affected dialects.
4. Complete Python lexical binding assertions and the TypeScript/Go composite edge assertions.
5. Remove or explicitly document the legacy optional `PhpParserState.scopes` type member.
6. Rerun the full code-graph suite; disposition the unrelated `index-lock` failure separately.

## Detailed Findings

The complete partial reports follow verbatim for audit traceability.

---

# Compliance Audit Partial: PHP and Python Language Adapters

Change: `optimize-language-adapter-ast-traversals`  
Scope: `code-graph:php-language-adapter`, `code-graph:python-language-adapter`  
Audit mode: change-scoped, read-only  
Graph status: fresh; both adapter files have CRITICAL dependent impact and propagate through code-graph composition, SDK orchestration, and CLI graph commands.

## Requirements Summary

### PHP — Bounded PHP member classification and compact state

The merged requirement adds four principal obligations:

1. Each class-like body is inspected at most once for direct-member association; per-member classification must not recursively traverse owners or method bodies.
2. Association is parser-backed and owner-safe across nested/unrelated owners, repeated names, and source-position collisions.
3. Constructor and static/instance semantics remain parser-authoritative and prior hierarchy/range behavior is preserved.
4. returned parser state is compact and contains neither routine body text nor an unconsumed scope collection.

The merged verification artifact defines three scenarios: bounded large-class work, direct/nested semantic isolation, and absence of unconsumed routine source.

### Python — Bounded Python member and lexical-scope analysis

The merged requirement adds five principal obligations:

1. Each class body is inspected once and direct member/decorator evidence is reused.
2. Decorated definitions are supported while nested functions and nested-class members remain outside the outer owner.
3. Constructor, dispatch, and property getter/setter forms retain established parser-derived behavior, including multiline decorators/comments.
4. Each enclosing function's bare-call binding summary is computed at most once and includes parameters, assignments, augmented assignments, loop targets, `as` aliases, and named expressions while pruning nested functions/classes.
5. Owner/scope lookup uses reusable indexes rather than repeated global or body scans.

The merged verification artifact defines three scenarios: bounded large-class indexing, decorator/nested-owner isolation, and one cached bound-name summary per scope.

## Implementation Status

### PHP

Status: **Implemented and behaviorally conformant, with one low-risk type-surface residue.**

- `collectPhpDirectMemberEvidence()` (`php-language-adapter.ts:413`) locates the direct `declaration_list`/`enum_declaration_list`, iterates its immediate children once, and does not descend into method bodies. It associates methods, properties, constants, and enum cases through `DeclarationSymbolIndex` exact lookups.
- `phpMemberSemantics()` (`php-language-adapter.ts:396`) handles `__construct` before inspecting only the method node's direct children for `static_modifier`; it does not rescan the owner.
- `collectPhpTypeInfo()` (`php-language-adapter.ts:1504`) builds/reuses one declaration index and consumes direct-member evidence per owner. Existing hierarchy names/ranges and trait/extends/implements processing remain parser-backed.
- `analyzeFile()` builds the declaration index once and returns parser state containing `kind`, serialized type info, require relations, and dynamic loader facts. The emitted object has no `scopes` property and no routine source text.
- Call/binding extraction uses reusable callable-containment indexes, preserving innermost half-open caller ownership.
- Existing focused tests also cover compact same-line owners/callers and owner qualification, supplementing the new direct/nested scenario.

### Python

Status: **Implemented and behaviorally conformant.**

- `collectPythonDirectMemberEvidence()` (`python-language-adapter.ts:313`) iterates only direct class-block children, unwraps decorated definitions once, indexes exact declaration identity, and never descends into nested routine/class bodies for outer-member association.
- `pythonMemberSemantics()` (`python-language-adapter.ts:294`) preserves `__init__`/`__new__`, static/class dispatch, and property setter-before-getter semantics from precomputed decorator evidence.
- `collectClassInfo()` (`python-language-adapter.ts:1436`) creates/reuses one declaration index, finds nearest class owners through parser ancestry, and consumes direct evidence without complete-symbol searches per member.
- `createPythonLexicalBindingIndex()` (`python-language-adapter.ts:153`) caches by exact function/lambda range. It collects parameters, assignments, augmented assignments, loop targets, `as_pattern` aliases, and named expressions, while pruning nested functions/lambdas/classes. Repeated calls in the same scope reuse the cached set.
- `analyzeFile()` constructs one declaration index, one callable-containment index, and one lexical index for the file, then passes them through extraction.

## Discrepancies and Findings

### PP-1 — PHP bounded-work scenario lacks deterministic work-counter proof

Severity: **MEDIUM (test coverage gap; no implementation defect demonstrated)**

Evidence:

- The scenario requires deterministic instrumentation to prove that the class declaration list is indexed once and body growth does not multiply classification visits.
- The large PHP test at `php-language-adapter.spec.ts:2881` generates 400 methods and verifies extraction plus compact state, but constructs `baseAdapter` without a `StructuralWorkObserver` and makes no assertion on `owner-member-node-visited`.
- No PHP adapter test references `owner-member-node-visited`.
- The implementation does expose observer-aware `collectPhpDirectMemberEvidence()`, so the missing proof can be added without changing production semantics.

Interpretations:

- **Implementation-correct / tests incomplete:** code structure is a shallow direct-child loop and is consistent with the requirement, but the required deterministic complexity evidence is absent.
- **Spec overly prescriptive:** the structural code inspection plus 400-member completion may be considered adequate, but that would contradict the scenario's explicit instrumentation language and the change's rejection of wall-clock evidence.

Recommendation: add a direct observer-backed PHP builder/adapter test that compares equal member counts with small versus large method bodies and asserts stable `owner-member-node-visited` counts.

### PP-2 — Local “complete output parity” tests do not compare complete normalized baselines

Severity: **MEDIUM (test coverage gap; mitigated by broad regression suites)**

Evidence:

- PHP test `php-language-adapter.spec.ts:2943` and Python test `python-language-adapter.spec.ts:1682` are titled as complete indexed/baseline parity checks.
- The PHP test spot-checks symbol presence, two imports, type-info membership, and one call scope; it does not compare normalized symbols, ranges, bindings, calls, references, diagnostics, parser state, and relations against a baseline.
- The Python test checks non-empty collections and selected class/member facts for `.py`/`.pyi`; it likewise has no baseline oracle or full normalized comparison.
- The broader affected six-file suite passed 522/522 tests; SDK passed 122/122 and CLI passed 1142/1142. The full code-graph suite passed 1468/1469, with only a persistent unrelated `index-lock` EPERM test failure. These regressions materially reduce, but do not eliminate, the missing explicit parity proof.

Interpretations:

- **Implementation-correct / named tests incomplete:** existing regression coverage supplies substantial semantic confidence, but the local tests do not prove the full scenario as written.
- **Verification artifact too strong:** if spot checks plus the existing suite are intended acceptance, “complete normalized facts are identical” should be weakened; doing so would reduce protection for this CRITICAL-impact refactor.

Recommendation: compare stable normalized fixture outputs to a retained slow/reference implementation or explicit complete expected structures, excluding only the intentionally removed emitted PHP `scopes` field.

### PP-3 — Python lexical-summary scenario only partially asserts its required binding matrix

Severity: **MEDIUM (test coverage gap; implementation support is present)**

Evidence:

- The implementation collects every required category: parameters, assignment and augmented-assignment targets, loop targets, `as_pattern` aliases, and named-expression targets, and prunes nested functions/classes.
- The scenario test at `python-language-adapter.spec.ts:1630` declares parameters, a normal assignment, loop target, `with ... as as_binding`, and a walrus target, but only invokes/asserts shadowing for the parameter, normal assignment, and loop target.
- It contains no augmented assignment and does not invoke `as_binding()` or `walrus_target()`; therefore those required categories are not proven.
- The scenario test also does not create nested function/class bindings with the same names and assert that they do not shadow the outer call, despite that being an explicit THEN clause.

Interpretations:

- **Implementation-correct / tests incomplete:** source inspection shows the intended collectors and pruning branches, but regression protection is incomplete.
- **Spec too broad for one scenario:** coverage could be split across multiple focused tests, but equivalent assertions must still exist somewhere; none were found for the omitted categories.

Recommendation: extend the test with augmented assignment, calls to the alias and walrus names, and nested function/class bindings that share an outer unshadowed call name.

### PP-4 — `PhpParserState` retains an optional `scopes` type member

Severity: **LOW (design/task residue; emitted runtime state remains spec-compliant)**

Evidence:

- `PhpParserState` at `php-language-adapter.ts:109` still declares `readonly scopes?: readonly unknown[]`.
- `analyzeFile()` never emits the property, and the new test explicitly confirms it is absent and that serialized state contains no routine markers.
- The merged requirement constrains parser state returned from analysis, which is compliant. The change design/tasks were stricter and called for removing `scopes` from the interface entirely while tolerating older hydrated values through structural typing.

Interpretations:

- **Code is spec-compliant:** optional type compatibility may intentionally document tolerance for legacy hydrated state.
- **Implementation cleanup incomplete:** retaining the property weakens the intended compact-state type contract and diverges from the approved design even though runtime output is correct.

Recommendation: either remove the optional member as designed or document explicitly that it is a legacy-read compatibility field and prove it is ignored.

## Test Coverage

| Spec   | Scenario                                                          | Implementation evidence                                               | Test evidence                                                                      | Assessment                                                     |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| PHP    | Large class body is not traversed per method                      | Direct declaration-list loop; evidence-local modifier classification  | 400-method fixture, compact state                                                  | Partial: missing work-counter/body-growth comparison           |
| PHP    | Direct and nested declarations retain own semantics               | Exact declaration index, owner-local evidence                         | Constructor/static/nested anonymous class; existing compact-owner tests            | Covered                                                        |
| PHP    | Analysis retains no unconsumed routine source                     | Emitted parser state omits scopes/body text                           | Absence of `scopes`, marker absent from serialization, call scope retained         | Covered                                                        |
| Python | Large class indexes direct definitions once                       | Direct block collector and exact declaration index                    | 400 methods and bounded owner-member visits                                        | Covered                                                        |
| Python | Decorators and nested owners remain isolated                      | Evidence-local decorator classification and nearest-owner association | Constructor/static/class/property/nested class plus earlier multiline/comment test | Mostly covered; nested function ownership could be more direct |
| Python | Calls in one scope share one bound-name summary                   | Cached range-keyed lexical index with pruning                         | One cache visit, parameter/assignment/loop assertions                              | Partial: augmented/as/walrus/nested exclusions not asserted    |
| Both   | Indexed and baseline semantics are equivalent (shared dependency) | Refactor preserves output models and existing algorithms              | Broad regressions pass; local “parity” tests are spot checks                       | Partial explicit oracle coverage                               |

Execution evidence supplied by verification:

- Affected helper/adapters/conformance: **522/522 passed**.
- `@specd/code-graph` typecheck, lint, and build: **passed**.
- `@specd/sdk`: **122/122 passed**.
- `@specd/cli`: **1142/1142 passed**.
- Full `@specd/code-graph`: **1468/1469 passed**; sole failure is the unrelated `index-lock` EPERM liveness test and reproduces in isolation.

## Missing Tests

1. Observer-backed PHP direct-member work-count comparison across identical member counts and different body sizes.
2. True normalized full-output baseline/oracle comparison for representative PHP and Python fixtures.
3. Python lexical shadow assertions for augmented assignment, `as` alias, named expression, and nested-scope exclusion.
4. Optional strengthening: a Python class method containing a nested function with a repeated member name, directly asserting it never enters the class's direct member set.

## Spec Dependency Chain and Global Compliance

- `code-graph:language-adapter`: both implementations keep `analyzeFile`, parser-derived facts, callable containment, and compact transient indexes internal to one analysis. No public adapter interface or persisted relation schema changes were found.
- `code-graph:symbol-model`: exact declaration lookups retain symbol IDs, owner IDs, ranges, member semantics, and conservative unresolved behavior. No name-only or raw parser-ID ownership was introduced.
- `code-graph:workspace-integration`: package/session/path behavior is unchanged; new indexes are file-local and do not add filesystem I/O or mutable cross-session caches.
- Global architecture: changes remain inside infrastructure adapters/helpers and import inward-facing domain models; no layer inversion was found.
- Global conventions/eslint: named exports, explicit return types, kebab-case files, JSDoc on new exported internals, strict typecheck, and lint all pass. No `any` was introduced in the reviewed paths.
- Global testing: Vitest files mirror source locations and use explicit assertions rather than snapshots. Findings above concern completeness, not framework/placement violations.
- Global docs: the new exports are direct-module package-internal helpers and are not added to curated public barrels; no user-facing contract changed, so no docs update is required.

No contradiction was found between either merged adapter spec and its direct dependencies or applicable global specs.

## Summary Counts

- Specs audited: **2**
- New requirements audited: **2**
- New adapter-specific scenarios audited: **6**
- Scenarios with conforming implementation evidence: **6/6**
- Scenarios with complete direct test evidence: **3/6**
- Scenarios with partial/indirect test evidence: **3/6**
- Implementation/spec contradictions: **0**
- Findings: **4** — 0 critical, 0 high, 3 medium test gaps, 1 low design/type residue
- Missing/strengthening tests: **4**

Overall assessment: **Implementation behavior is conformant, but verification evidence is not yet fully compliant with the deterministic-bound and complete-parity acceptance language.** The appropriate route is implementation/test work, not spec redesign, unless the user explicitly chooses to weaken the verification requirements.

---

# Compliance Audit Partial: TypeScript and Go Language Adapters

## Scope and evidence

- Change: `optimize-language-adapter-ast-traversals`
- Change specs: `code-graph:typescript-language-adapter`, `code-graph:go-language-adapter`
- Direct dependencies checked for consistency: `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`
- Global constraints checked: architecture, conventions, testing, docs, ESLint, and continuous integration.
- Merged `spec.md` and `verify.md` content was loaded with `changes spec-preview` for both specs.
- Graph impact reports `CRITICAL` aggregate propagation: 27 affected production files, including code-graph composition/public surfaces, SDK orchestration, and CLI graph commands. This is propagation risk, not a detected contract change.
- Independent focused rerun: TypeScript and Go adapter suites passed, 2 files and 196 tests.
- Parent verification evidence: all six affected helper/adapter suites passed 522/522; code-graph typecheck, lint, and build passed; SDK passed 122/122; CLI passed 1,142/1,142. The full code-graph run passed 1,468/1,469, with one persistent unrelated `index-lock` EPERM test failure reproduced in isolation.

## Requirements summary

### `code-graph:typescript-language-adapter`

Changed requirement: **Indexed TypeScript type-member association**.

1. **Large type collection uses indexed association** — implemented. `analyzeFile` creates one `DeclarationSymbolIndex`; `collectTypeDeclarations` performs direct indexed owner lookup; `collectTsDirectMemberEvidence` walks only an owner's direct body children and uses exact kind/name/line/column lookup. The generated 80-class/1,600-plus-member test asserts bounded `owner-member-node-visited` work.
2. **Indexed keys preserve declaration distinctions** — implemented. Direct evidence is sorted by source position and symbol ID, grouped under the exact owner, and retains constructor/static/accessor/signature/member semantics. Existing focused tests cover compact same-line owners, overload grouping/order, constructors, static and instance forms, interface signatures, accessors, nested-owner isolation, and parser-derived ranges.

### `code-graph:go-language-adapter`

Changed requirement: **Indexed Go declarations and method sets**.

1. **Named and receiver declarations use direct indexes** — implemented. `analyzeFile` creates one declaration index and passes it into `collectTypeInfo` and `collectMethodReceivers`; production lookup uses exact kind/name/line/column keys. `buildReferenceFacts` precomputes `interfaceSignatureIds` and owner maps. The generated 80-type/160-method test verifies owner semantics, pointer evidence, interface signatures, and linear structural-work counts.
2. **Embedded interface closure is memoized** — implemented. `GoMethodSetCache` stores a sorted known method set or `null`; `completeGoInterfaceMethodSet` checks the cache before expansion, merges local embedded sets, and `buildRelations` reuses one cache across every struct/interface comparison. The diamond test proves exactly four expansions across three concrete structs and correct `IMPLEMENTS`/`EXTENDS` output.
3. **Unknown method set remains unknown when cached** — implemented. Cycles, missing/package-qualified embeds, and non-interface targets cache `null`; empty, incomplete, or unknown sets cannot emit `IMPLEMENTS`. No Go production path emits member-level `OVERRIDES`.

## Implementation status

| Spec               | Changed requirements | Changed scenarios | Implemented | Demonstrated failures |
| ------------------ | -------------------: | ----------------: | ----------: | --------------------: |
| TypeScript adapter |                    1 |                 2 |           2 |                     0 |
| Go adapter         |                    1 |                 3 |           3 |                     0 |
| **Total**          |                **2** |             **5** |       **5** |                 **0** |

The implementation is consistent with the direct dependency contracts:

- It preserves shared half-open ranges, logical owners, member forms, conservative unresolved behavior, and reusable Pass 2 facts required by `language-adapter` and `symbol-model`.
- It keeps TypeScript package resolution and Go module resolution behavior unchanged, satisfying `workspace-integration` boundaries.
- New helpers and observer hooks are direct-module/package-internal exports only; no new export was added to `src/index.ts` or `src/public.ts`.
- All changed production code remains in the infrastructure adapters; no domain/application dependency inversion or I/O boundary was introduced.
- Public configuration, CLI contracts, persisted schemas, and documentation-visible behavior are unchanged, so the design's no-doc-update decision is consistent with the global docs rule.

## Discrepancies and risks

### 1. MEDIUM — “Complete output parity” tests do not actually compare optimized output with an established baseline

Evidence:

- `typescript-language-adapter.spec.ts`, around line 3004, labels a test “complete output parity” but only checks that a few symbols/imports exist across TS/TSX/JS/JSX.
- `go-language-adapter.spec.ts`, around line 1718, labels a test “Indexed and baseline semantics are equivalent” but creates only the optimized draft and checks basic symbol/import/`IMPLEMENTS` properties. It does not obtain or compare a baseline result.
- The approved tasks explicitly called for bounded slow-reference comparisons of normalized symbols, facts, parser state, diagnostics, and relations. The dependency scenario in `code-graph:language-adapter` also requires comparison with established normalized facts.

Interpretations:

- **Implementation-correct/test-gap interpretation:** the broad pre-existing regression suite and 522/522 focused pass make a semantic regression unlikely, but the named parity acceptance evidence is insufficient and should compare complete normalized outputs against a retained slow/reference path or explicit expected structures.
- **Spec/design-too-prescriptive interpretation:** maintainers may decide that the existing comprehensive suite plus targeted invariants is the accepted baseline, in which case the parity wording/tasks should be narrowed to match the evidence actually maintained.
- No production behavior failure was demonstrated.

### 2. LOW — TypeScript member-kind centralization is only used by grouping, not symbol extraction

Evidence:

- `TS_MEMBER_NODE_KINDS` is declared around line 571 and consumed only by `collectTsDirectMemberEvidence` around line 666.
- Symbol extraction still uses a separate switch over member syntax. The approved design/task 4.1 required one immutable set to be used by both extraction and grouping so supported syntax cannot drift.

Interpretations:

- **Implementation-gap interpretation:** future edits can add a symbol-extraction member kind without adding it to direct association (or vice versa), recreating semantic drift even though current tests pass.
- **Design-overconstraint interpretation:** the merged normative spec requires preserved association behavior, not a particular constant-sharing mechanism; current supported forms are passing, so this is maintainability risk rather than current non-compliance.

### 3. LOW — Composite edge clauses lack direct assertions

Evidence:

- No TypeScript adapter/conformance test fixture contains the word `abstract`, although the changed verification scenario explicitly includes abstract members.
- Go unknown-set tests assert absence of `IMPLEMENTS` for cyclic, external, and empty interfaces, but do not explicitly assert the scenario's “no member-level `OVERRIDES`” clause.
- Go cache behavior is exercised across multiple struct comparisons and repeated direct lookups, but the unknown test does not assert cache entries/counts for every repeated unknown path.

Interpretations:

- **Test-gap interpretation:** add focused assertions for abstract TypeScript members and absence of Go `OVERRIDES`, plus explicit unknown-cache reuse counts.
- **Scenario-redundancy interpretation:** existing member-form/range tests and the fact that Go never emits `RelationType.Overrides` may be considered adequate indirect evidence.
- No contrary production behavior was found.

### Informational — unrelated full-suite failure

The lone `index-lock` EPERM failure is outside the changed files, specs, and dependency paths for this optimization and reproduces in isolation. It should not be attributed to TypeScript/Go AST traversal changes, but it prevents claiming an entirely green full code-graph command in this checkout.

## Test coverage assessment

### Strong coverage

- TypeScript large owner/member scaling with deterministic work counters.
- TypeScript overload order, constructor, static, getter/setter, interface signature, nested-owner, and same-line distinctions across focused existing/new tests.
- TypeScript lexical-summary reuse and shadowing boundaries.
- Go indexed type/receiver association, pointer receiver evidence, and interface signature classification.
- Go diamond embedded-interface expansion with exact once-per-interface counter.
- Go conservative cyclic, external, and empty method sets.
- Go lexical-summary reuse and conservative caller resolution.
- Cross-language conformance plus SDK/CLI downstream regressions.

### Missing or insufficiently direct tests

1. Full normalized pre/post or slow-reference parity for TypeScript, TSX, JavaScript, JSX, and Go.
2. Explicit TypeScript abstract-member association/semantics under the indexed path.
3. Explicit Go assertion that unknown interface satisfaction emits no member-level `OVERRIDES`.
4. Explicit cached-unknown work-count/cache-state assertion across repeated requests.

## Dependency and global compliance

- **Architecture:** compliant. Changes stay inside infrastructure adapters and shared tree-sitter helpers; no forbidden inner-layer import was introduced.
- **Conventions:** compliant based on passing strict typecheck/lint, named exports, explicit return types, and JSDoc on introduced exported constructs.
- **Testing:** structurally compliant (Vitest, mirrored `.spec.ts`, explicit assertions, no snapshots), with the evidence gaps above.
- **Docs:** compliant with the stated internal-only/no-public-contract scope; no CLI/API/config change requires docs.
- **Continuous integration:** build, typecheck, targeted tests, SDK, and CLI are green. Full code-graph is blocked only by the unrelated `index-lock` test.
- **Dependency semantics:** no conflict found with logical symbol ownership, workspace paths/package boundaries, hierarchy provenance, or conservative unresolved behavior.

## Summary counts

- Changed requirements audited: 2
- Changed scenarios audited: 5
- Scenarios implemented: 5
- Demonstrated implementation defects: 0
- Findings: 3 total — 1 medium test-evidence gap, 2 low maintainability/coverage gaps
- Informational external failures: 1 unrelated full-suite test
- Recommended disposition: implementation behavior may proceed only if the reviewer accepts the parity evidence gap; otherwise return to implementation to strengthen tests without changing specs.

---

# Partial Compliance Audit — Shared Language Adapter and Dependencies

Audit scope:

- Change spec: `code-graph:language-adapter` (merged preview for `optimize-language-adapter-ast-traversals`)
- Direct dependencies: `code-graph:symbol-model`, `code-graph:workspace-integration`
- Relevant global constraints: architecture, conventions, testing, docs, ESLint, and CI
- Implementation focus: shared declaration/callable indexes, adapter integration, public-surface boundaries, deterministic work evidence, and semantic regression coverage

The audit is read-only. Code and spec files were not modified.

## Requirements Summary

The change adds one shared requirement with three verification scenarios:

1. **Bounded per-file structural analysis** — repeated owner, scope, declaration, and callable-order evidence is built once at its declared boundary and reused; no per-reference full scans.
2. **Indexed and baseline semantics are equivalent** — optimization preserves physical/logical identity, ranges, parentage, facts, diagnostics, hierarchy evidence, ordering, and relations; unsupported inputs remain unresolved.
3. **Callable containment preserves exact boundaries** — half-open containment and latest-start, earliest-end, stable-ID selection remain unchanged.

Dependency constraints relevant to the change are:

- `symbol-model`: deterministic `SymbolNode` identity and half-open source ranges; physical/logical owner separation; plain immutable parser/session facts; no retained AST/parser runtime; no persisted schema or ID change.
- `workspace-integration`: canonical workspace-qualified file identities and deterministic symbol IDs; package/public-surface resolution remains unchanged.
- Globals: strict TypeScript/ESM and named exports, public JSDoc, test mirroring with Vitest/no snapshots, infrastructure placement, and no undocumented public-contract change.

## Implementation Status

### Compliant implementation evidence

- `createDeclarationSymbolIndex()` builds one file-local map keyed by kind, line, column, and name, records one build event per symbol, sorts exact-key collisions by stable symbol ID, and performs direct lookup (`reference-fact-helpers.ts:116-150`). This preserves the `symbol-model` declaration dimensions for the file-local collection.
- `createCallableContainmentIndex()` filters eligible callable symbols once, excludes incomplete ranges, sorts by start ascending/end descending/ID ascending, builds a balanced interval tree, and performs half-open lookup without rebuilding or candidate sorting (`reference-fact-helpers.ts:276-343`).
- The compatibility facade keeps its existing signature and delegates to the same indexed semantics (`reference-fact-helpers.ts:509-515`). Existing explicit tests cover starts, interiors, exclusive ends, same-line siblings, three-level nesting, policy filtering, and stable tie behavior (`reference-fact-helpers.spec.ts:264-480`), while new tests cover direct-index identity/collision behavior and build counters (`reference-fact-helpers.spec.ts:740-1100`).
- The new helper symbols have full JSDoc and are not re-exported by `src/index.ts` or `src/public.ts`. They remain direct-module/package-internal exports as designed.
- All four adapters consume the shared declaration/callable builders. TypeScript, Python, and Go build reusable declaration/callable/lexical structures at analysis entry and pass them to downstream collection. PHP uses a declaration index for type/member association and per-phase callable indexes rather than per-call full-symbol filtering.
- The indexes contain only plain `Map`, `Set`, arrays, source positions, and `SymbolNode` references during analysis. No persisted ID, relation type, graph-store schema, package resolution, or workspace identity behavior changes. This is consistent with both dependency specs.
- No AST nodes or observer state are serialized into `FileAnalysis.parserState`; PHP's obsolete full-text `scopes` state is removed. This aligns with `symbol-model`'s compact-state rule.
- No docs update is required for the intended internal refactor because commands, configuration, user workflow, and documented adapter semantics are unchanged. This conclusion becomes conditional on resolving Finding SHARED-1, which currently exposes a new constructor parameter in the published `index.d.ts` surface.

### Verification evidence

- Affected helper/adapter/conformance suites: **6 files, 522/522 tests passed**.
- `@specd/code-graph` typecheck, ESLint, and build: **passed**.
- SDK downstream suite: **122/122 passed**.
- CLI downstream suite: **1,142/1,142 passed**.
- Full code-graph invocation: **1,468/1,469 passed**; the sole failure is the unrelated `index-lock` EPERM liveness test, reproduced by itself. It is outside this change's files and graph traversal behavior, but remains an overall green-suite/release concern.

## Discrepancies

### SHARED-1 — MEDIUM — Internal work observer changed public adapter constructors and introduces adapter-instance state

Evidence:

- `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, and `GoLanguageAdapter` now declare `constructor(private readonly structuralWorkObserver?: StructuralWorkObserver)` (`typescript-language-adapter.ts:830`, `python-language-adapter.ts:512`, `go-language-adapter.ts:422`).
- Graph search confirms all three adapter classes are already exported through `packages/code-graph/src/index.ts`.
- The generated public `packages/code-graph/dist/index.d.ts` exposes these constructor parameters (`index.d.ts:920-926`, `1330-1336`, `1824-1830`).
- New tests instantiate the public classes with observers (`typescript-language-adapter.spec.ts:2825,2950`; `python-language-adapter.spec.ts:1542,1635`; `go-language-adapter.spec.ts:1443,1506,1657`).
- The design says observers are package-internal/file-local, production calls omit them, and tests supply counters directly to package-internal builders. It also declares no public API change. The language-adapter contract describes adapters as stateless.

Why this is a discrepancy:

- The optional parameter is source-compatible for existing zero-argument callers, but it is still an emitted public signature change and stores a side-effecting test observer on a reusable adapter instance across files.
- That conflicts with the stated package-internal/file-local test seam and weakens the stateless-adapter invariant. It also makes the “no docs/public contract change” conclusion inaccurate as implemented.

Possible interpretations/remedies:

- **Implementation issue (preferred):** remove observer parameters/fields from exported adapter constructors. Exercise counters through package-internal builders or a package-internal analysis helper so production adapter classes retain their prior public, stateless construction contract.
- **Spec/design drift:** if observer injection on public adapters is intentional, explicitly specify it as supported public API, explain observer lifetime/side effects, update public documentation, and revise the no-public-change/non-goal statements. This is less aligned with the change's stated scope.

### SHARED-2 — MEDIUM — PHP lacks the mandated deterministic work observation and rebuilds one callable policy twice per analysis

Evidence:

- PHP creates the declaration index in `analyzeFile` without an observer (`php-language-adapter.ts:880`).
- PHP independently creates the same `PHP_CALLABLE_KINDS` containment index in binding extraction and call extraction (`php-language-adapter.ts:1674` and `1937`). It avoids a rebuild per fact, but does not reuse one policy index for the full file.
- `collectPhpTypeInfo` can accept an observer internally (`php-language-adapter.ts:1506-1515`), yet the production analysis path does not pass one.
- The PHP “400 methods” test imports `StructuralWorkKind`/`StructuralWorkObserver` but never constructs or asserts a counter. It proves 400 extracted members and absence of serialized routine text, not the scenario's required owner-visit bound (`php-language-adapter.spec.ts:2880-2931`).
- The merged requirement says structural evidence is built once per file, owner, scope, or policy, and complexity verification uses deterministic evidence. The merged scenario explicitly says an internal counter records scans/builds.

Why this is a discrepancy:

- The refactor plausibly removes the original O(M\*N) member walk, but the PHP acceptance scenario is not proven by its mandated deterministic mechanism.
- For callable ownership, the same logical file/policy is filtered and sorted twice. The design describes one index per fact-extraction phase, whereas the merged spec/verification wording says once per file and policy; those two artifacts are not fully aligned.

Possible interpretations/remedies:

- **Implementation/test issue (preferred):** create the PHP declaration/callable index once in `analyzeFile`, pass it to both extraction phases, and provide a package-internal observer seam used by the 400-member test. Assert exact/linear `owner-member-node-visited`, declaration-build, and callable-build counts, including unchanged counts when only method-body statements or query count increase.
- **Artifact clarification:** if one callable build per phase is the intended contract, revise the shared spec and verification scenario to name that boundary explicitly. The PHP test still needs deterministic owner/member work assertions to satisfy the current complexity-verification requirement.

### SHARED-3 — LOW — “Baseline equivalence” evidence is broad but not a frozen pre-optimization oracle

Evidence:

- Shared conformance compares deterministic repeated analyses and clean/incremental/restored graph states, and adapter tests contain extensive explicit semantic expectations.
- The new helper “parity” test compares the compatibility facade with the new index, but the facade itself delegates to the new index. Existing explicit boundary tests prevent this from being wholly tautological.
- Adapter “complete output parity” tests generally assert selected normalized fields/relations rather than running an independent slow reference implementation or comparing a committed pre-change normalized fixture containing every required output dimension.

Why this matters:

- The test matrix is strong and all affected suites pass, but the exact scenario wording claims comparison with established normalized facts across symbols, ranges, parents, imports, bindings, calls, semantics, hierarchy, diagnostics, and relations. The evidence is distributed and does not provide one auditable full-output oracle per language.

Possible interpretations/remedies:

- **Test coverage improvement:** add deterministic, explicit normalized expected objects or a bounded independent slow-reference path for representative fixtures. Keep the existing no-snapshot policy by constructing typed expected structures in code.
- **Spec interpretation:** accept the combination of pre-existing explicit tests plus full/incremental equivalence as the “established normalized facts.” If this is the intended standard, clarify the scenario so it does not imply a separate baseline implementation.

## Test Coverage

| Requirement/scenario                                | Coverage assessment        | Evidence                                                                                                                                                                      |
| --------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated semantic queries reuse structural evidence | Partial                    | Shared declaration/callable counters and TS/Python/Go adapter counters pass; PHP lacks required counter assertions and does not share the same callable policy across phases. |
| Indexed and baseline semantics are equivalent       | Substantial, not complete  | 522 affected tests plus cross-language clean/incremental/restored equality and downstream SDK/CLI suites; see SHARED-3.                                                       |
| Callable containment preserves exact boundaries     | Complete                   | Existing explicit half-open/nesting/tie tests plus reusable-index parity and bounded-build tests.                                                                             |
| Symbol-model identity/range/owner invariants        | Complete for changed paths | Exact key includes kind/name/start; adapter tests cover owner separation, ranges, pointer/member distinctions, and unresolved cases.                                          |
| Compact state/no AST retention                      | Complete for scoped change | PHP serialized-state marker/scopes assertions; no new parser/session persistence types.                                                                                       |
| Workspace/package/public binding behavior unchanged | Strong regression coverage | No package/workspace implementation edits; full affected suites plus SDK/CLI pass.                                                                                            |
| Global TypeScript/JSDoc/lint/build constraints      | Complete                   | Typecheck, lint, build pass; added named exports have JSDoc. Public-constructor scope issue remains SHARED-1.                                                                 |

## Missing Tests

1. PHP deterministic owner/member visit counter for 50/100/200/400 members and for increased method-body size with unchanged member count.
2. PHP assertion that callable eligibility/order is built at the intended boundary and does not rebuild when call query count grows.
3. Public-surface regression asserting exported adapter constructor signatures remain unchanged/no test-only observer type appears in generated package declarations.
4. Optional: one full normalized expected semantic object (or bounded independent slow reference) per built-in language covering every field named by the baseline-equivalence scenario.

## Dependency and Global Compliance

- **`code-graph:symbol-model`:** no persisted identity/schema vocabulary change; exact source identity and half-open containment are preserved; no AST/parser runtime is retained. Compliant, subject to SHARED-1's adapter-state concern.
- **`code-graph:workspace-integration`:** no workspace identity, package entry, public binding, resolution manifest, or derivation fingerprint change. Downstream suites pass. Compliant.
- **Architecture:** changes stay in tree-sitter infrastructure/test modules and introduce no forbidden inner-layer imports. Compliant.
- **Conventions/ESLint:** strict typecheck and ESLint pass; named exports and explicit returns are used. Compliant.
- **Testing:** Vitest files mirror source, use explicit assertions, and add no snapshots. Compliant except the missing deterministic PHP assertion in SHARED-2.
- **Docs/public API:** internal helper exports need no docs, but the public constructor signature leak in SHARED-1 contradicts the no-public-change rationale. Conditionally non-compliant until resolved or documented/spec'd.
- **CI/release health:** specified scoped and downstream checks pass. The unrelated persistent `index-lock` test failure means the full code-graph suite is not green in this environment; treat as an external release blocker or separately owned defect, not evidence that the adapter scenarios failed.

## Summary Counts

- Specs directly/dependency-audited: **3**
- Relevant global spec groups checked: **6**
- New shared requirement scenarios: **3**
- Fully supported scenarios: **1**
- Substantially supported with gaps: **2**
- Findings: **0 critical, 0 high, 2 medium, 1 low**
- Missing/strengthening tests: **4**
- Scoped affected test result: **522 passed, 0 failed**
- Downstream test result: **1,264 passed, 0 failed** (SDK + CLI)
- Unrelated full-suite issue: **1 persistent `index-lock` failure**

Overall assessment: **Behaviorally strong but not clean for transition without reviewer disposition.** The optimized shared structures and semantic boundaries are well implemented and tested, but the observer test seam should be removed from public adapter constructors, and PHP needs deterministic work evidence (plus a clear callable-index reuse boundary) before the new bounded-work contract can be considered fully demonstrated.
