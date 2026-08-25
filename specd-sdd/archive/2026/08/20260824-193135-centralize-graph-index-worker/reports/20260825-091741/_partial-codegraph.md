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
