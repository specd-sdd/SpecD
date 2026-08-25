# Specs Compliance Audit — centralize-graph-index-worker

## Aggregate Summary

This read-only audit covers 26 requirement areas across the merged Code Graph (13), SDK (7), and CLI (6) specifications, including 20 merged CLI verification scenarios. Twenty-four areas are fully implemented and two SDK areas are conformant with incomplete automated coverage. No high- or critical-severity discrepancies were found.

Two medium discrepancies require a design or implementation decision:

1. Code Graph startup/IPC-send failure can remain pending if an injected child never emits `exit`, while the spec requires a terminal path that releases the lease and settles deterministically.
2. The SDK merged layer rule says `src/shared/` must not be re-exported, yet the same spec requires public aliases currently exported directly from `src/shared/`; the declared allowed layers also omit the existing `src/domain/` tree.

Test gaps are primarily publish-shape and adverse-process-path coverage: deterministic send-failure cleanup, broader built-worker fixture execution, built SDK declaration imports and negative export checks, and real CLI JSON/TOON child-process output checks. They do not establish a functional failure. The detailed partial audits follow verbatim.

## Detailed Findings

<!-- BEGIN _partial-cli.md -->

# CLI Graph Index — Partial Compliance Audit

## Requirements Summary

Audited merged spec `cli:graph-index` and its 20 merged verification scenarios.

1. Command signature: `graph index` accepts `--force`, repeatable `--exclude-path`, mutually exclusive `--config`/`--path`, and `--format` defaulting to text.
2. Execution boundary: CLI delegates exactly once to SDK `runIsolatedGraphIndex`, supplies storage root, trusted packaged task module, serializable context descriptor, index options, and text-only progress callback.
3. CLI boundary: no CLI lock, child process, IPC, signal, cleanup, direct Code Graph dependency, or public parent-process bypass.
4. Packaged child task: reconstructs configured/bootstrap SDK context and calls `runIndexProjectGraph` once with unchanged force/exclusion options.
5. Presentation/error contract: text summaries, structured results without protocol output, CLI error mapping to exit 3, and per-file errors remain successful results.
6. Documentation and repair: graph reference documents all subcommands/configuration semantics; result presentation preserves rebuild and coverage/error fields.

## Implementation Status

| Requirement area                                | Status      | Evidence                                                                                                                                                                                                           |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command/options/context validation              | Implemented | `packages/cli/src/commands/graph/index-graph.ts:20-134` registers all options, rejects dual config/path before resolving context, and uses `parseFormat` defaults.                                                 |
| SDK-only isolated delegation                    | Implemented | `index-graph.ts:111-127` calls `runIsolatedGraphIndex` once with `storageRoot`, `new URL('./graph-index-task.js', import.meta.url)`, serializable `taskInput`, and text-only `onProgress`.                         |
| No CLI-owned worker mechanics/direct dependency | Implemented | `index-graph.ts` imports only SDK platform capability; `packages/cli/package.json` contains no `@specd/code-graph` dependency. Static guard in `packages/cli/test/commands/graph-index.spec.ts:91-96`.             |
| Child task behavior                             | Implemented | `packages/cli/src/graph-index-task.ts:54-81` opens configured SDK host or builds explicit bootstrap config, then returns exactly one `runIndexProjectGraph` invocation with force/exclusions and bridged progress. |
| Output/error behavior                           | Implemented | `index-graph.ts:129-139` renders text or full structured result and maps worker failures through `cliError(..., 3)`; `formatTextIndexResult` retains document/workspace/phase/rebuild/error fields.                |
| Documentation                                   | Implemented | `docs/cli/cli-reference.md:1184-1576` contains `graph` with `index`, `search`, `hotspots`, `stats`, and `impact`, config/bootstrap rules, exclusion semantics, and usage examples.                                 |

## Discrepancies

No functional or specification discrepancies found in the CLI-owned surface.

### Coverage-only observation — Low

`packages/cli/test/commands/graph-index-integration.spec.ts` exercises a real child for text output and lock contention, but does not execute a real child invocation in JSON/TOON mode to prove protocol traffic never reaches stdout. Unit coverage verifies structured mode omits the progress callback (`graph-index.spec.ts:59-66`), and isolation/protocol behavior is directly covered in the Code Graph worker audit surface. This is a test-depth gap, not evidence of noncompliance.

## Test Coverage

- Executed: `pnpm --filter @specd/cli exec vitest run test/commands/graph-index.spec.ts test/graph-index-task.spec.ts`
  - Result: 2 files passed, 8 tests passed.
- `graph-index.spec.ts` covers configured delegation, exact bootstrap descriptor, text progress/result rendering, mutually exclusive flags before SDK call, worker-error exit 3, absence of CLI worker environment branches, and absence of direct Code Graph dependency.
- `graph-index-task.spec.ts` covers configured and bootstrap SDK-context reconstruction, one indexing call, force/exclusion forwarding, progress bridge, and static SDK-boundary restrictions.
- `graph-index-integration.spec.ts` provides publish-shaped built-artifact coverage: actual child task indexing and busy lock exit 3.
- Documentation inspection confirms all required graph command reference sections and index configuration semantics are present.

## Missing Tests

1. Add a publish-shaped integration invocation with `--format json` (and optionally TOON) to assert stdout parses as exactly one final structured result with no worker/progress protocol records. Severity: low; current unit test supplies direct evidence for the CLI branch.
2. Optionally test repeated `--exclude-path` in the real child path; unit delegation coverage verifies serialized forwarding, while SDK/worker tests own process-boundary protocol validation. Severity: low.

## Spec Dependency Chain

`cli:graph-index` depends directly on:

- `cli:entrypoint` for parser/error/output behavior.
- `core:config` and `core:list-workspaces` for configured/bootstrap context semantics.
- `sdk:run-index-project-graph` and `sdk:host-context` for child-task orchestration/context reconstruction.
- `code-graph:isolated-index-worker` for lock, spawn, IPC, signal forwarding, termination classification, and cleanup.

Graph impact reports this spec as CRITICAL-risk with 5 direct, 12 indirect, and 72 transitive dependent specs; the CLI change confines its high-risk boundary to SDK imports and the packaged task rather than reimplementing worker mechanics.

## Summary counts

- Requirements audited: 6 requirement areas / 20 merged scenarios.
- Fully implemented: 6.
- Functional discrepancies: 0.
- High/critical discrepancies: 0.
- Test-coverage observations: 1 low.
- Missing-test recommendations: 2 low.

<!-- END _partial-cli.md -->

<!-- BEGIN _partial-codegraph.md -->

# Compliance audit — Code Graph

## Requirements Summary

Scope: merged change specs `code-graph:isolated-index-worker` and the change-introduced portions of `code-graph:composition`, plus their direct implementation dependencies and `default:_global/architecture`.

`isolated-index-worker` defines eleven requirements: a curated high-level API; parent-owned exclusive locking; `child_process.fork` isolation; trusted installed task-module loading; runtime-validated IPC; presentation-neutral progress/results; distinct typed failures; scoped signal forwarding; internal lock handoff; a built, module-relative ESM child; and idempotent cleanup.

The composition delta requires that the same curated package entrypoint exports the host API/contracts but not raw lock/process/protocol internals, and that the built child is shipped without a public package subpath.

## Implementation Status

| Requirement area                                | Status                          | Evidence                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High-level API and neutral host surface         | Pass                            | `src/composition/run-isolated-graph-index.ts:9` exposes `runIsolatedGraphIndex`; `src/public.ts` exports it and only host contracts/errors. Input contains storage root, trusted file URL/path, serializable input, optional progress callback. No rendering or process-exit call exists in the supervisor. |
| Exclusive lease and concurrent writer rejection | Pass                            | `src/infrastructure/isolated-index-worker/supervisor.ts:73-83` validates before acquiring `acquireLock`; `src/infrastructure/index-lock.ts:80-127` creates an exclusive tokenized lease with idempotent release.                                                                                            |
| Child-process isolation                         | Pass                            | `supervisor.ts:180-186` calls Node `fork` with an IPC channel; `isolated-index-worker-child.ts` performs dynamic import/task execution. No production worker-thread or in-process alternative is public.                                                                                                    |
| Trusted task contract and JSON boundary         | Pass                            | `supervisor.ts:249-271`, `json-value.ts`, `protocol.ts`, and `isolated-index-worker-child.ts:125-177` require absolute/file URL task modules, callable `runGraphIndexTask`, and strict JSON values for input/progress/result.                                                                               |
| IPC lifecycle and typed failures                | Pass                            | Strict tagged validators in `protocol.ts`; `supervisor.ts:124-177` distinguishes malformed, duplicate/late, task, exit, and signal paths. `isolated-graph-index-errors.ts` subclasses `SpecdCodeGraphError` with upper-snake-case codes and structured exit/signal fields.                                  |
| Signal and resource cleanup                     | Pass, subject to test gap below | `supervisor.ts:89-120, 159-177` records its exact listeners, forwards once, awaits `exit`, disconnects child IPC, and releases the lease before settlement.                                                                                                                                                 |
| Lock handoff scoped to child/root               | Pass                            | Supervisor injects root/token environment values; `index-lock.ts:148-156` verifies root, live lock token, and `process.ppid`; `CodeGraphProviderImpl.withIndexLock` consumes it only for matching provider storage.                                                                                         |
| Published ESM worker / curated exports          | Pass                            | `package.json` builds the child into `dist`; `run-isolated-graph-index.ts:12` resolves relative to `import.meta.url`; package exports only `.` and `./internal`, with no worker subpath. `public.ts` does not export raw coordination/IPC primitives.                                                       |
| Architecture consistency                        | Pass                            | The host contract is in application, Node process/FS details are infrastructure, and the public operation is composition. It adds no dependency on SDK, CLI, Commander, or formatter, consistent with `default:_global/architecture`.                                                                       |

## Discrepancies

### MEDIUM — startup/send failure can await an exit event indefinitely

**Spec evidence:** `isolated-index-worker` requires fork startup or IPC-channel creation failure to be a typed terminal path that releases the lock exactly once; cleanup must complete before the returned promise settles.

**Code evidence:** `supervisor.ts:188-205` records a `GraphIndexWorkerStartError` for a disconnected child or `child.send` callback error and calls `terminate()`. It only settles from `onExit` (or from a synchronous `fork` throw when no child was assigned). If a launcher returns a disconnected/non-exiting child, or the child never emits `exit` after a send-channel failure, the promise and lease remain pending. This is unlikely with ordinary Node child-process lifecycle behavior, but it violates the stated guarantee at the injected-runtime boundary and leaves the terminal cleanup promise unbounded.

**Interpretation:** either the implementation should make known start/IPC-send failure a guaranteed settled terminal path (after safe child teardown), or the spec must explicitly rely on Node's eventual exit-event guarantee. The former is more aligned with the current exhaustive terminal-path wording.

**Recommended resolution:** add a supervisor test with `send` callback failure and no automatic exit, then make the supervisor deterministically settle/release (or document and enforce the runtime contract that all failed launches emit `exit`).

No other requirement/code contradiction was found in this scoped audit. The earlier implementation-link diagnostics for qualified method names/reexports are graph-link resolution limitations, not behavioral discrepancies.

## Test Coverage

| Scenario family                                             | Existing evidence                                                                                                                                                                                                    | Assessment                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| JSON values and exact protocol envelopes                    | `test/infrastructure/isolated-index-worker/protocol.spec.ts` tests cyclic/function/symbol/bigint/non-finite rejection, unknown tags, extra keys, and bounded error serialization.                                    | Good unit coverage.                                                          |
| Progress ordering, duplicate terminal, clean premature exit | `supervisor.spec.ts` covers A/B/C arrival order, duplicate terminal → protocol error, IPC disconnect, listener removal, and exit-without-terminal.                                                                   | Good targeted coverage.                                                      |
| SIGINT/SIGTERM behavior                                     | `signals.spec.ts` checks each signal forwards once, preserves pre-existing listeners, and reports `GRAPH_INDEX_WORKER_SIGNAL` with signal/exit data.                                                                 | Good targeted coverage.                                                      |
| Lock lease and handoff integrity                            | `index-lock.spec.ts` covers unrelated roots and exact live token/replacement-lock protection; `code-graph-provider.spec.ts:218+` covers matching handoff for indexing and verifies ordinary reads do not consume it. | Good coverage of root/token scoping.                                         |
| Packaging/export shape                                      | `dist.spec.ts` checks build scripts, emitted child file, and absence of public worker subpaths; `barrel.spec.ts` asserts public `runIsolatedGraphIndex`.                                                             | Good static packaging coverage; not a true installed-package execution test. |
| Full production child task behavior                         | Fixtures exist (`valid-task`, `invalid-contract-task`, `non-json-task`, `task-failure`), but the located worker tests do not execute all of them through the built public supervisor.                                | Partial.                                                                     |

The command `pnpm --filter @specd/code-graph test -- --run test/infrastructure/isolated-index-worker` was started during this audit but did not return a completed Vitest summary within the command window, so this report does not claim that invocation passed. Previous workflow validation should be cited separately if its completed result is needed.

## Missing Tests

1. **Required for the discrepancy:** a fake child whose `send` callback reports an error and never emits `exit`; assert bounded rejection, single release, IPC cleanup, and listener removal.
2. **Recommended:** actual built/public-supervisor integration tests for every provided fixture: valid result/progress, missing/non-callable export, task throw, non-JSON progress/result, non-zero/native-like exit, and concurrent same-root run proving no second fork.
3. **Recommended:** publish-shaped copy outside the repository/CWD that actually invokes `runIsolatedGraphIndex` and dynamically imports a built fixture. The present `dist.spec.ts` only checks existence/configuration.
4. **Recommended:** explicit assertion that a worker `error` event following an apparent terminal result cannot resolve success if the IPC delivery was invalidated.

## Spec Dependency Chain

- `default:_global/architecture` → requires ports/adapters and delivery adapters delegating to core capabilities.
- `code-graph:composition` → owns the factory-created facade and curated public/internal entrypoints.
- `code-graph:isolated-index-worker` → is a direct extension of the Code Graph composition surface; it depends on internal index locking, provider indexing, and packaged runtime internals without exposing them.
- The graph is current (`lastIndexedAt: 2026-08-25T07:13:17.653Z`, `stale: false`). Impact analysis marks `supervisor.ts` HIGH-risk with direct dependencies on the lock, protocol, JSON validation, provider/indexer, and typed errors; this supports the scoped review and test emphasis.

## Summary counts

- Requirements/areas assessed: 11 isolated-worker requirements + 2 composition additions + global architecture alignment.
- Pass: 13
- Discrepancies: 1 medium
- Critical/high discrepancies: 0
- Test gaps: 4 (1 directly tied to the medium discrepancy)

<!-- END _partial-codegraph.md -->

<!-- BEGIN _partial-sdk.md -->

# SDK Composition Compliance Audit

Scope: `sdk:composition` in change `centralize-graph-index-worker`, plus its direct
consumer (`cli`) and relevant global architecture/conventions constraints. This was a
read-only audit against the merged change preview, the current Code Graph (fresh at
2026-08-25T07:13:17Z), source, declarations-by-source, and SDK tests.

## Requirements Summary

1. SDK is a thin `packages/sdk` composition package whose only platform runtime
   dependencies are Core and Code Graph.
2. The public barrel is curated: it exposes SDK composition/orchestration/presentation,
   selected Core APIs, and selected Code Graph host APIs, without direct Core export-star
   or graph lock/IPC internals.
3. The new isolated graph-index API must be available from SDK with its host contracts
   and typed failures, so delivery hosts need not import Code Graph or coordinate locks.
4. Hosts using both Core and Code Graph must use SDK only. SDK must publish the current
   version and expose implementation-review orchestration and its graph result types.

## Implementation Status

| Requirement                         | Status                  | Evidence                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identity/dependencies       | Pass                    | `packages/sdk/package.json` names `@specd/sdk`; only `@specd/core` and `@specd/code-graph` are runtime platform dependencies. `package-boundary.spec.ts` asserts this.                                   |
| Curated public exports              | Pass with coverage gaps | `packages/sdk/src/index.ts` explicitly exports Core via `./core-reexports.js`, SDK layers, and selected Code Graph symbols; it has no `export * from '@specd/core'`.                                     |
| Isolated worker host surface        | Pass                    | `index.ts` exports `runIsolatedGraphIndex`, JSON/task/input contracts, `IsolatedGraphIndexRunner`, and all six public worker/task failure classes. It does not export listed lock/IPC/runtime internals. |
| Integrator import policy            | Pass for CLI            | `packages/cli/package.json` has `@specd/sdk` and no direct `@specd/core`/`@specd/code-graph`; all current CLI source matches import SDK.                                                                 |
| Version constant                    | Pass                    | `SDK_VERSION` reads SDK `package.json`; the barrel test compares it. `codeGraphVersion` delegates to `CODE_GRAPH_VERSION`.                                                                               |
| Implementation-review orchestration | Pass                    | `buildImplementationReview` and input/result/review-symbol types are exported from SDK; the orchestration composes Core tracking and Code Graph resolution through `withOpenGraphProvider`.              |

## Discrepancies

### Medium — merged layer-structure rule is violated and internally inconsistent

- **Spec evidence:** `sdk:composition` says `src/shared/` is internal and "MUST NOT be
  re-exported from `src/index.ts`". The same merged spec later requires public
  `codeGraphVersion` and `getCodeGraphVersion` as SDK-owned aliases.
- **Code evidence:** `packages/sdk/src/index.ts` directly exports both aliases from
  `./shared/code-graph-version.js`; `packages/sdk/src/shared/code-graph-version.ts`
  implements them. The tree also contains `src/domain/errors/`, although the listed
  allowed SDK layers omit `domain/`.
- **Possibilities:** (a) the spec is stale/overly literal: a small public version helper
  and an existing SDK-specific error are intentional; or (b) the implementation should
  relocate/public-wrap these modules to satisfy the declared layer list and retain
  `shared` as truly private. The two requirements cannot both be satisfied by a direct
  re-export from `shared` without a design clarification.

### Low — public contract verification is narrower than the merged scenarios

- **Spec evidence:** the worker scenario requires all host-facing input, progress,
  result, and typed worker failure contracts from `@specd/sdk`; the no-raw-lock scenario
  also calls for inspecting generated declarations.
- **Code evidence:** the barrel exports the contracts visible in
  `packages/sdk/src/index.ts`; however `packages/sdk/test/barrel.spec.ts` checks only
  `runIsolatedGraphIndex` at runtime and a partial list of prohibited internals/source
  strings. It does not compile-import every required type/error, nor inspect generated
  `dist/index.d.ts`.
- **Possibilities:** code is likely correct (the named exports are present) but tests do
  not protect against a type-only re-export regression or declaration leakage; or the
  spec expects publish-shape verification that is currently missing from SDK tests.

### Low — package-export wording does not match publish-shaped package metadata

- **Spec evidence:** the public-barrel rule says package `exports` must map `"."` to
  `src/index.ts`.
- **Code evidence:** `packages/sdk/package.json` correctly maps `"."` to
  `./dist/index.js` / `./dist/index.d.ts`; source is built by tsup. This is expected for
  a package publishing `files: ["dist/"]`.
- **Possibilities:** the wording means the logical source barrel, in which case the spec
  should say so; if literal, the implementation violates it but changing to `src/` would
  break the published package. Treat as specification drift, not a code defect.

## Test Coverage

- `pnpm --filter @specd/sdk test`: **9 files, 64 tests passed**.
- `pnpm --filter @specd/sdk typecheck`: **passed**.
- `test/barrel.spec.ts` covers SDK version, bootstrap/orchestration exports, absence of
  Core export-star, selected metadata exports/exclusions, worker function exposure,
  several lock/IPC exclusions, version aliases, and `/ports` and `/extensions`.
- `test/composition/package-boundary.spec.ts` verifies SDK runtime platform dependencies.
- Existing SDK orchestration tests cover `runIndexProjectGraph` provider/lifecycle,
  progress and version forwarding; `build-implementation-review.spec.ts` covers the
  Core + Code Graph orchestration.
- Graph impact for `sdk:src/index.ts` is LOW and identifies
  `packages/sdk/test/barrel.spec.ts` as its direct dependent/covering test; it is the
  correct focused regression surface for these re-exports.

## Missing Tests

1. A compile-time/publish-shaped SDK barrel test importing every required isolated-worker
   type and failure (`RunIsolatedGraphIndexInput`, JSON/progress/task types,
   `GraphIndexWorkerStartError`, `GraphIndexTaskContractError`,
   `GraphIndexTaskExecutionError`, `GraphIndexWorkerProtocolError`,
   `GraphIndexWorkerExitError`, `GraphIndexWorkerSignalError`, and
   `GraphIndexProgressHandlerError`) from built `@specd/sdk` declarations.
2. A generated-declaration negative test proving no lock-path helper, release callback,
   lock token, or raw worker protocol type is exported. Current runtime/source checks
   are helpful but do not cover declaration-only leakage.
3. A package-boundary consumer fixture that imports the isolated worker contracts from
   SDK while declaring SDK as its sole Core/Code Graph platform dependency. CLI coverage
   demonstrates the dependency migration, but not the full public type contract in a
   publish-shaped consumer.
4. A structural test or revised spec resolving whether `src/domain/` and public aliases
   sourced from `src/shared/` are allowed.

## Spec Dependency Chain

`default:_global/architecture` and `default:_global/conventions`
→ `core:composition` / `code-graph:composition`
→ `code-graph:isolated-index-worker` (public isolated execution contracts)
→ `sdk:composition` (curated host-facing re-export)
→ `cli:host-context` / CLI graph-index consumer.

The current CLI migration follows that chain: its package dependency and source imports
use `@specd/sdk`, while the worker implementation remains owned by Code Graph.

## Summary counts

- Requirements assessed: 7
- Fully conformant: 5
- Conformant with incomplete automated coverage: 2
- Implementation defects confirmed: 0
- Spec/design discrepancies: 1 medium, 1 low
- Test-coverage gaps: 4 low

<!-- END _partial-sdk.md -->
