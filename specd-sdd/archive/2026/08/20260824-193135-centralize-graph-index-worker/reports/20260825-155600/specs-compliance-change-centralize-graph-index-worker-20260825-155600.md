# Specs Compliance Audit — centralize-graph-index-worker

**Mode:** specific change (Full verification)  
**Date:** 2026-08-25 15:56  
**Scope:** 9 change specs, applicable global specs, and direct dependencies.

## Executive summary

The audit found one medium-severity implementation discrepancy and two associated
test gaps. The remaining eight audited change specs are conformant, with no spec
contradictions identified. The code graph declared itself current but returned zero
files and symbols; audit batches used direct inspection after the required graph-first
attempt, so this is a non-scoped tooling observation.

| Severity                  | Count |
| ------------------------- | ----: |
| Critical                  |     0 |
| High                      |     0 |
| Medium                    |     1 |
| Low                       |     0 |
| Informational / test gaps |     2 |

## Detailed findings

### Worker and CLI audit

# Compliance partial — isolated worker and CLI graph index

**Scope:** `code-graph:isolated-index-worker`, `cli:graph-index`, and the direct SDK orchestration boundary they consume.  
**Method:** merged `verify` previews, source and test inspection, focused test execution. The graph was attempted first, but its own stats reported `fileCount: 0`, `symbolCount: 0`, and no CLI search results while also claiming `coverageComplete: true`; direct inspection is therefore the reliable evidence source for this partial.

## Requirements Summary

The Code Graph capability owns exclusive locking, `fork`-based process isolation, validated JSON IPC, typed failures, signal forwarding, internal lock handoff, emitted-worker resolution, and idempotent cleanup. The CLI must remain a delivery host: it invokes the SDK public worker once with a packaged trusted task and serializable context, renders only parent-owned progress/output, and has no direct Code Graph, lock, IPC, or child-process mechanics. Force must cross the child boundary and retain the SDK's typed-open recovery semantics.

## Implementation Status

| Area                                   | Status | Evidence                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public worker and package isolation    | Pass   | `runIsolatedGraphIndex` resolves its emitted child URL relative to `import.meta.url` in `packages/code-graph/src/composition/run-isolated-graph-index.ts`; `supervisor.ts` uses `node:child_process.fork` with JSON IPC and holds the storage-root lease across the child lifecycle.              |
| IPC, typed terminals, signals, cleanup | Pass   | `supervisor.ts` validates protocol messages, maps task categories to Code Graph errors, forwards only `SIGINT`/`SIGTERM`, and its single finalizer removes its listeners, disconnects IPC, and releases the lease. `isolated-index-worker-child.ts` validates start/input/progress/result values. |
| CLI ownership boundary                 | Pass   | `packages/cli/src/commands/graph/index-graph.ts` imports `runIsolatedGraphIndex` only from `@specd/sdk`, builds the packaged `graph-index-task.js` URL, supplies text-only progress, and formats output only after resolution.                                                                    |
| Child task SDK delegation              | Pass   | `packages/cli/src/graph-index-task.ts` reconstructs configured or explicit bootstrap host context and invokes `runIndexProjectGraph` once; it has no CLI process/lock or direct Code Graph import.                                                                                                |
| Force/recovery behaviour               | Pass   | CLI integration covers repeated forced structured indexes, no left lock, no worker crash output, and forced-only typed corrupted-storage recovery.                                                                                                                                                |

## Discrepancies

### WCG-1 — Medium: invalid public worker input throws synchronously and untyped instead of rejecting with a typed boundary failure

- **Spec:** `code-graph:isolated-index-worker` / “Non-serializable input fails before child task execution” requires the isolated operation to _reject_ with a typed validation or protocol failure. “Typed failure classification” requires public worker failure types to extend `SpecdCodeGraphError` with stable codes.
- **Code:** `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts:72-74` calls `normalizeAbsolutePath`, `normalizeTaskModule`, and `assertGraphIndexJsonValue` before constructing the returned `Promise`. `assertGraphIndexJsonValue` in `json-value.ts:47-51` throws raw `TypeError`; invalid storage root/module selector likewise throws `GraphIndexTaskContractError` synchronously. Thus a caller using the documented Promise contract receives a synchronous exception for non-serializable task input, not `Promise.reject(...)`; and the non-serializable-input path is not a `SpecdCodeGraphError`.
- **Impact:** callers must use both synchronous `try/catch` and promise rejection handling, contrary to the host-facing asynchronous operation and scenario. CLI happens to await inside `try/catch`, so its visible error mapping remains safe, but other hosts can observe the contract mismatch.
- **Recommended repair:** perform boundary normalization/validation inside an async/promise rejection path and convert JSON boundary validation failure to `GraphIndexTaskContractError` or `GraphIndexWorkerProtocolError`; add a public-operation regression test asserting rejection and no fork.

## Test Coverage

Focused verification passed:

- `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/isolated-index-worker`: **4 files, 13 tests passed**.
- `pnpm --filter @specd/cli exec vitest run test/commands/graph-index.spec.ts test/graph-index-task.spec.ts`: **2 files, 8 tests passed**.

Existing coverage substantively exercises worker progress/order, duplicate terminal, clean premature exit, failed initial IPC send without exit, SIGINT/SIGTERM listener scoping, published worker/task loading, invalid task module/result, abnormal post-result exit, force worker cleanup, parent CLI delegation, context descriptors, structured-output progress omission, real publish-shaped CLI forced runs, corrupt-storage force recovery, and busy lock handling.

## Missing Tests

- No public `runIsolatedGraphIndex`/`runIsolatedGraphIndexWithRuntime` test supplies a function, symbol, or cyclic `taskInput` and asserts a **typed asynchronous rejection** plus `fork` not called. Current `protocol.spec.ts` tests the validator only, not the public contract; this gap permits WCG-1.
- No direct test asserts invalid `storageRoot` or `taskModule` selector follows the same asynchronous typed-error contract. It is adjacent to WCG-1 rather than an independent functional discrepancy.

## Dependency Chain

`CLI graph index` → SDK `runIsolatedGraphIndex` re-export → Code Graph public composition → `NodeIsolatedGraphIndexRunner` / supervisor → forked emitted Code Graph child → trusted packaged CLI `graph-index-task.js` → SDK `openSpecdHost` or `createSdkContext` → SDK `runIndexProjectGraph` → prepared Code Graph provider/index use case.

The supervisor's internal environment handoff reaches provider indexing only inside the fork; the CLI task receives no lock token or raw IPC envelope. The CLI's force/exclusion task input crosses this chain unchanged.

## Summary Counts

- **High:** 0
- **Medium:** 1 (WCG-1)
- **Low:** 0
- **Informational/test gaps:** 2 (both tied to WCG-1)

### Store and SQLite audit

# Compliance audit — Code Graph composition, project index, store, and SQLite

## Scope and audit method

- Change mode: `centralize-graph-index-worker`; merged change previews were read for `code-graph:composition`, `code-graph:index-project-graph`, `code-graph:graph-store`, and `code-graph:sqlite-graph-store`, including their merged verification scenarios.
- Direct dependencies considered: `code-graph:graph-store`, `code-graph:indexer`, `code-graph:symbol-model`, `code-graph:staleness-detection`, `code-graph:document-model`, `code-graph:workspace-integration`, and `core:config`. Applicable global requirements were `default:_global/architecture`, `default:_global/error-handling-conventions`, and `default:_global/testing`.
- Graph-first discovery was attempted. `graph stats` says current but reports zero files and symbols, and symbol queries therefore returned no implementation symbols. Source/test inspection was used as the documented fallback. This is a non-scoped audit-tooling observation, not an implementation discrepancy below.

## Requirements Summary

1. **Composition:** a forced `CodeGraphProvider.index()` performs logical clear and full reanalysis, never physical recreation. `recreate()` is a closed-provider physical recovery operation, while parameterless `open()` never recovers implicitly. Public exports expose typed recovery contracts but hide raw locking, worker protocol, concrete stores, and child mechanics.
2. **IndexProjectGraph:** accepts an already-open provider and prepared inputs; forwards force/VCS/progress intent to `provider.index()` and owns no open, close, clear, recreate, lock, process, or recovery operation.
3. **GraphStore:** separates logical `clear()` on a healthy open store from physical, closed-only `recreate()`; supports a typed recoverable-open error only for known corruption/schema incompatibility and leaves partial opens closed.
4. **SQLiteGraphStore:** enforces the same closed-only recreation contract, removes the persistence directory and rotates generation without spawning/reopening a worker, and classifies only known corrupt/non-migratable database failures.

## Implementation Status

All four audited specs are conformant. `CodeGraphProvider.index()` calls `store.clear()` for force; `recreate()` rejects an open provider; `IndexProjectGraph.execute()` only forwards prepared inputs; the GraphStore port remains parameterless-open with separate clear/recreate; SQLite classifies only known recovery conditions and performs closed-only asynchronous reset. The public barrel preserves the curated API boundary. New errors follow the required hierarchy and code conventions.

## Discrepancies

None found.

## Test Coverage

Direct unit and integration coverage verifies force forwarding, logical clearing and generation preservation, closed-only recreation, typed schema/corruption recovery, ordinary-error propagation, SQLite reset lifecycle, and public API hiding. Focal rerun: `index-project-graph.spec.ts`, `code-graph-provider.spec.ts`, and `sqlite-worker-lifecycle.spec.ts` — **3 files / 56 tests passed**.

## Missing Tests

None identified for the audited changed requirements.

## Summary counts

- Specs audited: 4
- Revised requirement/scenario groups assessed: 11
- Conformant: 11
- Discrepancies: 0
- Missing tests: 0
- Non-scoped tooling observations: 1

### SDK audit

# Compliance audit — SDK partial

## Scope and evidence

- Change: `centralize-graph-index-worker`
- Reviewed merged specs: `sdk:run-index-project-graph`, `sdk:with-open-graph-provider`, and `sdk:composition`.
- Reviewed implementation: `packages/sdk/src/orchestration/run-index-project-graph.ts`, `packages/sdk/src/composition/with-open-graph-provider.ts`, `packages/sdk/src/index.ts`, and `packages/sdk/package.json`.
- Reviewed tests: `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`, `packages/sdk/test/composition/with-open-graph-provider.spec.ts`, and `packages/sdk/test/barrel.spec.ts`.

Graph-first lookup resolved the public logical symbols `runIndexProjectGraph` and `withOpenGraphProvider`, including their public bindings. The dependency-impact query by bare symbol name returned `not_found`; direct source/import inspection was used only for that unavailable graph edge.

## Requirements summary

1. SDK indexing obtains configuration/workspaces/VCS inputs, delegates through `IndexProjectGraph`, preserves output fields, and does not acquire CLI locks.
2. Explicit providers are caller-owned and never closed, recreated, or retried by SDK orchestration. Transient providers use the common lifecycle helper.
3. Only a forced transient index may recover a typed `GraphStorageRecoveryRequiredError`: close, recreate, and retry one parameterless open. Other errors and a second failure propagate.
4. The generic provider helper keeps ordered hooks, cleanup/error precedence, and no-process-exit behavior while exposing a single optional recovery callback.
5. SDK publishes the high-level isolated worker contracts but not raw graph-index locks or IPC envelopes, and keeps runtime dependencies limited to Core and Code Graph.

## Implementation status

All five audited requirement groups are compliant. `runIndexProjectGraph` delegates with prepared inputs, leaves explicit providers caller-owned, and installs typed recovery only for `force: true`. The lifecycle helper retains parameterless opening, ordered cleanup, one retry, and no exit side effects. The SDK public barrel is curated and its runtime dependencies are limited to Core and Code Graph.

## Discrepancies

No discrepancies found in this scope.

## Test coverage

Focused verification passed: SDK orchestration, lifecycle helper, and barrel tests — **9 files / 72 tests passed**; SDK typecheck and lint also pass. Tests cover workspace selection, progress, explicit ownership, force decoration, typed recovery, rejection conditions, cleanup ordering, and curated exports.

## Missing tests

No required acceptance scenario is untested. An SDK-level assertion that `afterClose` runs exactly once after successful typed recovery would be a non-blocking strengthening; generic helper tests already cover the recovery order.

## Summary counts

- Requirements reviewed: 5 groups
- Compliant: 5
- Discrepancies: 0
- Required missing tests: 0

## Audit artifacts

- `_partial-worker-cli.md`
- `_partial-store.md`
- `_partial-sdk.md`

## Post-audit implementation correction

WCG-1 was corrected in the same verification session without a lifecycle transition,
as explicitly authorized by the user. Public worker input normalization now runs inside
the returned promise; invalid JSON input rejects with `GraphIndexTaskContractError`
before lock acquisition or forking. A regression test asserts both the typed asynchronous
rejection and that the runtime fork launcher is not called.

Post-fix validation passed:

- `supervisor.spec.ts` and `protocol.spec.ts`: 2 files / 8 tests;
- complete isolated-worker suite plus public barrel: 5 files / 26 tests;
- `@specd/code-graph` lint and typecheck.

### Follow-up review corrections

A subsequent edge-path review identified five additional implementation-only findings,
all corrected in the same verification state:

- a child created without an IPC channel now settles through the common finalizer;
- supervisor-detected protocol failures remain authoritative over the termination exit;
- IPC `send() === false` is treated as backpressure, with delivery decided by callback;
- JSON validation permits repeated references while rejecting active recursion cycles;
- forced storage recovery preserves `SCHEMA_INCOMPATIBLE` or `CORRUPT` as the final
  full-rebuild reason.

Regression validation passed with Code Graph **58 files / 703 tests**, SDK **9 files /
73 tests**, and package lint/typecheck.
