# Compliance Audit Partial — code-graph area

Change: `20260816-112112-suggest-implementation-and-spec-deps`
Audited specs: `code-graph:language-adapter`, `code-graph:graph-store` (delta-scoped)
Audit date: 2026-08-24 · Mode: read-only · Test run: **682/682 passed** (55 files, `packages/code-graph`)

Delta scope actually present in the change (read from delta YAML):

- `deltas/code-graph/language-adapter/spec.md.delta.yaml` + `verify.md.delta.yaml` — adds requirement **"Built-in Adapter Registry Composition Factory & Keyword Discovery"**: `createBuiltinAdapterRegistry` factory, optional `LanguageAdapter.keywords?(): readonly string[]`, and `AdapterRegistryPort`/`AdapterRegistry.getReservedKeywords(): Set<string>`. Scenario asserts extensions `.ts/.py/.go/.php` and aggregated keywords including `class`, `def`, `func`, `interface`, `async`.
- `deltas/code-graph/graph-store/spec.md.delta.yaml` + `verify.md.delta.yaml` — adds requirement **"Symbol Query Workspace Scope"**: `SymbolQuery.workspace?: string`; `findSymbols(query)` MUST scope results by exact, case-sensitive prefix `'<workspace>:'` using a parameterized prefix comparison where `%` and `_` are literal (`STARTS WITH` semantics).

Note: the task briefing described the deltas as "complete reserved keyword sets per language version"; the actual delta text does **not** enumerate per-language keyword lists. Both readings are evaluated under "Discrepancies" below.

---

## Spec 1: code-graph:language-adapter

### Requirements Summary (delta-scoped)

From the merged preview (`spec-preview code-graph:language-adapter`, new requirement appended after "Complete symbol source ranges"):

1. `createBuiltinAdapterRegistry` SHALL be a standalone composition factory exposed at `create-builtin-adapter-registry.ts` and re-exported in composition entrypoints.
2. It SHALL instantiate an `AdapterRegistry` pre-populated with `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, `PhpLanguageAdapter`, plus any custom adapters provided.
3. Factory MUST support overloads `(extraAdapters?: readonly LanguageAdapter[])` and `(config: SpecdConfig)`.
4. `LanguageAdapter` SHALL support optional `keywords?(): readonly string[]` returning reserved keywords + built-in type names.
5. `AdapterRegistryPort` and `AdapterRegistry` SHALL expose `getReservedKeywords(): Set<string>` aggregating across all registered adapters.

Scenario (verify delta): factory returns registry containing all built-ins; `getSupportedExtensions()` includes `.ts`, `.py`, `.go`, `.php`; `getReservedKeywords()` includes `class`, `def`, `func`, `interface`, `async`.

### Implementation Status (delta-scoped)

| Requirement clause                                               | Status | Evidence                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standalone factory at `create-builtin-adapter-registry.ts`       | ✅     | `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts:16-52`                                                                                                                                                          |
| Re-exported in composition entrypoints                           | ✅     | `src/composition/create-code-graph-provider.ts:109` (also used internally at :51); public barrels `src/index.ts:4`, `src/public.ts:4`                                                                                                             |
| Pre-populated with TS/Python/Go/PHP adapters + extras            | ✅     | `create-builtin-adapter-registry.ts:40-43` registers all four; :45-49 appends `extraAdapters`                                                                                                                                                     |
| Overloads `(extraAdapters?)` and `(config: SpecdConfig)`         | ✅     | `create-builtin-adapter-registry.ts:16-18` and :29 (compat overload documented at :20-28; handler :36-52 ignores non-array input, matching "SpecdConfig carries no adapter-registration field")                                                   |
| `LanguageAdapter.keywords?(): readonly string[]` optional        | ✅     | `src/domain/value-objects/language-adapter.ts:70` — exactly `keywords?(): readonly string[]`                                                                                                                                                      |
| `AdapterRegistryPort.getReservedKeywords(): Set<string>`         | ✅     | `src/domain/ports/adapter-registry-port.ts:20`                                                                                                                                                                                                    |
| `AdapterRegistry.getReservedKeywords(): Set<string>` aggregation | ✅     | `src/infrastructure/tree-sitter/adapter-registry.ts:90-100` — iterates unique adapters via `getAdapters()` (:74-76 dedups by identity), guards optional method with `typeof adapter.keywords === 'function'` (:93), collects into a `Set` (dedup) |

Per-language keyword sets implemented (all four built-ins implement `keywords()`):

- TypeScript/JavaScript: `typescript-language-adapter.ts:342-411` — all ECMAScript reserved words present (break…yield incl. `let`, `static`, `async`, `await`, `enum`, `with`), plus TS type names `string/boolean/number/any/Promise/void/null/undefined/never/unknown/symbol/bigint/object` and contextual words `interface/type/readonly/implements/private/protected/public/static/enum/namespace/constructor/as/is/from/of`.
- Python: `python-language-adapter.ts:256-305` — complete Python 3.x hard-keyword set (35/35: `def class import from as return yield lambda if elif else while for in try except finally raise with assert pass break continue and or not is None True False async await del global nonlocal`) plus soft keywords `match/case/type` and built-in types `str/int/float/bool/list/dict/set/tuple`.
- Go: `go-language-adapter.ts:194-231` — complete set of all 25 Go reserved keywords (`func package import type struct interface return if else for range switch case default select chan go goto defer fallthrough break continue var const map`) plus predeclared `nil true false bool string int int64 byte error`.
- PHP: `php-language-adapter.ts:1086-1172` — covers php.net reserved-word list almost fully (function/class/interface/trait/enum/namespace/use/extends/implements/visibility modifiers/static/readonly/const/control flow/match/fn/clone/self/parent/echo/print/logical ops/alternatives endif-family/include*/require*/isset/unset/list/global/goto/die/exit/declare/instanceof/insteadof/var), plus type names `array/string/int/float/bool/void/null/true/false/mixed/never/object/callable/iterable`.

### Discrepancies (both hypotheses)

**Hypothesis A — literal delta text (keyword discovery contract only): NO discrepancies.**
Every SHALL/MUST clause of the added requirement is implemented as written, including exact signatures (`keywords?(): readonly string[]`, `getReservedKeywords(): Set<string>`), both overload forms, four built-in registrations, and re-exports. The scenario's five required sample keywords (`class`, `def`, `func`, `interface`, `async`) are each returned by at least one built-in adapter (TS: class/interface/async; Py: def/class; Go: func/interface).

**Hypothesis B — stricter reading ("complete reserved keyword sets per language version"): minor completeness gaps, none violating the delta text.**
The delta does not enumerate authoritative sets, so these are observations, not violations:

- Go: predeclared identifier/type coverage is a subset — omits numeric types (`float32`, `float64`, `uint*`, `uintptr`, `rune`, `complex64/128`, `iota`, `any`) and builtin funcs (`append`, `len`, `make`, …). All 25 reserved keywords are complete, so only the "built-in type names" half is partial (`go-language-adapter.ts:224-229`).
- TypeScript: contextual/TS-only keywords missing vs. full TS grammar: `declare`, `abstract`, `keyof`, `infer`, `asserts`, `satisfies`, `module`, `override`, `accessor`, `out` (`typescript-language-adapter.ts:343-410`). ES-level reserved words are complete.
- PHP: missing `__halt_compiler` and compound `yield from` vs. the php.net reserved list (`php-language-adapter.ts:1087-1171`). Otherwise near-complete.
- Python: complete (hard + soft keywords). No gap.

If the change intends Hypothesis B, the specific per-language specs (`code-graph:{go,python,typescript,php}-language-adapter`) do not contain keyword-set requirements either (no deltas touch them in this change), so no cross-spec contradiction exists today.

### Test Coverage

- `test/composition/create-builtin-adapter-registry.spec.ts:7-16` — factory returns `AdapterRegistry` instance with extensions `.ts/.py/.go/.php` → maps 1:1 to delta scenario THEN clauses. ✅
- `:41-65` — "aggregates and deduplicates reserved keywords across adapters": custom adapter contributing duplicate `class` collapses to one entry (Set semantics + cross-adapter dedup asserted at :62-64). ✅
- `:67-79` — `getReservedKeywords()` is a `Set`, non-empty, contains `class`, `function`, `interface`, `async`, `def`, `func` — covers every keyword named in the delta scenario. ✅
- `:18-39` — custom adapter extension registration through `extraAdapters`. ✅
- Full targeted suite run: `rtk pnpm build && rtk pnpm test` in `packages/code-graph` → **Test Files 55 passed (55), Tests 682 passed (682)**. All delta scenarios pass.

### Conformance

**CONFORMANT** (both hypotheses; hypothesis-B items are advisory completeness notes only).

---

## Spec 2: code-graph:graph-store

### Requirements Summary (delta-scoped)

Added requirement "Symbol Query Workspace Scope":

1. `SymbolQuery` SHALL include optional `workspace?: string`.
2. When set, `GraphStore.findSymbols(query)` MUST scope results directly to symbols whose file path begins with the exact, case-sensitive prefix `'<workspace>:'`, via parameterized prefix comparison treating `%` and `_` as literals (`s.filePath STARTS WITH '<workspace>:'`).

Scenario: store populated with symbols across workspaces `core`/`cli`/`sdk`; `findSymbols({ name: 'create*', workspace: 'core' })` returns exclusively `core` symbols.

### Implementation Status (delta-scoped)

| Clause                                                                 | Status | Evidence                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SymbolQuery.workspace?: string`                                       | ✅     | `src/domain/value-objects/symbol-query.ts:9` — `readonly workspace?: string`                                                                                                                                                                                |
| Exact, case-sensitive prefix `'<workspace>:'` scoping in `findSymbols` | ✅     | `src/infrastructure/sqlite/sqlite-graph-database.ts:1178-1183` — condition `substr(file_path, 1, length(?)) = ?` with params `` `${query.workspace}:` `` twice; comment explicitly notes it avoids LIKE's ASCII case-folding and `%`/`_` wildcard semantics |
| `%` / `_` matched literally (parameterized, not LIKE)                  | ✅     | Same substr-based comparison; no LIKE interpolation anywhere in the workspace branch; verified by tests exercising workspaces `my_ws` and `a%b` (see below)                                                                                                 |
| Case sensitivity                                                       | ✅     | Binary comparison on `file_path` column (no `COLLATE NOCASE` applied, unlike name/comment branches at :1205/:1215)                                                                                                                                          |
| Port surface unchanged for other backends                              | ✅     | Abstract `findSymbols(query: SymbolQuery)` at `src/domain/ports/graph-store.ts:687`; worker transport passes query verbatim (`sqlite-worker.ts:246`, `sqlite-graph-store.ts:583-585`); provider delegates (`code-graph-provider.ts:327-329`)                |

Backend note: the spec text uses Kuzu-style `STARTS WITH`; the SQLite backend realizes identical observable semantics via parameterized `substr` equality. This is permitted by the pre-existing graph-store requirement that backends MAY represent concepts differently internally while preserving abstract semantics.

Consumer consistency: `packages/sdk/src/orchestration/suggest-implementation-links.ts` scopes symbol queries with `workspace: workspace !== 'default' ? workspace : undefined` (:1160, :1254) and consumes `registry.getReservedKeywords()` (:177) — matches the design intent recorded in `design.md:27,350` and the sibling spec `specs/sdk/suggest-implementation-links/spec.md:40,46`.

### Discrepancies (both hypotheses)

**Hypothesis A — literal delta text: NO discrepancies.**
Property added; prefix semantics, case sensitivity, and wildcard-literal behavior all match; implementation is parameterized (no injection/wildcard leakage).

**Hypothesis B — broader reading (all backends must conform): effectively satisfied, with one cosmetic note.**

- Only one concrete backend exists (`SQLiteGraphStore extends GraphStore`, `sqlite-graph-store.ts:104`), so backend parity is trivially satisfied; the shared contract suite additionally pins the behavior for any future store.
- Cosmetic: the explanatory comment at `sqlite-graph-database.ts:1179` references `InMemoryGraphStore.startsWith`, but no such production class exists (only test helper `test/helpers/in-memory-graph-store.ts`). Stale reference in a comment; zero behavioral impact.

### Test Coverage

- Contract suite (backend-neutral): `test/domain/ports/graph-store.contract.ts:894-931` — "scopes results to workspace when workspace is specified": symbols in `core:` vs `other:` files; `findSymbols({ name: 'create*', workspace: 'core' })` returns only `core:`-prefixed symbols (:926-930). Mirrors the delta scenario (uses workspaces core/other rather than core/cli/sdk; semantically equivalent multi-workspace isolation). Wired to run against `SQLiteGraphStore` via `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:25-42`. ✅
- SQLite-specific edge coverage: `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:925-941`:
  - exact-case `workspace: 'core'` matches only core symbol (:925-926)
  - distinct uppercase workspace `'CORE'` matches its own symbol (:928-929) and `'Core'` matches nothing (:931) — proves case-sensitive prefixing
  - underscore workspace `'my_ws'` matched literally, `'mysws'` does not (:933-935) — proves `_` is not a wildcard
  - percent workspace `'a%b'` matched literally; `'ab'` and `'a%%b'` do not (:937-940) — proves `%` is not a wildcard
- Suite run: same 682/682 pass above (includes contract + sqlite suites).

### Conformance

**CONFORMANT** (both hypotheses; one stale-comment cosmetic note only).

---

## Cross-spec consistency

- **symbol-model dependency**: workspace-prefix scoping relies on canonical workspace-prefixed file paths (`<workspace>:...`), which is the established vocabulary in graph-store's "Minimum graph semantics" requirement and `symbol-model`'s `SymbolNode.filePath`. Consistent; no vocabulary drift introduced by the delta.
- **document-model dependency**: untouched by either delta; document nodes/search unaffected (verified `findSymbols` changes only).
- **language-adapter ↔ graph-store**: independent additions; no overlapping identifiers. The `keywords()` capability is additive/optional on the port, so existing custom adapters (and the SDK's use of `createBuiltinAdapterRegistry(graphOptions?.adapters)` at `create-code-graph-provider.ts:51`) remain source-compatible.

## Summary counts

| Metric                                                    | Count                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Delta requirements audited                                | 2 (language-adapter ×1, graph-store ×1)                                                 |
| Delta scenarios audited                                   | 2                                                                                       |
| Requirements conformant                                   | 2 / 2                                                                                   |
| Requirements partially conformant                         | 0                                                                                       |
| Requirements non-conformant                               | 0                                                                                       |
| Violations requiring spec/code change                     | 0                                                                                       |
| Advisory observations (hypothesis-B keyword completeness) | 3 (Go built-in-type subset, TS contextual keywords, PHP `__halt_compiler`/`yield from`) |
| Cosmetic findings                                         | 1 (stale `InMemoryGraphStore` comment reference, sqlite-graph-database.ts:1179)         |
| Delta scenario tests found & passing                      | 2 / 2 (plus 3 supporting edge tests for case/`_`/`%` literals)                          |
| Test suite result                                         | 682 passed / 682 (55 files)                                                             |

**Verdict: PASS — both audited code-graph deltas are implemented, tested, and conformant.**
