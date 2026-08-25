# Partial Compliance Audit — SDK lifecycle and CLI graph index

## Scope and evidence

- Change: `centralize-graph-index-worker` (verification state).
- Change specs reviewed as merged previews: `sdk:composition`,
  `sdk:run-index-project-graph`, `sdk:with-open-graph-provider`, and
  `cli:graph-index`, including their merged verification scenarios.
- Direct/global constraints reviewed: `sdk:host-context`, `cli:entrypoint`,
  `default:_global/architecture`, and `default:_global/testing`.
- Graph-first discovery was attempted against the fresh graph. It resolved both SDK
  public symbols and the isolated-worker entrypoint; its impact edges for the two
  SDK functions were absent, so source/test inspection supplied the remaining
  call-chain evidence.

## Requirements Summary

1. SDK is the only shared host facade: SDK depends on Core and Code Graph; CLI
   depends on SDK rather than Code Graph directly.
2. `withOpenGraphProvider` creates, opens, invokes, closes, and calls lifecycle
   hooks in order. It supports one generic recovery only after a failed initial
   parameterless open has first been closed.
3. `runIndexProjectGraph` owns force-only typed storage recovery for transient
   providers, preserves explicit-provider ownership, and forwards input/result/
   progress without lock ownership.
4. `graph index` is a process-isolated SDK-worker command. CLI passes only a
   serializable descriptor/task input, owns presentation, and has no raw lock,
   fork, IPC, or Code Graph dependency.
5. Forced healthy indexing is a logical full reindex; typed incompatible storage
   gets one closed-store recreation and retry. Documentation must make that
   distinction visible.

## Implementation Status

| Area                                               | Status             | Evidence                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK dependency/public-host boundary                | Conforms           | `packages/sdk/package.json` has only Core/Code Graph runtime dependencies; `packages/cli/package.json` uses SDK and no direct Code Graph package. `sdk/src/index.ts` exposes the documented isolated-worker and graph host contracts.                                                                  |
| `runIndexProjectGraph` provider ownership/recovery | Conforms           | `sdk/src/orchestration/run-index-project-graph.ts` rejects explicit provider plus hooks, sends `force` to `provider.index`, and registers recovery only for `force === true` plus `GraphStorageRecoveryRequiredError`; recovery invokes `provider.recreate()` and lets the helper make the sole retry. |
| CLI isolated task boundary                         | Conforms           | `cli/src/commands/graph/index-graph.ts` calls SDK `runIsolatedGraphIndex` once with a packaged task URL, serializable context/index input, and text-only progress callback. `cli/src/graph-index-task.ts` reconstructs the host and calls SDK `runIndexProjectGraph` once.                             |
| CLI force/rebuild output and documentation         | Conforms           | The result formatter retains `fullRebuild` and `fullRebuildReason`; CLI reference explains logical force versus typed closed-store repair.                                                                                                                                                             |
| `withOpenGraphProvider` base lifecycle             | Partially conforms | Normal open/callback/close ordering, original callback-error preservation, and no process exit are implemented. Two recovery-path contract deviations follow.                                                                                                                                          |

## Discrepancies

### D1 — Unsupported specialized `options.open` remains public and bypasses the required open contract

- Classification: **code** (implementation and tests retain obsolete behavior;
  merged spec is explicit about parameterless `provider.open()`).
- Severity: medium.
- Evidence: `WithOpenGraphProviderOptions` in
  `packages/sdk/src/composition/with-open-graph-provider.ts` still exports
  `open?: (provider) => Promise<TOpen>`. The helper conditionally invokes it in
  place of `provider.open()` and exposes its result as a second callback argument.
  `packages/sdk/test/composition/with-open-graph-provider.spec.ts` actively tests
  both the specialized open path and recovery from it.
- Spec conflict: merged `sdk:with-open-graph-provider` defines the signature as
  `fn: (provider) => Promise<T>`, says the helper calls parameterless
  `provider.open()`, and says recovery does not alter `CodeGraphProvider.open()`.
  Its option contract enumerates `beforeOpen`, `afterClose`, and the newly added
  generic `recoverOpenFailure`, with no custom-open escape hatch.
- Consequence: a delivery host can still sidestep the long-lived-provider open
  contract and reintroduce indexing-specific open semantics that the change was
  intended to centralize/remove.
- Resolution direction: remove `TOpen`, `options.open`, and the optional callback
  result; update the two legacy specialized-open tests to the parameterless
  recovery scenarios defined by the merged verify artifact.

### D2 — Recovery/retry terminal paths notify `afterClose` without a final close attempt

- Classification: **code**.
- Severity: high.
- Evidence: after the pre-recovery `closeBeforeRecovery()`, a recovery callback
  throw and a retry `provider.open()` throw each execute only
  `notifyAfterClose(true)`. Neither path calls `provider.close()` again. A retry
  open may have acquired partial resources before rejecting, and a failed
  `recreate()` may likewise leave an implementation requiring defensive cleanup.
- Spec conflict: merged `sdk:with-open-graph-provider` requires a recovery
  callback failure or retry-open failure to be terminal while `afterClose` runs
  **after final cleanup**. It also requires close attempts on failed open paths.
- Consequence: the public `afterClose` hook can observe a provider that has not
  received final cleanup after the retry/recovery terminal path, contrary to its
  lifecycle guarantee; this is specifically risky for a worker/SQLite recovery
  sequence.
- Resolution direction: route recovery-callback failure and retry-open failure
  through one final best-effort `close` path before `afterClose`, retaining the
  original terminal error if final cleanup also fails. Preserve the one-retry
  bound and avoid a second recovery callback.

No spec-only discrepancy or global/dependency contradiction was found in this audit
slice. The CLI and SDK dependency directions remain consistent with global
architecture constraints.

## Test Coverage

| Requirement area              | Coverage                                                                                                                                                                                                  | Assessment                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| SDK normal provider lifecycle | `with-open-graph-provider.spec.ts` covers success ordering, close failure, callback failure, before/after hooks, initial-open failure, declined recovery, and no `process.exit`.                          | Good, except D1 means two tests assert behavior no longer specified. |
| SDK force-only typed recovery | `run-index-project-graph.spec.ts` covers typed forced recreation, nonforce/no-recovery behavior, explicit-provider ownership, hook conflict, progress, workspace selection, and result fields.            | Good for the primary happy/declined paths.                           |
| CLI delegation/presentation   | `graph-index.spec.ts` covers SDK isolated-worker call count/input, configured/bootstrap descriptors, text-only progress, validation/system exit mapping, and absence of raw mechanisms/direct Code Graph. | Good unit coverage.                                                  |
| CLI real child/force recovery | `graph-index-integration.spec.ts` starts publish-shaped child processes, checks repeated forced JSON/TOON runs, lock cleanup, corruption preservation for nonforce, forced repair, and busy-lock error.   | Strong integration coverage.                                         |
| Docs                          | `docs/cli/cli-reference.md` describes force and typed repair.                                                                                                                                             | Present.                                                             |

## Missing Tests

1. Add a `withOpenGraphProvider` test where recovery callback throws: assert a
   second/final `close` attempt happens before exactly one `afterClose`, and the
   recovery error is retained.
2. Add a test where the retry `open()` rejects after partial acquisition: assert
   final close occurs before `afterClose`, no third open, and no second recovery
   callback.
3. Replace the obsolete specialized-open tests with a compile/API-surface check
   that `WithOpenGraphProviderOptions` and the callback do not expose `open` or a
   second callback result.
4. Strengthen `runIndexProjectGraph` recovery coverage to assert caller
   `beforeOpen`/`afterClose` invocation counts and their ordering during the
   typed forced recovery path, as required by its merged scenario.

## Spec Dependency Chain

`cli graph index` → SDK `runIsolatedGraphIndex` → trusted
`cli graph-index-task` → SDK `runIndexProjectGraph` →
`withOpenGraphProvider` → `CodeGraphProvider.open/index/close/recreate`.

The CLI has no direct Code Graph dependency and does not coordinate the index lock;
that isolation/lock implementation is correctly behind the Code Graph worker
boundary. SDK is the location of the force-only typed-open recovery decision, and
Code Graph remains owner of physical recreation.

## Summary Counts

- Requirements/scenario groups assessed: 26
- Conforming: 24
- Partial: 1
- Discrepancies: 2 (code: 2; spec: 0; both: 0)
- Missing-test items: 4
- Dependency/global contradictions: 0
