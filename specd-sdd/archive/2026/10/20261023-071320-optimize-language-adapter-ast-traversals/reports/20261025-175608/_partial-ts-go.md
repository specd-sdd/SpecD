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
