# Specs compliance: change go-selectors-python-reexports (2026-11-02)

Read-only audit. Specs read as merged previews (spec.md + verify.md deltas). Implementation: uncommitted changes in packages/code-graph plus docs/code-graph/language-adapters.md. Tests reported passing (1760).

Legend: OK = implemented as specified; DISC = discrepancy; GAP = missing test.

## Summary counts

- Requirements in scope: 6 (go 2, python 2, symbol-model 1, language-adapter 1). All implemented; 0 outright violations; 3 with medium-severity discrepancies.
- Verify scenarios in scope: 36 (go 15, language-adapter 5, python 13, symbol-model 3).
- Scenarios compliant with full or adequate test coverage: 27.
- Scenarios compliant in code but with partial or missing test coverage: 9.
- Discrepancies: 3 medium, 7 low, 0 high.
- Missing tests: 14 items listed under "Missing tests".

---

## code-graph:go-language-adapter

### Requirement: Package identity, exports, and imports (modified) - implemented

- Namespace name order (alias, shared declared package clause of all non-test entries, last segment): OK. `goNamespaceBindings` and `declaredPackageName` (go-language-adapter.ts ~1218-1288). Declared name read from `session.getAnalysis(...).parserState.packageName` (no fs read). Alias detected through `GoParserState.explicitAliases` (specifier + alias pair).
- Blank and dot imports bind no namespace: OK (skipped by import kind).
- Two imports producing the same name: both dropped (design choice, not in spec; Go would not compile). Not a discrepancy.
- Lowercase names never resolve: OK, short-circuited with `/^\p{Lu}/u` before the helper. Spec text says uppercase Unicode letter: OK. Side effect: the helper's `not-exported` path is never exercised for lowercase names (fine).
- Resolution through `resolvePackageExport` with specifier, name, spaces; no name search: OK.
- Shadowing: the spec says a namespace name bound lexically at the selector (parameter, result, receiver, local variable, local declaration) is shadowed. DISC (low, D1): shadow check (`isGoShadowedByEnclosingScope`) is applied only to `call` facts and at fact emission time. `construct` and `type` facts are emitted and resolved with no shadow check. In valid Go a shadowing variable makes `x.User{}` / `x.User` type use uncompilable, so the practical impact is nil. The spec and language-adapter requirement say resolution must not happen when shadowed; the code makes shadowing an emission filter, so a shadowed call produces no fact at all, whereas symbol-model says a fact is emitted per `ident.Name` selector in a call. Spec-wrong possibility: the scenario only requires "selector is not resolved". Code-wrong possibility: apply the check uniformly (or at resolution).
- `resolveImports` file dependencies on package entry files and diagnostics with helper reason: unchanged existing behavior, OK.

Scenarios:

| Scenario                                      | Impl        | Test                                                                                                                                        |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit alias is the namespace name          | OK          | Covered (go-language-adapter.spec "explicit alias"); assertion that the path-derived name `models` is NOT bound is absent (GAP)             |
| Declared package name wins over path segment  | OK          | Covered                                                                                                                                     |
| Versioned module path uses declared name      | OK          | Covered (`/v2`)                                                                                                                             |
| Last path segment is the fallback             | OK          | Partially covered: differing package names covered; "entries not indexed" branch and "no filesystem read" not asserted (GAP)                |
| Blank and dot imports bind no namespace       | OK          | Covered (single combined test)                                                                                                              |
| Qualified selector across packages resolves   | OK          | Covered (adapter test + integration test); file-level dependency retention not asserted in the new tests (existing tests cover fileImports) |
| Unexported name stays unresolved              | OK          | Covered for call (`auth.newUser()`); "not searched by name" not asserted                                                                    |
| Shadowed namespace name is not the package    | OK for call | Covered for param + call; no test for result/receiver/local var/local declaration shadowing variants (GAP)                                  |
| Unresolved package leaves selector unresolved | OK          | Covered (`fmt`); "counted as external, not failure" covered only by pre-existing indexer tests, not by a Go selector test (GAP)             |

### Requirement: Scoped bindings, selectors, construction, and types (modified) - implemented

- `call` facts: function operand of a call whose operand is a single identifier: OK. Generic instantiation calls `models.Fn[int]()` are not emitted (function is an index/instantiation expression). Not required by spec text but "function operand of a call expression" may arguably include it. Low (D2).
- `construct` facts: qualifier retained, generic form `models.Box[T]{}` handled, the qualified type is consumed so it does not also emit `type`: OK.
- `type` facts: every other `qualified_type` node (parameter, result, field, var, const, type declaration, type argument): OK in code.
- Symbol spaces `value` for call, `type` for construct/type: OK.
- `sourceSymbolId`: DISC (medium, D3). For `call` and `construct`, containment uses callable-only index (`createCallableContainmentIndex` default). Symbol-model says the innermost declaration whose range contains the reference. A call or composite literal in a package-level `var x = models.New()` has an enclosing Variable declaration but gets `sourceSymbolId` undefined and therefore no relation. `type` facts use a widened kind set (Function, Method, Class, Interface, Type, Variable, Property), so behavior is inconsistent between kinds. Spec-wrong possibility: language-adapter says missing source for call/construct blocks relations, implying that absence is expected. Code-wrong possibility: use the widened index for all kinds.
- `A selector whose operand is a receiver/local/value produces no relation`: OK (namespace lookup fails). The fact itself is still emitted for `u.Save()`, as symbol-model expects.
- Unresolved dropped, no guessed relation: OK.
- Relations deduplicated by `source:type:target` with the other relations of the file (shared `seen` set): OK.
- `buildRelations` early-return path when `parserState` absent still appends qualified relations: OK.

Scenarios:

| Scenario                                          | Impl | Test                                                                                                                                                                                             |
| ------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Qualified call produces CALLS                     | OK   | Covered (relation source main -> NewUser); fact `sourceSymbolId`/qualifier assertions only indirect                                                                                              |
| Qualified composite literal keeps qualifier       | OK   | Covered (construct fact qualifier asserted in alias/declared-name tests; CONSTRUCTS relation covered)                                                                                            |
| Qualified types produce USES_TYPE                 | OK   | Covered for var, parameter, field; result type is combined with parameter in the same enclosing function so it cannot be told apart (GAP); const, type declaration, type argument untested (GAP) |
| Value receiver selector is not a package selector | OK   | Covered (`u.Save()`)                                                                                                                                                                             |
| Unresolved qualified call dropped silently        | OK   | Partially: lowercase and unknown-package covered. The literal scenario (`models.Missing()`, uppercase name not exported, helper returns `not-exported`) is not tested at adapter level (GAP)     |
| Selectors resolve across workspaces               | OK   | Covered (adapter + integration)                                                                                                                                                                  |

---

## code-graph:python-language-adapter

### Requirement: Imports and package resolution (modified) - implemented

- `from pkg import X` resolves to the declaration that a re-export route published by the entry file reaches: OK; relies on the existing resolver reading public bindings published on the entry surface (surface = path without `/__init__` and extension, same as `entrySurface`).
- Import of non-published names stays submodule dependency or unresolved; plain `import x` in an entry stays non-route: OK.
- Resolved imports return `import:package` step: OK (integration test asserts it).
- No name search: OK.

### Requirement: Public surface and stub behavior (modified) - implemented

- `reExportLinking` facet provided: OK (`get reExportLinking()`).
- Route = module-level `from <module> import <name> [as alias]` in `__init__.py`/`.pyi`: OK (only direct children of the module root, so try/if/function/class excluded; wildcard skipped).
- Relative route, absolute same-package route, absolute leaving the package, alias, chained, cycle: OK. Fix-point loop with a guard handles any file order; cycles publish nothing.
- Route whose module resolves to none or more than one file, `.py` preferred over `.pyi`: OK (`kept.length === 1`).
- Static `__all__` (=, += with literal list/tuple of plain strings, `+` concatenation); filters routes only, not declarations; dynamic publishes no routes of the file; listed ghost name creates nothing: OK.

Discrepancies:

- D4 (medium) Existing requirement "Re-export public bindings" (code-graph:language-adapter) says a relative specifier SHALL resolve through `relativeImportResolution` and a non-relative package specifier through `packageResolution`. The Python linking does neither: it builds candidates with its own helpers (`pythonModuleCandidates`, `pythonGraphDirUp`, `splitWorkspaceIdentity`) and ignores `packageToWorkspace`. Behavior is equivalent for the supported layouts (code root and `src/`), but if facets evolve (for example new layouts for `relativeImportResolution`) route resolution will diverge. Spec-wrong possibility: Python is not named in that requirement's TypeScript-centric wording. Code-wrong possibility: reuse the facets.
- D5 (medium) "Same package" for an absolute route is implemented as "the candidate file lies under the entry file's own directory" (`startsWith(dirname(entry)/)`). A sub-package entry `acme_auth/sub/__init__.py` containing `from acme_auth.models import User` (a sibling, same top-level package) is NOT a route, although the spec says "an absolute module that resolves to an indexed file inside the same package". docs/code-graph/language-adapters.md documents the directory interpretation ("names a file inside that entry's directory"). Spec-wrong possibility: spec wording is ambiguous; design/proposal said "inside the same package". Code-wrong possibility: compare against the top-level package root.
- D6 (low) `from . import name` is not a route in code and docs (design non-goal). The spec text says the module is "either a relative module or an absolute module", and `.` is arguably a relative module. Spec should state the exclusion explicitly (or the code should support it).
- D7 (low) `classifyPythonAll` marks `__all__` dynamic on ANY reference to the identifier (including read-only uses such as `"X" in __all__`, or `other.__all__`). The spec only makes assignments (and `.extend` and similar mutations) matter. Conservative direction; spec text ("every assignment to it ... is = or +=") does not say reads disqualify.
- D8 (low) The spec carries over "MUST NOT infer public exports merely because a declaration name lacks a leading underscore", while existing code and test (`publishes module-level names without a leading underscore as public bindings`, python-language-adapter.spec.ts line ~212) publish module-level declarations by that convention. Pre-existing tension, now restated in the modified requirement and made more visible by "module declarations are not filtered". Spec-wrong (sentence should be scoped to imports/aliases) is the likelier fix.
- D9 (low) Stray docblock: `/** Parser state representation for Python. */` was left above `PythonReExportInfo` and now precedes another docblock, with the original repeated above `PythonParserState` (default:\_global/docs JSDoc and cleanliness). Cosmetic.

Scenarios:

| Scenario                                                                        | Impl | Test                                                                                                                |
| ------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| Re-exported name resolves through the entry file                                | OK   | Covered (integration + indexer languages spec)                                                                      |
| Plain import in an entry file is not a route                                    | OK   | Covered inside the combined "cycle, nested, conditional, wildcard, plain" test                                      |
| Relative re-export is a route                                                   | OK   | Covered                                                                                                             |
| Absolute same-package re-export is a route                                      | OK   | Covered (entry-directory case only)                                                                                 |
| Absolute import leaving the package                                             | OK   | Covered                                                                                                             |
| Alias publishes the alias name                                                  | OK   | Covered                                                                                                             |
| Chained re-exports keep final target                                            | OK   | Covered                                                                                                             |
| Cycles and nested imports publish nothing                                       | OK   | Covered in one combined test (cycle, try:, if TYPE_CHECKING, function not separately asserted)                      |
| Wildcard import is not a route                                                  | OK   | Covered (combined)                                                                                                  |
| Static `__all__` filters routes                                                 | OK   | Covered, including "declarations not filtered"                                                                      |
| Literal concatenation and augmented assignment                                  | OK   | Covered                                                                                                             |
| Non-static `__all__` publishes no routes                                        | OK   | Covered (comprehension and `.extend` forms; verify one or both)                                                     |
| Listed name without a route                                                     | OK   | Covered                                                                                                             |
| Naming convention does not publish (import alias stays local, .pyi addressable) | OK   | Partially covered (non-route stays unresolved); `.pyi` addressability without runtime merging has no new test (GAP) |

(Python verify has 13 scenarios plus the 2 imports scenarios; the table above lists all 14 rows grouping the final one.)

---

## code-graph:symbol-model

### Requirement: Qualified reference facts (added) - implemented

- Optional `qualifiedReferenceFacts` on `FileAnalysisDraft` (inherited by `FileAnalysis`): OK, `readonly`, optional (file-analysis.ts).
- Fact carries `qualifier`, `name`, `kind` (`call|construct|type`), `sourceSymbolId`, `location`, plus `filePath` (extra field consistent with design): OK.
- Syntax only, no target: OK. Plain immutable data, no parser objects, no change to IDs or schema: OK.
- Exported from `domain/value-objects/index.ts`, `src/index.ts`, `src/public.ts`; `barrel.spec.ts` updated: OK.
- DISC D3 above applies to "innermost declaration" for call/construct.

Scenarios: Absent collection equals empty: OK, covered (qualified-reference-fact.spec.ts, qualified-reference-contract.spec.ts for TS/PHP/Python). Fact carries syntax only: OK, covered indirectly (Go facts asserted); no direct test of the "names no target" invariant beyond type shape (low GAP). Fact is plain data: OK, covered (serialization test).

---

## code-graph:language-adapter

### Requirement: Qualified reference resolution (added) - implemented in Go

- Resolution in `resolveImports()` with `ImportResolutionContext` helpers; relations in `buildRelations()` from the returned targets: OK.
- Conditions (bound namespace, no shadowing, helper resolves): OK (see D1 for shadow scope).
- `ResolvedImports.qualifiedTargets` optional map keyed by `qualifiedReferenceKey`: OK; absent equals empty (consumers use `?.get` / `?? []`).
- CALLS/CONSTRUCTS/USES_TYPE by kind; dedup with other relations: OK.
- Silent drop: OK; no diagnostic is emitted for qualified failures.
- Missing `sourceSymbolId` blocks relations: OK (the code blocks it for all three kinds, including `type`; spec requires it only for call and construct, but a relation needs a source anyway). Low note.
- DISC D10 (low): helper step is contributed only when the namespace has a file-scope Namespace local binding (`localBindingId !== ''`); the spec says a resolved fact SHALL contribute the helper's step unconditionally. Without a local binding the step would have an invalid `fromId`, so this is defensible; spec should say so.
- Python does not emit facts: unchanged, optional-field behavior verified by `qualified-reference-contract.spec.ts`.

Scenarios:

| Scenario                                             | Impl | Test                                                                                                                         |
| ---------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| Resolved fact produces relation of its kind (+ step) | OK   | Covered via Go test (all three kinds, `import:package` step)                                                                 |
| Unresolved fact dropped silently (4 helper reasons)  | OK   | Partial: `package-unknown` and lowercase covered; `not-exported` (uppercase), `ambiguous`, `no-entry-surface` untested (GAP) |
| Shadowed qualifier does not resolve                  | OK   | Covered (call, via Go)                                                                                                       |
| Missing source symbol blocks call and construct      | OK   | Not tested (GAP)                                                                                                             |
| No name search is performed                          | OK   | Not tested explicitly (GAP)                                                                                                  |

---

## Project-wide specs (default:\_global/\*) and direct dependencies

- conventions: strict TS, ESM, named exports, no `any`, `readonly` data, kebab-case files: OK. `as unknown as GoParserState` / `PythonParserState` casts follow the existing adapter pattern (not new). No default exports.
- testing: test naming follows given/when/then; no snapshots; tests mirror src layout except `test/infrastructure/tree-sitter/qualified-reference-contract.spec.ts`, which does not correspond to a single source file (low, D11: file-naming convention says tests match the source file name). Integration test lives in `test/integration` (existing pattern).
- docs: JSDoc present on new helpers and private methods; docs/code-graph/language-adapters.md updated for the new fields and for both languages and matches the code (including the directory interpretation of "same package", D5). The orphan docblock in D9 is the only blemish. docs/code-graph/index.md has no stale statement about unsupported Go selectors or Python re-exports.
- architecture: domain value object stays pure (no infra imports); adapters only use ports and `ImportResolutionContext`; no new package dependencies. Consistent with `code-graph:language-adapter` facet model (`reExportLinking` ordering: indexer runs linking before Pass 2; Python facet depends only on session).
- Direct deps of the changed specs (symbol-model facts feed language-adapter; go and python specs reference "Package resolution facet" of language-adapter): consistent.

## Missing tests (consolidated)

1. Go: explicit alias scenario does not assert that the path-derived name is not bound.
2. Go: last-segment fallback when target entries are not indexed; no filesystem read.
3. Go: shadow variants (result, receiver, local var, local declaration) and shadow of construct/type facts.
4. Go: `USES_TYPE` for result type distinct from parameter, const, type declaration, type argument.
5. Go: uppercase unexported name (`models.Missing()`) dropped silently.
6. Go: call/construct in a package-level var initializer (no `sourceSymbolId`).
7. Go: external (`package-unknown`) import counted as external, not failure, for a selector file.
8. Language-adapter: helper `ambiguous`, `no-entry-surface`, `not-exported` produce no relation and no failure.
9. Language-adapter: no name search when the name exists elsewhere in the target workspace.
10. Python: nested import variants asserted separately (try, if TYPE_CHECKING, function).
11. Python: `.pyi` entry file route, `src/` layout absolute route, tuple `__all__`, annotated `__all__`, `from . import x`.
12. Python: sub-package entry with absolute sibling import (relates to D5).
13. Python: `.pyi` declarations stay addressable without runtime merging (Naming convention scenario).
14. Symbol-model: direct assertion that a fact names no target and creates no relation.

## Discrepancy index

| Id  | Severity | Summary                                                                                                                                   |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D3  | medium   | Go call/construct `sourceSymbolId` uses callable-only containment, not "innermost declaration"; package-level initializers lose relations |
| D4  | medium   | Python route resolution does not use `relativeImportResolution` / `packageResolution` as "Re-export public bindings" requires             |
| D5  | medium   | Python absolute "same package" implemented as same entry directory; sibling sub-package imports are not routes                            |
| D1  | low      | Go shadow check only for calls and at emission time                                                                                       |
| D2  | low      | Go generic function call `pkg.Fn[T]()` not emitted                                                                                        |
| D6  | low      | `from . import x` exclusion not stated in spec                                                                                            |
| D7  | low      | Any read of `__all__` makes it dynamic                                                                                                    |
| D8  | low      | "MUST NOT infer public from missing underscore" vs existing convention-based declaration publishing                                       |
| D9  | low      | Orphan JSDoc in python-language-adapter.ts                                                                                                |
| D10 | low      | Helper step skipped when no local namespace binding                                                                                       |
| D11 | low      | `qualified-reference-contract.spec.ts` does not mirror a source file                                                                      |
