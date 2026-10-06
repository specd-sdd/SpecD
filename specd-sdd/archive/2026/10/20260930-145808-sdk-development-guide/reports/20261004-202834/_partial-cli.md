# CLI compliance audit — `sdk-development-guide`

## Scope, method, and requirement evidence

Audited merged change specs `cli:guide-sdk`, `cli:guide`, `cli:entrypoint`, and `default:_global/architecture` against the current CLI implementation and tests. The code graph was current (1,207 source files / 42,497 symbols). Graph impact shows `registerGuideSdkCommand` is a MEDIUM-risk integration point with direct consumers in `createProgram`, the process entrypoint, documentation coverage, and its focused command suite.

The reviewed requirements resolve to these implementation surfaces:

| Requirement group                                                | Code / runtime evidence                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `guide-sdk` registration and lazy catalog loading                | `packages/cli/src/program.ts:267-269` registers `registerGuideSdkCommand` and memoizes a dynamic `import('@specd/guide/sdk')`; ordinary `guide` registration occurs separately.                                                                                                                                              |
| Listing, scope/collection validation, pagination, metadata index | `packages/cli/src/commands/guide-sdk/index.ts` validates `docs                                                                                                                                                                                                                                                               | api | all`and catalog collections independently, combines their predicates, and delegates to`GuideEngine.listGuides`; shared `listing-options.ts` enforces bounded positive pagination and topic-only flags. |
| Topic inspection, slicing, search, output                        | The same adapter delegates to the guide engine and uses the shared `formatGuide*` functions for text/JSON/TOON, listing/index envelope, topic metadata/content, and search hits.                                                                                                                                             |
| Standard CLI conventions                                         | The command calls `loadConfig`, maps expected failures through typed `SpecdCliError`/guide errors and `cliError`, and Commander rejects excess positionals. `cliError` writes prefixed stderr and a structured JSON/TOON error payload when requested.                                                                       |
| Existing `guide` compatibility/discovery                         | `commands/guide/index.ts` owns the additive `SDK_GUIDE_DISCOVERY`; `formatters.ts` emits it as a structured field. Runtime `guide --format json` returned `topics`, `pagination`, `collections`, and `sdkGuide`.                                                                                                             |
| Global architecture exception                                    | The merged `default:_global/architecture` now expressly permits a direct `@specd/guide` dependency for a thin CLI guide delivery adapter, requires delegation rather than reimplementation, and permits lazy `@specd/guide/sdk` loading. This reconciles the direct guide dependency with the global package-direction rule. |

## Implementation status

**Compliant in the reviewed scope.**

- `guide-sdk --format json --page-size 2` returned a bounded structured listing with `topics`, `pagination`, per-collection page ranges, topic `scope`, and `hiddenByDefault.revealWith = "specd guide-sdk --scope api"`.
- `guide-sdk --scope api --collection code-graph --page-size 2 --format json` returned only generated Code Graph topics, demonstrating independent filter composition.
- `guide-sdk core:ports --meta --format json` returned document metadata/outline without body content.
- An excess positional argument to `guide-sdk` exited `1` with Commander’s usage error.
- `guide --format json` returned the compatible listing envelope plus a machine-readable `sdkGuide` discovery field.
- `guide-sdk --help` and `guide --help` expose their discovery/SDK purpose and their JSON/TOON contracts without a root banner.

The direct guide dependency is conformant to the newly merged architecture requirement: the CLI contains delivery formatting/argument handling only, while catalog retrieval, lookups, slicing, and search remain delegated to the guide engine. The SDK catalog import is deferred until the SDK command action resolves its engine.

## Findings

No implementation or merged-spec discrepancy was found in this scope.

| Severity | Type | Finding                                                                                                                                                                        |
| -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| None     | —    | The prior potential `cli -> guide` package-direction conflict is resolved by the merged `CLI guide delivery adapter dependency` requirement in `default:_global/architecture`. |

## Test coverage

- `pnpm --filter @specd/cli exec vitest run test/commands/guide-sdk/guide-sdk.spec.ts` — **PASS**: 1 file, **72 tests**. Coverage includes registration/laziness, listings, scope/collection errors and composition, pagination/grouping, hidden API disclosure, catalog index, topic normalization, metadata and generated-topic rendering, section/window extraction, search, structured formats, unknown-topic suggestions, and error mapping.
- Runtime smoke checks — **PASS** for default/API-filtered lists, metadata inspection, existing-guide discovery envelope, help, and excess-argument rejection.

### Recommended additional regression tests (not compliance failures)

1. Spawn the built CLI with `--config` in both global and local positions, proving the root `preAction` propagation plus stdout/stderr separation in a process boundary.
2. Exercise a normal `specd guide <topic>` invocation from the fully assembled program while instrumenting the dynamic loader, proving the SDK module is never evaluated outside `guide-sdk`.
3. Add an architecture-boundary test asserting that CLI guide code only imports the public `@specd/guide` / `@specd/guide/sdk` delivery surface and continues to delegate engine operations.

## Dependency chain

`CLI entrypoint -> createProgram -> registerGuideSdkCommand -> lazy @specd/guide/sdk import -> createGuideSdkEngine -> GuideEngine -> SDK catalog/search adapters -> shared CLI formatters and typed error route`.

The sibling user-guide chain is `createProgram -> registerGuideCommand -> user GuideEngine -> shared formatter with sdkGuide discovery`. This is the delivery-adapter exception defined by the merged global architecture spec; it neither imports core/code-graph directly nor reimplements guide operations.

## Summary

- Specs audited: **4**
- Functional discrepancies: **0**
- Architecture/spec consistency discrepancies: **0**
- Focused tests: **72 passed**
- Runtime smoke checks: **6 passed**
- Suggested additional regression tests: **3**
