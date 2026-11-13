# Spec Compliance Audit: CLI Area

## Scope

- **Specs Audited**:
  - `cli:graph-impact` (with active deltas from change `code-graph-file-categories`)
  - `cli:graph-hotspots` (with active deltas from change `code-graph-file-categories`)
  - `cli:graph-search` (with active deltas from change `code-graph-file-categories`)
- **Dependencies & Architectural Baselines**:
  - `cli:entrypoint`
  - `cli:graph-cli-context`
  - `default:_global/docs`
  - `default:_global/architecture`
- **Implementation Targets in `@specd/cli`**:
  - `packages/cli/src/commands/graph/impact.ts`
  - `packages/cli/src/commands/graph/hotspots.ts`
  - `packages/cli/src/commands/graph/search.ts`
  - `packages/cli/src/commands/graph/parse-file-categories.ts`
  - `packages/cli/src/commands/graph/format-omission-notice.ts`
  - `packages/cli/src/helpers/parse-comma-values.ts`
- **Documentation Targets**:
  - `docs/cli/graph.md`
  - `docs/cli/cli-reference.md`
  - `docs/guide/code-graph.md`
  - `docs/guide/cli.md`
  - `docs/guide/index.md`
- **Test Suites**:
  - `packages/cli/test/commands/graph-impact.spec.ts`
  - `packages/cli/test/commands/graph-hotspots.spec.ts`
  - `packages/cli/test/commands/graph-search.spec.ts`
  - `packages/cli/test/helpers/parse-comma-values.spec.ts`
  - `packages/cli/test/documentation-coverage.spec.ts`

---

## 1. Requirements Summary

### `cli:graph-impact`

1. **Command Options**:
   - Signature includes `--include-tests`, `--include-ignored`, `--all`, and `--category <categories>`.
   - `--include-tests`: admits `test` category files and symbols alongside default `source`.
   - `--include-ignored`: admits `ignored` category files and symbols.
   - `--all`: admits all file categories (`source`, `test`, `ignored`).
   - `--category <categories>`: restricts admitted categories strictly to the designated category or comma-separated list (e.g. `source,test`, `test`, `ignored`).
2. **Provider-Owned Filtering**:
   - CLI normalizes and passes category options to the provider's impact analysis methods (`categories`, `includeTests`, `includeIgnored`).
   - CLI does not perform post-filtering or strip returned category elements.
3. **Output Presentation**:
   - Text mode: when `omittedCounts` indicates non-admitted files were pruned (`tests > 0` or `ignored > 0`), renders omission notice:
     `ℹ Excluded from results: <count> test files, <count> ignored files. Use --include-tests, --include-ignored, or --all to view them.`
   - JSON / TOON mode: returns structured object with `omittedCounts: { tests: number, ignored: number }`.

### `cli:graph-hotspots`

1. **Command Options**:
   - Signature includes `--include-tests`, `--include-ignored`, `--all`, and `--category <categories>`.
   - Default query policy: `categories = source`, `kinds = class,method,function`, importer-only symbols excluded, `minScore > 0`, `minRisk >= MEDIUM`, `limit = 20`.
   - `--include-tests`: includes test category files in caller metrics and candidate rankings.
   - `--include-ignored`: includes ignored category files.
   - `--all`: includes all categories (`source`, `test`, `ignored`).
   - `--category <categories>`: restricts candidates and caller metrics strictly to designated category or comma-separated list.
2. **Hotspot Retrieval**:
   - Passes `categories`, `includeTests`, and `includeIgnored` to `provider.getHotspots(...)`.
3. **Output Presentation**:
   - Text mode: renders ranked table and displays omission notice at the bottom if `tests > 0` or `ignored > 0`.
   - JSON / TOON mode: returns `{ totalSymbols, entries, omittedCounts: { tests: number, ignored: number } }`.

### `cli:graph-search`

1. **Command Options**:
   - Signature includes `--include-tests`, `--include-ignored`, `--all`, and `--category <categories>`.
   - Dedicated `--tests` flag alias removed in favor of `--category test` / `--include-tests`.
   - `--include-tests`: includes `test` category files and symbols alongside `source`.
   - `--include-ignored`: includes `ignored` category files and symbols alongside `source`.
   - `--all`: includes all categories (`source`, `test`, `ignored`).
   - `--category <categories>`: restricts search strictly to designated category or comma-separated list.
2. **Provider Delegation**:
   - CLI passes `fileCategories`, `includeTests`, `includeIgnored` to `provider.search(...)` in unified request.
3. **Output Presentation**:
   - Text mode: renders omission notice if search prunes non-admitted files.
   - JSON / TOON mode: returns `{ symbols, files, specs, documents, omittedCounts: { tests: number, ignored: number } }`.

---

## 2. Implementation Status

| Feature / Requirement                              | Implementation Target                                       | Status                | Notes                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Comma-separated category parsing                   | `packages/cli/src/commands/graph/parse-file-categories.ts`  | Fully Implemented     | Validates against `Set(['source', 'test', 'ignored'])`, trims, deduplicates, fails with exit code 1 on invalid token.   |
| Text omission notice formatter                     | `packages/cli/src/commands/graph/format-omission-notice.ts` | Fully Implemented     | Matches exact spec format `ℹ Excluded from results: ... Use --include-tests, --include-ignored, or --all to view them.` |
| `graph impact` category flags & normalization      | `packages/cli/src/commands/graph/impact.ts`                 | Fully Implemented     | Supports `--category`, `--include-tests`, `--include-ignored`, `--all`. Normalizes into `ImpactResultFilter`.           |
| `graph impact` omission notice & `omittedCounts`   | `packages/cli/src/commands/graph/impact.ts`                 | Fully Implemented     | Rendered in text mode across all targets (file, multi-file, symbol, spec, export); JSON mode emits `omittedCounts`.     |
| `graph hotspots` category flags & delegation       | `packages/cli/src/commands/graph/hotspots.ts`               | Fully Implemented     | Supports `--category`, `--include-tests`, `--include-ignored`, `--all`. Passes to `provider.getHotspots`.               |
| `graph hotspots` omission notice & `omittedCounts` | `packages/cli/src/commands/graph/hotspots.ts`               | Fully Implemented     | Rendered in text mode (both populated and empty results); JSON mode emits `omittedCounts`.                              |
| `graph search` category flags & delegation         | `packages/cli/src/commands/graph/search.ts`                 | Fully Implemented     | Supports `--category`, `--include-tests`, `--include-ignored`, `--all`. Passes `fileCategories` to `provider.search`.   |
| Removal of bare `--tests` alias                    | `packages/cli/src/commands/graph/search.ts`                 | Fully Implemented     | Flag completely removed from Commander definition; unrecognized option triggers CLI usage error.                        |
| `graph search` omission notice & `omittedCounts`   | `packages/cli/src/commands/graph/search.ts`                 | Fully Implemented     | Rendered in text mode after results or empty message; JSON mode emits `omittedCounts`.                                  |
| Documentation in `docs/cli/graph.md`               | `docs/cli/graph.md`                                         | Fully Implemented     | Tables for `search`, `impact`, and `hotspots` include all category flags.                                               |
| Documentation in `docs/guide/code-graph.md`        | `docs/guide/code-graph.md`                                  | Fully Implemented     | Dedicated section "Command Flags & Omission Notices" documenting flags, text notice, and `omittedCounts`.               |
| Documentation in `docs/guide/cli.md`               | `docs/guide/cli.md`                                         | Fully Implemented     | Command reference paragraphs document category flags for all 3 commands.                                                |
| Documentation in `docs/cli/cli-reference.md`       | `docs/cli/cli-reference.md`                                 | Partially Implemented | All options documented, but `hotspots` and `impact` sections retain legacy text notice snippet (see Discrepancies).     |

---

## 3. Discrepancies

### Discrepancy CLI-01: Legacy omission notice snippet in `docs/cli/cli-reference.md` (Documentation Minor)

- **Location**: `docs/cli/cli-reference.md` lines 1506–1509 (`graph hotspots`) and lines 1676–1679 (`graph impact`).
- **Description**: While `graph search` at line 1377 correctly documents the standardized notice:
  ```text
  ℹ Excluded from results: <count> test files, <count> ignored files. Use --include-tests, --include-ignored, or --all to view them.
  ```
  The sections for `graph hotspots` and `graph impact` present an outdated notice template:
  ```text
  Note: Results omit test files (pass --include-tests to include) and ignored files (pass --include-ignored to include)
  ```
- **Impact**: Documentation wording inconsistency. The actual CLI implementation and the spec requirements use the `ℹ Excluded from results: ...` format across all commands.

---

## 4. Test Coverage

| Test File                                              | Total Tests | Category-Related Tests  | Status           |
| ------------------------------------------------------ | ----------- | ----------------------- | ---------------- |
| `packages/cli/test/commands/graph-impact.spec.ts`      | 48          | 6                       | All Passing      |
| `packages/cli/test/commands/graph-hotspots.spec.ts`    | 19          | 6                       | All Passing      |
| `packages/cli/test/commands/graph-search.spec.ts`      | 17          | 7                       | All Passing      |
| `packages/cli/test/helpers/parse-comma-values.spec.ts` | 9           | 9                       | All Passing      |
| `packages/cli/test/documentation-coverage.spec.ts`     | 32          | 32                      | All Passing      |
| **Total package tests (`@specd/cli`)**                 | **1,126**   | **84 (graph commands)** | **100% Passing** |

### Verified Test Cases:

1. **Invalid `--category` rejection**:
   - `graph impact`: rejects `--category fixtures` before provider access.
   - `graph hotspots`: rejects `--category unknown` before provider access.
   - `graph search`: rejects `--category unknown` before opening provider.
2. **Invalid token within comma-separated `--category` list**:
   - `graph impact`: rejects `--category source,invalid`.
   - `graph hotspots`: rejects `--category source,invalid`.
   - `graph search`: rejects `--category source,invalid`.
3. **Valid comma-separated `--category` delegation**:
   - `graph impact`: passes `categories: ['source', 'test']` to `analyzeFileImpact`.
   - `graph hotspots`: passes `categories: ['source', 'test']` to `getHotspots`.
   - `graph search`: passes `fileCategories: ['source', 'test']` to `search`.
4. **Single category selection**:
   - `graph search`: passes `fileCategories: ['test']` for `--category test`.
5. **Inclusion flag delegation**:
   - `graph impact`: passes `includeTests: true` for `--include-tests`.
   - `graph hotspots`: passes `includeTests: true` for `--include-tests`.
   - `graph search`: passes `includeTests: true, includeIgnored: true` for `--include-tests --include-ignored`.
6. **Text omission notices**:
   - `graph impact`: verifies `ℹ Excluded from results: 3 test files, 1 ignored file. Use --include-tests, --include-ignored, or --all to view them.`.
   - `graph hotspots`: verifies `ℹ Excluded from results: 5 test files, 2 ignored files. Use --include-tests, --include-ignored, or --all to view them.`.
   - `graph search`: verifies `ℹ Excluded from results: 3 test files. Use --include-tests, --include-ignored, or --all to view them.`.
7. **JSON mode `omittedCounts`**:
   - `graph impact`: verifies `omittedCounts: { tests: 2, ignored: 0 }`.
   - `graph hotspots`: verifies `omittedCounts: { tests: 5, ignored: 0 }`.
   - `graph search`: verifies `omittedCounts: { tests: 4, ignored: 1 }`.

---

## 5. Missing Tests

1. **Missing test for `--all` flag across all commands**:
   - In `graph-impact.spec.ts` (line 2029), `graph-hotspots.spec.ts` (line 323), and `graph-search.spec.ts` (line 626), the test case descriptions mention `--all`, but the test bodies do not execute the command with `--all`. There is no test asserting that passing `--all` sets `categories: ['source', 'test', 'ignored']` and sets `includeTests = true, includeIgnored = true`.
2. **Missing `--include-ignored` test in `graph-impact` and `graph-hotspots`**:
   - `--include-ignored` is tested in `graph-search.spec.ts`, but neither `graph-impact.spec.ts` nor `graph-hotspots.spec.ts` invokes `--include-ignored` independently or asserts provider delegation.
3. **Missing negative test for bare `--tests` rejection**:
   - Bare `--tests` alias was removed from `graph search`, but there is no explicit test verifying that executing `specd graph search "target" --tests` fails with an unrecognized option error.
4. **No isolated unit tests for CLI graph helpers**:
   - `packages/cli/src/commands/graph/parse-file-categories.ts` and `packages/cli/src/commands/graph/format-omission-notice.ts` do not have dedicated unit tests in `packages/cli/test/commands/graph/`; they are tested solely through command-level integration tests.

---

## 6. Spec Dependency Chain & Consistency

- **`cli:entrypoint`**:
  - Validates exit code contracts: returns code 1 for invalid category tokens; returns code 3 for provider / infrastructure errors (`GRAPH_BUSY`, `GRAPH_PROVIDER_STALE`).
  - Commander configuration respects `allowExcessArguments(false)`.
  - JSON and TOON schema descriptions are properly declared in `addHelpText('after', ...)` for all three commands.
  - Flags `--config` and `--path` enforce mutual exclusivity.
- **`cli:graph-cli-context`**:
  - Context resolution uses `resolveGraphCliContext` and `withProvider` across all three commands.
  - Platform types (`FileCategory`, `SearchCategory`, `HotspotOptions`, `SymbolKind`) are imported strictly from `@specd/sdk`.
- **`default:_global/docs`**:
  - Documentation structure under `docs/cli/` and `docs/guide/` is preserved.
  - Guide catalog introspected via `specd guide --format toon` returns 22 topics including `guide:code-graph` and `guide:cli`, matching all docs.
- **`default:_global/architecture`**:
  - Adapter package `@specd/cli` contains no business logic.
  - Traversal, scoring, ranking, and candidate filtering remain provider-owned; CLI performs only argument validation and projection formatting.
  - Strict one-way package dependencies (`cli` -> `sdk`) with no circular imports.

---

## 7. Summary Counts

- **Total Requirements Audited**: 12
- **Fully Implemented**: 12
- **Discrepancies**: 1 (Minor documentation formatting discrepancy in `docs/cli/cli-reference.md`)
- **Tests Passing**: 84 / 84 (graph command tests), 1,126 / 1,126 (entire `@specd/cli` suite)
- **Missing Tests**: 4
