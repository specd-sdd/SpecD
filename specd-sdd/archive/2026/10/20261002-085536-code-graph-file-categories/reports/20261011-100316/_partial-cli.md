# Spec Compliance Audit — CLI Batch (Change `code-graph-file-categories`)

**Audit Scope:**

- `cli:graph-impact`
- `cli:graph-hotspots`
- `cli:graph-search`

**Direct Spec Dependencies:**

- `cli:entrypoint`
- `cli:graph-cli-context`
- `code-graph:composition`

**Implementation Files Audited:**

- `packages/cli/src/commands/graph/format-omission-notice.ts`
- `packages/cli/src/commands/graph/impact.ts`
- `packages/cli/src/commands/graph/hotspots.ts`
- `packages/cli/src/commands/graph/search.ts`

**Test Files Audited:**

- `packages/cli/test/commands/graph-impact.spec.ts`
- `packages/cli/test/commands/graph-hotspots.spec.ts`
- `packages/cli/test/commands/graph-search.spec.ts`

**Audit Date:** 2026-10-11 (Read-only audit)

---

## Executive Summary

The CLI implementation for change `code-graph-file-categories` introduces file category filtering (`source`, `test`, `ignored`), omission notices in human-readable text output, and structured `omittedCounts` across `graph impact`, `graph hotspots`, and `graph search`.

All core behavioral requirements of the change deltas are implemented cleanly and conform to the architectural contracts:

- Category admission flags (`--include-tests`, `--include-ignored`, `--all`, `--category <source|test|ignored>`, and `--tests` alias) are properly parsed, validated with exit code 1 on invalid values, and passed through to the provider layer without post-filtering in the CLI.
- Shared formatting helper `formatOmissionNotice` accurately handles notice rendering in text mode across all command target variants.
- Structured output formats (`json`, `toon`) include `omittedCounts: { tests: number, ignored: number }` across all leaf command results.
- Provider delegation follows `cli:graph-cli-context` and `code-graph:composition` without performing CLI-side graph re-computation.

A minor documentation discrepancy was identified across all three commands: the `addHelpText('after', ...)` JSON/TOON output schema blocks have not been updated to document `omittedCounts` (and for `impact`, the top-level aggregate deps count fields), which conflicts with `cli:entrypoint`'s help schema requirement.

---

## 1. cli:graph-impact

### Requirements Summary

| #   | Requirement                                                                                                                                                                                                                            | Delta Status | Priority |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| R1  | Command signature accepts `--include-tests`, `--include-ignored`, `--all`, `--category <source\|test\|ignored>` alongside existing selectors and flags                                                                                 | Modified     | MUST     |
| R2  | Target family exclusivity: exactly one target family (`--file`, `--symbol`, `--spec`, or `--export` + `--from`)                                                                                                                        | Existing     | MUST     |
| R3  | `--category` validates argument is one of `source`, `test`, `ignored`; fails with exit code 1 before provider access                                                                                                                   | Modified     | MUST     |
| R4  | Category options normalized into typed provider impact filter (`ImpactResultFilter`) without CLI post-filtering                                                                                                                        | Modified     | MUST     |
| R5  | Filter passed through to provider for all 5 target families (single file, multi-file, symbol, spec, public export)                                                                                                                     | Modified     | MUST     |
| R6  | Pure display-path projection derived from configuration alone without graph reads                                                                                                                                                      | Existing     | MUST     |
| R7  | Text output displays omission notice when `omittedCounts` indicates `tests > 0` or `ignored > 0`: `ℹ Excluded from results: <count> test files, <count> ignored files. Use --include-tests, --include-ignored, or --all to view them.` | Modified     | MUST     |
| R8  | Single-category omission notice MAY mention only that category                                                                                                                                                                         | Modified     | MAY      |
| R9  | JSON/TOON mode includes `omittedCounts: { tests: number, ignored: number }`                                                                                                                                                            | Modified     | MUST     |
| R10 | JSON mode includes aggregate impact fields: `riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`, `omittedCounts`                                                                          | Modified     | MUST     |
| R11 | Provider lifecycle managed via `withProvider` with availability checked once per run                                                                                                                                                   | Existing     | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                                                                                                                                                                      |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented | `packages/cli/src/commands/graph/impact.ts` L362–365: `.option('--include-tests', ...)` `.option('--include-ignored', ...)` `.option('--all', ...)` `.option('--category <category>', ...)`                   |
| R2  | ✅ Implemented | L426–437: checks `selectorCount === 1` and `export` + `from` pairings; exits with code 1 via `cliError`                                                                                                       |
| R3  | ✅ Implemented | L97–103: `if (opts.category !== undefined && !VALID_FILE_CATEGORIES.has(opts.category))` throws `cliError` before provider open                                                                               |
| R4  | ✅ Implemented | L132–150: `normalizeImpactResultFilter` populates `categories`, `includeTests`, `includeIgnored` based on flags                                                                                               |
| R5  | ✅ Implemented | L466 (`handlePublicExportImpact`), L655 (`handleFilesImpact` single), L720 (`handleFilesImpact` multi), L888 (`handleSymbolImpact`), L956 (`handleSpecImpact`): all pass `filter` through to provider methods |
| R6  | ✅ Implemented | L648, L825, L957: `toGraphDisplayPath(config, canonicalPath)` used without graph queries                                                                                                                      |
| R7  | ✅ Implemented | Calls `formatOmissionNotice` and appends to output lines in text mode across all 5 handler paths: L601 (export), L691 (single-file), L769 (multi-file), L905 (symbol), L968 (spec)                            |
| R8  | ✅ Implemented | `format-omission-notice.ts` L22–24: pushes only non-zero categories to notice (e.g. `3 test files`)                                                                                                           |
| R9  | ✅ Implemented | Included in all output branches: L613–615, L708, L785, L921, L983                                                                                                                                             |
| R10 | ✅ Implemented | Single-file (L703–708), multi-file (L780–785), symbol (L916–921), and spec (L978–983) all output the required aggregate counters                                                                              |
| R11 | ✅ Implemented | L453–457: `withProvider` wraps execution; `warnGraphStale` invoked once                                                                                                                                       |

### Verification Scenarios Audit

| Scenario                                                       | Spec Source  | Implementation Coverage                            | Test Status                            |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------- | -------------------------------------- |
| Export selector requires both flags                            | Base Spec    | `impact.ts` L426–428                               | ✅ `graph-impact.spec.ts` L1291        |
| Target families are exclusive                                  | Base Spec    | `impact.ts` L429–437                               | ✅ `graph-impact.spec.ts` L1282        |
| Case-exact symbol selector wins                                | Base Spec    | Delegated to Code Graph                            | ✅ Covered in traversal/provider specs |
| Exact ambiguity is bounded and not traversed                   | Base Spec    | `impact.ts` L836–871                               | ✅ `graph-impact.spec.ts` L1442        |
| Category inclusion flags widen analysis scope                  | Delta Verify | `impact.ts` L132–150, L362–365                     | ✅ `graph-impact.spec.ts` L1967        |
| Text output shows risk level and counts                        | Base Spec    | `impact.ts` L231–238                               | ✅ `graph-impact.spec.ts` L245         |
| Text output shows changed symbols for file impact              | Base Spec    | `impact.ts` L670–681                               | ✅ `graph-impact.spec.ts` L338         |
| Multi-file text output shows grouped changed symbols           | Base Spec    | `impact.ts` L745–760                               | ✅ `graph-impact.spec.ts` L402         |
| JSON output includes changedSymbols for file impact            | Base Spec    | `impact.ts` L698–712                               | ✅ `graph-impact.spec.ts` L438         |
| JSON output for symbol impact                                  | Base Spec    | `impact.ts` L912–926                               | ✅ `graph-impact.spec.ts` L268         |
| JSON output includes aggregate impact fields                   | Delta Verify | `impact.ts` L703–708, L780–785, L916–921, L978–983 | ✅ `graph-impact.spec.ts` L480         |
| Impact paths are rendered relative to project root             | Base Spec    | `impact.ts` `toGraphDisplayPath`                   | ✅ `graph-impact.spec.ts` L885         |
| Omission notice displayed in text mode when tests are excluded | Delta Verify | `impact.ts` L691–696                               | ✅ `graph-impact.spec.ts` L2003        |
| Omitted counts included in JSON output                         | Delta Verify | `impact.ts` L708                                   | ✅ `graph-impact.spec.ts` L2038        |

### Discrepancies & Observations

1. **JSON/TOON Output Schema in Help text misses `omittedCounts` (Low — Help Documentation Drift)**
   - **Spec (`cli:entrypoint` R: JSON/TOON output schema in help):** Every command supporting `--format json|toon` must describe its JSON output shape in `addHelpText('after', ...)`.
   - **Code:** In `impact.ts` L378–396, `ImpactResult` schema documented in help text does not include `omittedCounts`, nor does it mention `riskLevel`, `directDepsCount`, etc., at the root level for `--file` or `--symbol`.
   - **Assessment:** Minor documentation omission. Runtime output is fully conformant.

### Test Coverage Analysis

`packages/cli/test/commands/graph-impact.spec.ts`:

- L1942: `rejects invalid --category before provider access` verifies CLI validation and early exit with code 1.
- L1967: `passes category flags (--include-tests, --include-ignored, --all, --category) to provider` verifies `--include-tests` passed in `ImpactResultFilter`.
- L2003: `renders omission notice in text mode when tests are excluded` verifies notice text formatted and present in stdout.
- L2038: `includes omittedCounts in JSON mode` verifies `rendered.omittedCounts` matches `{ tests: 2, ignored: 0 }`.

**Gaps in Test Suite:**

- Only `--file` target is asserted for category flags and omission notices. No tests verify `--symbol`, `--spec`, `--export`, or multi-file targets receiving category flags or displaying omission notices.
- Only `--include-tests` is explicitly tested in mock invocations; `--category`, `--include-ignored`, and `--all` are not directly asserted in provider mock calls.

---

## 2. cli:graph-hotspots

### Requirements Summary

| #   | Requirement                                                                                                                                               | Delta Status | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| R1  | Command signature accepts `--include-tests`, `--include-ignored`, `--all`, `--category <source\|test\|ignored>`                                           | Modified     | MUST     |
| R2  | Default hotspot policy: `categories = source`, `kinds = class,method,function`, importer-only excluded, `minScore > 0`, `minRisk >= MEDIUM`, `limit = 20` | Modified     | MUST     |
| R3  | Explicit category options adjust only the admitted categories without altering other defaults                                                             | Modified     | MUST     |
| R4  | `--category` validates argument is one of `source`, `test`, `ignored`; fails with code 1 before provider access                                           | Modified     | MUST     |
| R5  | Passes all category options (`categories`, `includeTests`, `includeIgnored`) to `provider.getHotspots(...)`                                               | Modified     | MUST     |
| R6  | Text mode prints omission notice when `omittedCounts` has `tests > 0` or `ignored > 0` (both for matching entries and when "No hotspots found.")          | Modified     | MUST     |
| R7  | JSON/TOON mode includes `omittedCounts: { tests: number, ignored: number }` in root output object                                                         | Modified     | MUST     |
| R8  | JSON/TOON mode includes `totalSymbols`, `entries`, and per-entry `workspace` field                                                                        | Existing     | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                                                                                                 |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented | `packages/cli/src/commands/graph/hotspots.ts` L82–90: registers `--include-tests`, `--include-ignored`, `--all`, `--category <category>` |
| R2  | ✅ Implemented | L185–199 & L203: defaults applied; provider receives categories/filters                                                                  |
| R3  | ✅ Implemented | L201–218: `options` merges explicit category flags independently from kinds, limits, and scores                                          |
| R4  | ✅ Implemented | L152–158: `if (opts.category !== undefined && !VALID_FILE_CATEGORIES.has(opts.category))` exits with code 1 via `cliError`               |
| R5  | ✅ Implemented | L215–220: `categories`, `includeTests`, `includeIgnored` passed to `provider.getHotspots(options)`                                       |
| R6  | ✅ Implemented | L225–230 (when 0 entries) and L257–261 (when entries present): `formatOmissionNotice(result.omittedCounts)` rendered                     |
| R7  | ✅ Implemented | L278: `omittedCounts: result.omittedCounts ?? { tests: 0, ignored: 0 }`                                                                  |
| R8  | ✅ Implemented | L267–277: `totalSymbols`, `entries` with derived `workspace` and `displayPath`                                                           |

### Verification Scenarios Audit

| Scenario                                                              | Spec Source  | Implementation Coverage          | Test Status                      |
| --------------------------------------------------------------------- | ------------ | -------------------------------- | -------------------------------- |
| Default hotspot filters apply when no explicit overrides are provided | Base Spec    | `hotspots.ts` L25–30, L203       | ✅ `graph-hotspots.spec.ts` L39  |
| Explicit limit changes only the limit                                 | Base Spec    | `hotspots.ts` L209               | ✅ `graph-hotspots.spec.ts` L73  |
| Explicit min-risk changes only the risk threshold                     | Base Spec    | `hotspots.ts` L213               | ✅ `graph-hotspots.spec.ts` L97  |
| Explicit min-score changes only the score threshold                   | Base Spec    | `hotspots.ts` L210–212           | ✅ `graph-hotspots.spec.ts` L122 |
| Explicit importer-only inclusion widens the query                     | Base Spec    | `hotspots.ts` L214               | ✅ `graph-hotspots.spec.ts` L139 |
| Category flags passed to hotspots                                     | Delta Verify | `hotspots.ts` L215–218           | ✅ `graph-hotspots.spec.ts` L282 |
| Text output shows ranked hotspot table                                | Base Spec    | `hotspots.ts` L245–255           | ✅ `graph-hotspots.spec.ts` L171 |
| Empty result set in text mode                                         | Base Spec    | `hotspots.ts` L224               | ✅ `graph-hotspots.spec.ts` L205 |
| JSON output includes derived workspace field                          | Base Spec    | `hotspots.ts` L275               | ✅ `graph-hotspots.spec.ts` L223 |
| Text output shows omission notice when items excluded                 | Delta Verify | `hotspots.ts` L225–230, L257–261 | ✅ `graph-hotspots.spec.ts` L299 |
| JSON output includes omittedCounts                                    | Delta Verify | `hotspots.ts` L278               | ✅ `graph-hotspots.spec.ts` L316 |

### Discrepancies & Observations

1. **JSON/TOON Output Schema in Help text misses `omittedCounts` (Low — Help Documentation Drift)**
   - **Spec (`cli:entrypoint`):** Schema in help text must reflect the complete JSON model.
   - **Code:** In `hotspots.ts` L97–110, `addHelpText` schema documents `totalSymbols` and `entries`, but does not mention `omittedCounts: { tests: number, ignored: number }`.
   - **Assessment:** Minor documentation omission. Runtime output is fully conformant.

### Test Coverage Analysis

`packages/cli/test/commands/graph-hotspots.spec.ts`:

- L259: `rejects invalid --category before computing hotspots` tests rejection of invalid value (`unknown`).
- L282: `passes category flags (--include-tests, --include-ignored, --all, --category) to getHotspots` tests `--include-tests` propagation to `getHotspots`.
- L299: `displays omission notice in text mode when tests or ignored are omitted` tests notice display when `entries: []`.
- L316: `includes omittedCounts in JSON mode` tests `omittedCounts` property in parsed JSON.

**Gaps in Test Suite:**

- Omission notice in text mode is only tested for the empty results branch (`entries: []`). The populated table branch (`entries.length > 0`) is not covered by a test asserting notice presence after the table.
- `--category`, `--include-ignored`, and `--all` flag propagations are not individually tested in `graph-hotspots.spec.ts`.

---

## 3. cli:graph-search

### Requirements Summary

| #   | Requirement                                                                                                                 | Delta Status | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| R1  | Command signature accepts `--tests`, `--include-tests`, `--include-ignored`, `--all`, `--category <source\|test\|ignored>`  | Modified     | MUST     |
| R2  | `--tests` acts as a convenience alias for `--category test`                                                                 | Modified     | MUST     |
| R3  | `--category` validates that argument is one of `source`, `test`, `ignored`; fails with exit code 1 before provider open     | Modified     | MUST     |
| R4  | Category options passed to Code Graph search in `SearchCodeGraphInput` (`fileCategories`, `includeTests`, `includeIgnored`) | Modified     | MUST     |
| R5  | CLI sends one unified search request without pre-limiting, post-filtering, or reconstructing results                        | Existing     | MUST     |
| R6  | Text output displays omission notice when `omittedCounts` indicates `tests > 0` or `ignored > 0`                            | Modified     | MUST     |
| R7  | JSON/TOON output includes `omittedCounts: { tests: number, ignored: number }` in root object                                | Modified     | MUST     |
| R8  | Deterministic category output order (`symbols`, `files`, `specs`, `documents`) preserved in all formats                     | Existing     | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                                                                                                            |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented | `packages/cli/src/commands/graph/search.ts` L111–118: registers `--tests`, `--include-tests`, `--include-ignored`, `--all`, `--category <category>` |
| R2  | ✅ Implemented | L211: `const rawCategory = opts.category ?? (opts.tests ? 'test' : undefined)`                                                                      |
| R3  | ✅ Implemented | L212–218: `if (rawCategory !== undefined && !VALID_FILE_CATEGORIES.has(rawCategory))` exits with code 1 via `cliError` before `withProvider`        |
| R4  | ✅ Implemented | L219–237 & L281–283: maps flags to `fileCategories`, `includeTests`, `includeIgnored` in `SearchCodeGraphInput`                                     |
| R5  | ✅ Implemented | L286–292: single call to `provider.search(searchInput)`                                                                                             |
| R6  | ✅ Implemented | L407–411: `formatOmissionNotice(omittedCounts)` rendered after results / `No results found.` in text mode                                           |
| R7  | ✅ Implemented | L473: `omittedCounts: omittedCounts ?? { tests: 0, ignored: 0 }` in JSON and TOON outputs                                                           |
| R8  | ✅ Implemented | Text order L300 (`symbols`), L353 (`files`), L377 (`specs`), L389 (`documents`); JSON keys order L417–473                                           |

### Verification Scenarios Audit

| Scenario                                                                     | Spec Source  | Implementation Coverage            | Test Status                    |
| ---------------------------------------------------------------------------- | ------------ | ---------------------------------- | ------------------------------ |
| Filter by multiple symbol kinds                                              | Base Spec    | `search.ts` L240–245, L274         | ✅ `graph-search.spec.ts` L521 |
| Filter by file path wildcard                                                 | Base Spec    | `search.ts` L275                   | ✅ `graph-search.spec.ts` L211 |
| Filter by workspace                                                          | Base Spec    | `search.ts` L276                   | ✅ `graph-search.spec.ts` L236 |
| Filter by category                                                           | Delta Verify | `search.ts` L211, L228–230         | ✅ `graph-search.spec.ts` L559 |
| Include tests alongside source                                               | Delta Verify | `search.ts` L231–233, L282         | ✅ `graph-search.spec.ts` L582 |
| Text output groups by category                                               | Base Spec    | `search.ts` L298–402               | ✅ `graph-search.spec.ts` L112 |
| Text output omits snippet blocks by default                                  | Base Spec    | `search.ts` L345, L362, L383, L397 | ✅ `graph-search.spec.ts` L152 |
| Text output renders snippets when requested                                  | Base Spec    | `search.ts` `renderSnippetBlock`   | ✅ `graph-search.spec.ts` L175 |
| Category headers show explicit limits in text mode                           | Base Spec    | `search.ts` L302, L355, L379, L392 | ✅ `graph-search.spec.ts` L190 |
| JSON output includes workspace and scores                                    | Base Spec    | `search.ts` L417–474               | ✅ `graph-search.spec.ts` L362 |
| Structured category order includes files                                     | Base Spec    | `search.ts` L417–474               | ✅ `graph-search.spec.ts` L414 |
| Omission notice displayed in text mode when search prunes non-admitted files | Delta Verify | `search.ts` L407–411               | ✅ `graph-search.spec.ts` L607 |
| Search JSON output includes omittedCounts                                    | Delta Verify | `search.ts` L473                   | ✅ `graph-search.spec.ts` L631 |

### Discrepancies & Observations

1. **JSON/TOON Output Schema in Help text misses `omittedCounts` (Low — Help Documentation Drift)**
   - **Spec (`cli:entrypoint`):** Schema in help text must reflect the complete JSON model.
   - **Code:** In `search.ts` L124–166, `addHelpText` schema lists `symbols`, `files`, `specs`, and `documents`, but omits `omittedCounts: { tests: number, ignored: number }`.
   - **Assessment:** Minor documentation omission. Runtime output is fully conformant.

2. **Domain field naming: `fileCategories` vs `categories` (Design Alignment — Conforming)**
   - In `search.ts`, the field passed to `SearchCodeGraphInput` is `fileCategories?: readonly FileCategory[]`, whereas in `impact.ts` and `hotspots.ts` it is `categories`.
   - This aligns with `@specd/code-graph`'s `SearchCodeGraphInput` domain interface (which already reserves `categories` for `SearchCategory[] = ['symbols', 'files', 'specs', 'documents']`).

### Test Coverage Analysis

`packages/cli/test/commands/graph-search.spec.ts`:

- L540: `rejects invalid --category before opening provider` tests validation and early rejection with code 1.
- L559: `passes category flags and maps --tests to category test` tests `--tests` mapping to `fileCategories: ['test']`.
- L582: `passes --include-tests, --include-ignored, --all to search input` tests `--include-tests` and `--include-ignored`.
- L607: `displays omission notice in text mode when tests are excluded` tests text output notice when matches are pruned.
- L631: `includes omittedCounts in JSON mode` tests structured `omittedCounts` in JSON output.

**Gaps in Test Suite:**

- Omission notice in text mode is only tested with empty search results (`No results found.`). It is not tested with populated results (e.g., 2 symbols returned and 3 test files omitted).
- Direct `--category source` or `--category ignored` (without `--tests`) is not explicitly asserted in test cases.

---

## 4. Spec Dependencies Audit

### `cli:entrypoint`

- **Output streams:** All three commands route data and tables to `stdout` via `output(...)`, and user errors/fatal errors to `stderr` via `cliError(...)`.
- **Exit codes:**
  - Exit code 0 for successful completion.
  - Exit code 1 for invalid category arguments (`invalid category "<cat>". Expected one of: source, test, ignored`), invalid kinds, missing selectors, and mutual exclusivity errors.
  - Exit code 3 for graph infrastructure errors (`GRAPH_BUSY`, `GRAPH_PROVIDER_STALE`, failure to open provider) handled by `withProvider`.
- **Excess arguments:** All three commands configure `.allowExcessArguments(false)`.
- **JSON/TOON output schema in help:** Discrepancy observed across all three commands (`impact`, `hotspots`, `search`): none document `omittedCounts` in their `addHelpText` JSON schema block.

### `cli:graph-cli-context`

- **Context resolution:** All three commands invoke `resolveGraphCliContext({ configPath: opts.config, repoPath: opts.path })`.
- **Provider lifecycle:** Wrapped in `withProvider(config, opts.format, async (provider) => { ... }, { kernel })`.
- **Staleness guard:** All three commands call `warnGraphStale(provider, config, kernel)` before querying the provider.
- **Lock probes:** No manual pre-open lock probes; relies on provider-owned availability.

### `code-graph:composition`

- **Facade usage:** Commands delegate querying exclusively to high-level `CodeGraphProvider` facade methods (`analyzeImpact`, `analyzeFileImpact`, `analyzeFilesImpact`, `analyzeSpecImpact`, `analyzePublicBindingImpact`, `getHotspots`, `search`).
- **No CLI reimplementation:** The CLI does not perform candidate filtering, BFS traversal, score calculation, or deduplication; it acts as a projection adapter for user flags and output formatting.

---

## 5. Metrics & Summary

| Spec                 | Total Requirements Audited | Implemented | Discrepancies                   | Scenarios with Tests         | Missing Test Scenarios                                               |
| -------------------- | -------------------------- | ----------- | ------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `cli:graph-impact`   | 11                         | 11          | 1 (help schema drift)           | 14 / 14                      | 2 coverage depth gaps (non-file targets, individual category flags)  |
| `cli:graph-hotspots` | 8                          | 8           | 1 (help schema drift)           | 11 / 11                      | 2 coverage depth gaps (non-empty table notice, individual flags)     |
| `cli:graph-search`   | 8                          | 8           | 1 (help schema drift)           | 13 / 13 (relevant to change) | 2 coverage depth gaps (non-empty search notice, direct `--category`) |
| **Total**            | **27**                     | **27**      | **3 (all documentation drift)** | **38 / 38**                  | **6 depth test gaps**                                                |

### Summary of Discrepancies

1. **`cli:graph-impact` — JSON/TOON output schema in help text missing `omittedCounts`** (Severity: Low / Spec Drift)
2. **`cli:graph-hotspots` — JSON/TOON output schema in help text missing `omittedCounts`** (Severity: Low / Spec Drift)
3. **`cli:graph-search` — JSON/TOON output schema in help text missing `omittedCounts`** (Severity: Low / Spec Drift)

### Compliance Verdict

**CONFORMANT with minor documentation drift.**
The implementation satisfies all functional requirements and verification scenarios of change `code-graph-file-categories` across `cli:graph-impact`, `cli:graph-hotspots`, and `cli:graph-search`. The only discrepancy is that the help text JSON schema annotations were not updated with the newly added `omittedCounts` field.
