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
