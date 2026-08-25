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
