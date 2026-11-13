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
