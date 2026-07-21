# SDK + CLI partial compliance audit

Change: `sdk-graph-provider-factory`  
Scope: `sdk:host-context`, `sdk:with-open-graph-provider`, `cli:graph-stats`, `cli:graph-impact`, `cli:graph-search`, `cli:graph-hotspots`  
Mode: merged-change preview versus current implementation and tests  
Audit date: 2026-07-20

## Method and evidence

- The graph was fresh (`stale: false`, indexed at `2026-07-19T17:45:36.355Z`). Code navigation used `graph search` and `graph impact`.
- Merged requirements and scenarios were read through `changes spec-preview sdk-graph-provider-factory <specId>`.
- Primary implementation evidence: `packages/sdk/src/composition/{host-context,with-open-graph-provider}.ts`; `packages/cli/src/commands/graph/{stats,impact,search,hotspots,with-provider,resolve-graph-cli-context,warn-graph-staleness}.ts`.
- Primary tests: the matching SDK composition tests and CLI graph-command tests. Targeted run from the package-native working directory passed: 91/91 tests. A root-working-directory invocation of the six test files had one path-dependent documentation-test failure; see Finding L-1.

## Requirement status

| Spec                           | Requirement result           | Evidence                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk:host-context`             | PASS                         | `createSdkContext` awaits `createKernel` and closes over the identical config for a fresh `createCodeGraphProvider`; `openSpecdHost` selects forced/discovery mode, rejects mixed inputs, retains warnings on config, and exposes no writers. Covered by `host-context.spec.ts` (10 tests).        |
| `sdk:with-open-graph-provider` | PASS                         | Helper creates, optionally hooks, opens, invokes, closes, invokes `afterClose`, and preserves an operation error over cleanup failure. It contains no exit side effect. Covered by `with-open-graph-provider.spec.ts` (9 tests).                                                                   |
| `cli:graph-stats`              | PASS against its merged spec | Uses `openSpecdHost`, `createGetGraphHealth`, workspace input, and `withProvider` (which delegates lifecycle to SDK); renders fields/warnings and validates mutually-exclusive flags. `graph-stats.spec.ts` (16 tests) exercises the principal paths. Dependency inconsistency D-1 remains.        |
| `cli:graph-impact`             | PASS                         | Validates exactly one selector/direction/depth and config/path exclusivity; delegates normalized selectors and traversal to provider via shared CLI graph context; formats text/JSON/TOON. `graph-impact.spec.ts` (27 tests) covers selectors, directions, depth, aggregation, output, and errors. |
| `cli:graph-search`             | PASS                         | Uses shared CLI graph context/provider lifecycle; routes symbol/spec/document requests, applies filters, controls content/snippet output, and renders normalized safe text snippets. `graph-search.spec.ts` (16 tests) plus provider-level graph tests cover command and ranking behavior.         |
| `cli:graph-hotspots`           | PASS                         | Uses shared context/provider; parses kinds, forwards filters, and relies on provider defaults (`minScore=1`, `minRisk=MEDIUM`, `limit=20`, importer-only false). Text/structured output and docs match. `graph-hotspots.spec.ts` (13 tests) covers command-side options and documentation.         |

## Scenario-by-scenario disposition

Legend: **P** = conforms; **T** = directly covered by the named test suite; **C** = code/provider evidence only (test gap or behavior exercised lower in the provider layer).

### `sdk:host-context` — 12/12 pass

| Scenario                                         | Status | Evidence                                                                                        |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| Context exposes kernel and provider factory only | P/T    | `SdkHostContext` has exactly the two fields; `host-context.spec.ts` asserts the returned shape. |
| Provider factory uses same config as kernel      | P/T    | `createSdkContext` uses the same `config` reference; test asserts both factories receive it.    |
| createSdkContext awaits kernel construction      | P/C    | `await createKernel(...)` precedes context return; no dedicated timing test.                    |
| Each provider call returns new instance          | P/T    | factory calls `createCodeGraphProvider` per invocation; test asserts distinct providers.        |
| Discovery mode loads config from cwd             | P/T    | default `{ startDir: process.cwd() }`; test asserts loader arguments/result path.               |
| Discovery mode can start from explicit startDir  | P/T    | `{ startDir: input.startDir }`; test asserts no CWD mutation.                                   |
| Forced config path                               | P/T    | `{ configPath: input.configPath }`; test asserts forced loader call.                            |
| Mixed bootstrap inputs are rejected              | P/T    | guard executes before loader creation; test asserts rejection/no loader call.                   |
| SDK composition options are forwarded            | P/T    | options reach kernel and graph factory; test covers both.                                       |
| Config warnings remain on returned config        | P/T    | loaded config is returned verbatim; warning test passes.                                        |
| Host result does not duplicate warnings          | P/T    | result contains no `warnings` key; test asserts it.                                             |
| Host context has no write methods                | P/C    | public interface has no writer methods; compile-surface test is absent.                         |

### `sdk:with-open-graph-provider` — 7/7 pass

| Scenario                                                 | Status | Evidence                                                       |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| Provider opened and closed around callback               | P/T    | ordered open → callback → close test.                          |
| Original error preserved when close fails during cleanup | P/T    | catch calls `close(true)` then rethrows original; direct test. |
| Close attempted after fn throws                          | P/T    | direct test.                                                   |
| Open failure cleans up without beforeOpen                | P/T    | catch path and direct test.                                    |
| afterClose runs after open failure cleanup               | P/T    | `close()` invokes hook after close attempt; direct test.       |
| SDK helper does not exit process                         | P/T    | no exit call and direct spy test.                              |
| beforeOpen runs before open                              | P/T    | ordered hook/open test.                                        |

### `cli:graph-stats` — 15/15 pass against the merged spec

| Scenario(s)                                                                                                                                                                   | Status | Evidence                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit config path bypasses discovery; Explicit path enters bootstrap mode; Mutually exclusive context flags fail fast                                                      | P/T    | `openSpecdHost` inputs and early flag guard; direct tests.                                                                                    |
| Command delegates health to GetGraphHealth via SDK; Command obtains orchestrated project structure; Host context from openSpecdHost                                           | P/T    | `createGetGraphHealth`, `kernel.project.listWorkspaces.execute()`, and `openSpecdHost`; test mocks/assertions.                                |
| Stats surface provider busy after open; Infrastructure error exits with code 3                                                                                                | P/C    | `withProvider` funnels provider errors to `handleError`; behavior is covered by shared error handling but lacks a command-local busy fixture. |
| Text output with fresh graph; Text output with stale graph; Text output with null ref; Text output with derivation fingerprint mismatch; Text output includes document counts | P/T    | renderer branches and stats tests for fresh/stale/null/fingerprint/document fields.                                                           |
| JSON output includes staleness fields; JSON stale field values                                                                                                                | P/T    | structured `{ ...stats, stale, currentRef, fingerprintMismatch }`; direct tests.                                                              |

### `cli:graph-impact` — 32/32 pass

| Scenario group                                                                                                                                                                                                                                                                                                         | Status | Evidence                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Explicit config path bypasses discovery; Explicit path enters bootstrap mode; Mutually exclusive context flags fail fast                                                                                                                                                                                               | P/T    | `resolveGraphCliContext` invocation and early guard; direct tests.                        |
| Invalid direction fails before provider access; Removed `--changes` flag is rejected; No selector provided; Multiple selectors provided                                                                                                                                                                                | P/T    | `parseImpactDirection`, Commander option surface, and selector-count guard; direct tests. |
| Spec selector enters requirement impact mode; Downstream spec analysis shows covered files and symbols; Upstream spec analysis shows dependent specs                                                                                                                                                                   | P/T    | `handleSpecImpact` calls provider traversal; direct tests.                                |
| Upstream file analysis with defaults; Unprefixed relative file resolves through configRelativePath; Absolute file path normalizes before lookup; Ambiguous unprefixed selector fails with canonical matches; File selectors resolved via provider normalization; Missing unprefixed selector reports normalized lookup | P/T    | `handleFilesImpact` resolution/normalization branches; direct tests.                      |
| Multi-file analysis aggregates file impact semantics; Multi-file text output shows grouped changed symbols; JSON output includes aggregate impact fields                                                                                                                                                               | P/T    | aggregated provider call/rendering; direct tests.                                         |
| Single symbol match; Full symbol id selector resolves directly; Multiple symbol matches; Symbol not found; Custom depth for symbol analysis                                                                                                                                                                            | P/T    | `handleSymbolImpact` branches and depth forwarding; direct tests.                         |
| Impact uses SDK graph context; Impact analysis surfaces provider busy after open; Infrastructure error exits with code 3                                                                                                                                                                                               | P/T    | shared context/`withProvider`; command tests include provider-error paths.                |
| Text output shows risk level and counts; Text output shows changed symbols for file impact; JSON output includes changedSymbols for file impact; JSON output for symbol impact; Impact paths are rendered relative to project root                                                                                     | P/T    | text and structured formatter tests.                                                      |

### `cli:graph-search` — 54/54 pass

| Scenario group                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status | Evidence                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search both categories by default; Search symbols only; Search specs only; Search supports document filter; Search delegates document queries to the provider; No results                                                                                                                                                                                                                                                                                       | P/T    | `searchBoth` routing and empty rendering; command tests.                                                                                                                                |
| Custom limit; Multiple kinds are passed through to the query layer; Filter by multiple symbol kinds; Filter by file path wildcard; Filter by workspace; Invalid kind token fails before query execution                                                                                                                                                                                                                                                         | P/T    | option parsing/`SearchOptions`; direct command tests.                                                                                                                                   |
| Explicit config path bypasses discovery; Explicit path enters bootstrap mode; Missing config falls back to bootstrap mode; Search uses SDK graph context                                                                                                                                                                                                                                                                                                        | P/T    | `resolveGraphCliContext` calls; direct tests.                                                                                                                                           |
| Snippet flag enables preview emission; Text output omits snippet blocks by default; Text output renders snippets when requested; Text-mode symbol snippet uses normalized indentation; Text-mode snippet block uses line range header and custom markers; Text-mode snippet sanitizes terminal control sequences                                                                                                                                                | P/T/C  | `renderSnippetBlock` + `normalizeSnippet`; command tests cover rendering/normalization. Control-sequence sanitization is delegated to the normalizer and needs a command-local fixture. |
| Identity-oriented partial query still prefers the intended result; Results ranked by relevance; Search matches symbol comments; Multi-word query matches across fields; Spec-id segment outranks body-only hits; Symbol declared name outranks comment-only hit; Document path component outranks body-only hit; query-token/CamelCase expansion; exact/prefix/suffix/component identity ordering; exact identity does not use raw boosted score as primary cue | P/C    | command preserves provider ordering; ranking and tokenization belong to code-graph provider/index tests, not this CLI test file.                                                        |
| Symbol hit from comment still uses code snippet preview; Spec preview comes from body content when body content drives the hit; Document preview is centered on the best textual match; Search results include 1-based line range metadata                                                                                                                                                                                                                      | P/C    | provider result contract is forwarded; command test verifies line metadata and output, while match-selection is provider-owned.                                                         |
| Provider cannot be opened exits with code 3; Provider busy or stale exits with code 3                                                                                                                                                                                                                                                                                                                                                                           | P/C    | shared `withProvider`/`handleError` path; no isolated CLI fixture in the scoped suite.                                                                                                  |
| Text output groups by category; Category headers show explicit limits in text mode; Text output shows workspace in brackets; Text output groups document results separately; Structured output includes documents array                                                                                                                                                                                                                                         | P/T    | direct text/JSON document tests.                                                                                                                                                        |
| JSON output includes workspace and scores but excludes full content; JSON output includes snippet only when requested; Toon output omits/includes snippet when requested; JSON with `--spec-content` includes full spec content; `--spec-content` with text format fails                                                                                                                                                                                        | P/T    | structured-output tests.                                                                                                                                                                |

### `cli:graph-hotspots` — 22/22 pass

| Scenario group                                                                                                                                                                           | Status | Evidence                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default hotspot filters apply when no explicit overrides are provided; Explicit limit/min-risk/min-score changes only its own setting; Explicit importer-only inclusion widens the query | P/T    | CLI sends kinds and explicit overrides; provider `resolveEffectiveHotspotDefaults` supplies omitted values; direct CLI tests plus provider defaults. |
| Explicit config path bypasses discovery; Bootstrap mode via explicit path ignores config discovery; Missing config falls back to bootstrap mode                                          | P/T/C  | shared `resolveGraphCliContext`; config/path direct tests, no-config fallback covered by shared context behavior.                                    |
| Comma-separated kind list is preserved; Omitted kind uses defaults; Explicit kind replaces defaults; Invalid kind token fails before querying                                            | P/T    | `parseGraphKinds` and direct command tests.                                                                                                          |
| All requested filters are delegated to provider; Hotspots use SDK graph context                                                                                                          | P/T/C  | options are assembled and `withProvider` called; unit tests cover key filters, but one all-options assertion is absent.                              |
| Hotspots surface provider busy after open; Infrastructure error exits with code 3                                                                                                        | P/C    | provider availability + `withProvider`/`handleError`; no command-local busy/error fixture.                                                           |
| Text output shows ranked hotspot table; Empty result set in text mode; JSON output includes derived workspace field                                                                      | P/C    | renderer has required branches; tests focus on option delegation, so output fixtures are missing.                                                    |
| Mutually exclusive context flags fail fast                                                                                                                                               | P/T    | early guard test.                                                                                                                                    |
| Command help documents default and explicit kind semantics; CLI reference documents graph hotspots bootstrap and kind semantics                                                          | P/T    | direct help/docs test passes from `packages/cli`.                                                                                                    |

## Discrepancies

### D-1 — HIGH: direct dependency spec contradicts the merged `cli:graph-stats` contract

`cli:graph-stats` now requires `openSpecdHost` and explicitly forbids a host-managed pre-open lock probe. Its implementation follows that new contract. However its direct dependency `cli:graph-cli-context` still requires **all** graph handlers including stats to resolve via `resolveGraphCliContext`, and its verification file still says stats uses `assertGraphIndexUnlocked` from the SDK. Those requirements cannot both be satisfied by the current intended design.

- Evidence: `packages/cli/src/commands/graph/stats.ts` uses `openSpecdHost` and `withProvider`; no pre-open lock check exists.
- Dependency evidence: `cli:graph-cli-context` “Graph command platform imports” and “Lock helpers via SDK barrel” require the opposite stats wiring.
- Interpretation: implementation is conformant with the changed `cli:graph-stats` spec; the dependency spec is stale and should receive a delta in this change (or the changed stats specification should be revised).

### L-1 — LOW: hotspot documentation test depends on process working directory

The scoped test collection passes 91/91 when run in `packages/cli`, but running the same explicit test file from repository root produces `ENOENT` for `../../docs/cli/cli-reference.md`. The test uses a CWD-relative read rather than a module-relative path.

- Product documentation exists and contains the required content; this is test invocation portability, not a user-facing command failure.
- The normal package-local test execution is green, but the test is fragile for root-targeted Vitest invocations.

## Dependency and global consistency

- Package direction is conformant: `packages/cli/package.json` has only `@specd/sdk` among platform dependencies; SDK owns direct `core` and `code-graph` dependencies. No direct CLI import from those packages was found in scoped graph handlers.
- SDK host composition is a thin manual-DI facade and contains no config writer or domain/business logic. CLI commands remain adapter/orchestration code.
- Scoped files use ESM named imports/exports, explicit public return types, readonly public shapes, and kebab-case filenames. No global architecture/conventions/testing/docs/eslint/spec-layout conflict was found beyond D-1’s stale direct dependency requirement.
- CLI hotspot help and `docs/cli/cli-reference.md` align with the merged hotspot specification.

## Test coverage assessment

- Executed: SDK host/lifecycle and four CLI command suites, 91 tests total, all passing from package-native working directories.
- Strong direct coverage: host bootstrap/lifecycle, stats formatting/staleness, impact selectors/traversal/output, search filters/structured snippets, hotspot option parsing/help/docs.
- Remaining test gaps (non-blocking): command-local fixtures for SDK/CLI provider `GRAPH_BUSY`/`GRAPH_PROVIDER_STALE` paths in stats/search/hotspots; hotspots text/JSON output; host-context compile-surface “no write methods”; SDK kernel-await timing; search terminal-control sanitization. Search-ranking scenarios are appropriately provider-owned but should be traceable to code-graph tests in a full cross-package report.

## Count summary

| Measure                                                                 |                                                                      Count |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------: |
| Scoped merged specs                                                     |                                                                          6 |
| Merged verification scenarios reviewed                                  |                                                                        142 |
| Scenario implementation status                                          |                                                           142 pass, 0 fail |
| Scenario groups with direct test evidence                               |                                                                         31 |
| Scenario groups relying on code/provider evidence, with noted test gaps |                                                                          8 |
| Compliance discrepancies                                                |                                                              1 high, 1 low |
| Executed targeted tests                                                 | 91 pass / 0 fail (package-native); 1 CWD-dependent root invocation failure |

## Conclusion

The scoped SDK and CLI implementation conforms to the merged change requirements and scenarios. Do not treat the audit as fully clean until D-1 is resolved: `cli:graph-cli-context` must be updated or its conflicting requirements explicitly superseded. L-1 is a low-risk test portability cleanup.
