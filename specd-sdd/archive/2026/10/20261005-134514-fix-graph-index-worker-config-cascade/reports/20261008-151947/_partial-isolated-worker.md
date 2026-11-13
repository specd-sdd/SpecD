# Compliance Audit — `code-graph:isolated-index-worker`

Audit scope: merged no-op change view for `code-graph:isolated-index-worker`, its merged verification scenarios, relevant global specifications (`default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, and `default:_global/error-handling-conventions`), and direct dependency `code-graph:sqlite-graph-store`.

The audit was read-only with respect to source code, tests, and specifications. The code graph was current (`stale: false`, complete coverage), and graph queries were used to trace `runIsolatedGraphIndex`, `GRAPH_INDEX_PROTOCOL`, `StartMessage`, protocol validators, the child runtime, supervisor, and their tests.

## Requirements Summary

| #   | Requirement                       | Status    | Evidence                                                                                                                                                                                                                                                                     |
| --- | --------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High-level isolated execution API | Compliant | `runIsolatedGraphIndex` remains a public composition wrapper over the isolated runner; its generic `taskInput` remains validated as `GraphIndexJsonValue`. No worker-facing public API changed in this change.                                                               |
| 2   | Encapsulated index lock ownership | Compliant | `supervisor.ts` still acquires the storage-root lease before `fork`, owns cleanup, and releases through the idempotent `finalize()` path. Startup/send/no-IPC paths remain bounded and tested.                                                                               |
| 3   | Process isolation                 | Compliant | Production runtime still uses `node:child_process.fork`; the CLI change continues to call the public isolated operation and introduces no in-process or worker-thread alternative.                                                                                           |
| 4   | Trusted injected task module      | Compliant | `isolated-index-worker-child.ts` still imports exactly the supplied file URL and invokes `runGraphIndexTask(message.taskInput, sendProgress)`. The CLI task module remains selected programmatically, not by an end-user task-module option.                                 |
| 5   | Validated IPC lifecycle           | Compliant | `GRAPH_INDEX_PROTOCOL` remains `specd.graph-index.v1`; `StartMessage` retains exactly `protocol`, `type`, `taskModuleHref`, and opaque `taskInput`. `isStartMessage` still rejects extra keys and validates only the generic JSON boundary. No IPC DTO or validator changed. |
| 6   | Progress and result neutrality    | Compliant | The worker transports JSON values without rendering. The CLI remains the delivery owner for text/JSON/TOON formatting. The new context descriptor is data inside `taskInput`, not a worker presentation concern.                                                             |
| 7   | Typed failure classification      | Compliant | Existing `SpecdCodeGraphError` subclasses and stable error-code mapping are unchanged. Discovery replay failures occur inside the task and cross the existing task-execution failure envelope without protocol changes.                                                      |
| 8   | Signal forwarding and cleanup     | Compliant | Supervisor handlers and forwarding for `SIGINT`, `SIGTERM`, and `SIGBREAK` are unchanged; focused signal tests pass.                                                                                                                                                         |
| 9   | Index lease release on exit       | Compliant | Exit and Windows `SIGBREAK` lease release paths remain present and tested. This is consistent with the SQLite dependency's persistence/lease boundary.                                                                                                                       |
| 10  | Internal lock handoff             | Compliant | The supervisor still injects only the code-graph-owned lease environment derived from `storageRoot`. The descriptor contains no lock path/token/callback and cannot disable locking for another process or root.                                                             |
| 11  | Published ESM worker entrypoint   | Compliant | Package build/exports and worker resolution are untouched. Published-output integration tests pass, including clean forced reindex and native teardown fixtures.                                                                                                             |
| 12  | Resource cleanup                  | Compliant | Listener removal, IPC disconnection, child-reference clearing, and lease release remain centralized and idempotent. Competing terminal-event tests pass.                                                                                                                     |

All 12 requirements remain conformant. The merged change is intentionally a no-op for this spec: the configuration-cascade fix changes the content of the CLI-owned JSON task payload, not the isolated worker capability.

## Implementation Status

### Unchanged code-graph boundary

`git diff` shows no source or test changes under `packages/code-graph/` for this change. The relevant production path remains:

1. `packages/cli/src/commands/graph/index-graph.ts` builds a `CliGraphIndexTaskInput`.
2. `runIsolatedGraphIndex` receives it through the generic `taskInput` field.
3. `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts` validates the complete input with `assertGraphIndexJsonValue` and places it unchanged in `StartMessage.taskInput`.
4. `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts` validates the exact envelope and treats `taskInput` as opaque `GraphIndexJsonValue`.
5. `packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts` passes `message.taskInput` unchanged to the injected task.
6. `packages/cli/src/graph-index-task.ts` interprets only the CLI-owned descriptor and reconstructs the appropriate host context.

### New descriptor remains JSON-opaque

The descriptor variants are plain JSON objects containing only string discriminants and absolute path strings:

- `{ mode: 'forced', configPath }`
- `{ mode: 'discovered', startDir }`
- `{ mode: 'bootstrap', projectRoot, vcsRoot }`

They introduce no `URL`, callback, class instance, `undefined`, symbol, cyclic reference, or lock capability. The enclosing `index` object likewise contains booleans and optional string arrays. Consequently the payload satisfies `GraphIndexJsonValue` without widening the IPC protocol.

The worker remains deliberately unaware of `mode`, `configPath`, `startDir`, `projectRoot`, and `vcsRoot`. This is the correct layering: CLI owns task semantics; code-graph owns only trusted task execution and validated JSON transport.

### Global-spec conformance

- **Architecture:** CLI continues to consume the curated SDK surface, while code-graph composition owns infrastructure construction. No forbidden CLI-to-code-graph infrastructure import or package cycle was introduced.
- **Conventions:** the descriptor is a strict discriminated union with readonly fields, named exports, explicit types, and no `any`.
- **Testing:** focused Vitest tests use explicit assertions rather than snapshots. No new filesystem fixture was added to this isolated-worker scope.
- **Error handling:** existing worker failures remain typed `SpecdCodeGraphError` subclasses with stable upper-snake-case codes. The change does not make hosts parse stderr or message text at the worker boundary.

### Direct dependency conformance: `code-graph:sqlite-graph-store`

The direct dependency matters only for persistence and lease ownership. The new descriptor does not enter the SQLite worker protocol and does not change the SQLite storage path, WAL/SHM placement, transaction model, schema, or graph-store lifecycle. `storageRoot` is still resolved in the parent from the already-opened context and remains the supervisor's lease identity. The child receives the pre-existing internal environment handoff for that same storage root. No conflict with the SQLite graph-store specification was found.

## Discrepancies

### No specification or implementation discrepancy found

No requirement-level mismatch was identified in this audit.

Evidence:

- The change delta for `code-graph:isolated-index-worker` is explicitly no-op.
- No code-graph production or test file changed.
- The versioned protocol identifier, envelope fields, exact-key validation, generic JSON validation, supervisor lifecycle, and child invocation are unchanged.
- Both new CLI descriptor shapes are valid JSON and are nested only under the existing opaque `taskInput` field.
- All focused worker and CLI tests pass.

If product intent were instead that code-graph understand configuration-resolution modes, the current implementation would be incomplete and the worker spec would need a new requirement. The available design and merged specs explicitly place reconstruction in the injected CLI task, so there is no evidence for that alternative interpretation.

## Test Coverage

### Executed during this audit

Command groups:

- `pnpm --filter @specd/code-graph exec vitest run` for the four isolated-worker suites.
- `pnpm --filter @specd/cli exec vitest run` for `graph-index.spec.ts` and `graph-index-task.spec.ts`.

Results:

- Isolated worker: **4 files passed, 23 tests passed**.
- CLI handoff/task: **2 files passed, 12 tests passed**.
- Aggregate focused result: **6 files passed, 35 tests passed, 0 failed**.

Coverage evidence includes:

- strict JSON acceptance/rejection and exact protocol-envelope validation;
- unchanged progress/result transport and ordering;
- malformed and duplicate terminal message handling;
- non-serializable input rejection before fork;
- bounded startup/send/no-IPC failures and exact-once lease cleanup;
- signal and process-exit lease release;
- publish-shaped ESM worker execution, backpressure, abnormal exit, forced reindex, and native teardown;
- forced, discovered, and bootstrap CLI descriptors;
- discovered replay failure propagation without bootstrap substitution;
- exactly one graph-index invocation per reconstructed task context.

## Missing Tests

### Low — no real-fork fixture carries each new CLI descriptor variant

There is no focused integration test that launches the real published worker with the exact `CliGraphIndexTaskInput` variants and asserts byte-for-semantic-value delivery to `runGraphIndexTask` for `forced`, `discovered`, and `bootstrap`.

Why this is not a compliance failure:

- `protocol.spec.ts` verifies arbitrary nested JSON task input and exact envelope validation.
- `dist.spec.ts` verifies real fork transport with JSON task payloads through publish-shaped output.
- CLI command tests verify construction of each descriptor.
- CLI task tests verify interpretation of each descriptor.
- The worker intentionally treats task input as opaque, so descriptor-specific protocol behavior would duplicate layer-specific tests.

Possible improvements:

- **Code/test option:** add one publish-shaped CLI integration fixture that round-trips a `discovered` descriptor through the real worker and observes the task result. This would primarily guard packaging/integration composition, not protocol logic.
- **Spec option:** no spec change is warranted unless the product wants descriptor-specific behavior to become part of the code-graph worker contract. Doing so would weaken the current generic injected-task abstraction and is not recommended.

Severity: **LOW / coverage hardening only**.

## Spec Dependency Chain

```text
default:_global/architecture
default:_global/conventions
default:_global/testing
default:_global/error-handling-conventions
                  │
                  ▼
code-graph:sqlite-graph-store
  (persistence root and index-lease lifecycle)
                  │
                  ▼
code-graph:isolated-index-worker
  (generic fork + lock + validated opaque JSON task transport)
                  │
                  ▼
CLI packaged graph-index task
  (interprets forced/discovered/bootstrap descriptor)
```

The dependency direction is coherent. The worker owns isolation and locking; the injected CLI task owns configuration reconstruction. The cascade fix does not leak CLI semantics into code-graph or SQLite protocols.

## Summary Counts

| Category                                   | Count |
| ------------------------------------------ | ----: |
| Requirements audited                       |    12 |
| Requirements compliant                     |    12 |
| Requirements partially compliant           |     0 |
| Requirements non-compliant                 |     0 |
| Specification/implementation discrepancies |     0 |
| High/critical findings                     |     0 |
| Medium findings                            |     0 |
| Low findings                               |     1 |
| Missing-test recommendations               |     1 |
| Focused test files passed                  |     6 |
| Focused tests passed                       |    35 |
| Focused tests failed                       |     0 |

**Overall result: COMPLIANT.** The change preserves the isolated worker and SQLite contracts. The new CLI resolution descriptor remains an opaque, runtime-validated JSON payload under the existing version-1 IPC envelope; no protocol revision or code-graph spec delta is required.
