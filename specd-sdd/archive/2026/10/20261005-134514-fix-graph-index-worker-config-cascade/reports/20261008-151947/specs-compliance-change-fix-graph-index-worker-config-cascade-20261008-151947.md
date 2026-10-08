# Specs compliance report — fix-graph-index-worker-config-cascade

- Mode: change
- Generated: 2026-10-08 15:19:47 Europe/Madrid
- Overall result: COMPLIANT
- Change specs audited: 3
- Requirements audited: 36
- Scenarios assessed: 95
- Blocking discrepancies: 0
- HIGH findings: 0
- MEDIUM findings: 0
- LOW findings: 2 coverage-hardening observations describing the same durable cross-layer E2E gap
- INFO observations: 2
- Verification evidence: CLI 16/16, Core 131/131, isolated worker 23/23; prior implementation hooks also passed monorepo tests, lint, and typecheck

## Executive conclusion

The implementation conforms to the merged change specs and to the applicable global and direct-dependency contracts. The forced/discovered/bootstrap split preserves Core loader semantics without widening the isolated-worker or SQLite protocols. The only actionable audit recommendation is non-blocking: retain the disposable real-filesystem/real-worker cascade check as a durable automated integration test.

## Detailed Findings

# Compliance audit — `cli:graph-index`

## Requirements Summary

The merged `cli:graph-index` specification contains 7 requirements and 29 verification scenarios. This change modifies only **Indexing behaviour**; the other six requirements remain compatibility constraints.

| Requirement                         | Status                | Evidence                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature                   | Compliant             | `registerGraphIndex` retains `--force`, repeatable `--exclude-path`, mutually exclusive `--config`/`--path`, and text default. Existing validation remains before worker invocation.                                                            |
| Indexing behaviour                  | Compliant             | Parent emits explicit `forced`, `discovered`, or `bootstrap` descriptors; child dispatches them to exact-file loading, start-directory discovery, or explicit bootstrap respectively; indexing is invoked once after successful reconstruction. |
| Output format                       | Compliant / unchanged | Result formatting and structured passthrough were not changed. CLI suite passes.                                                                                                                                                                |
| Forced indexing result completeness | Compliant / unchanged | `force`, exclusions, result fields, progress, and diagnostics remain passthrough values; no result inference was added.                                                                                                                         |
| Error cases                         | Compliant             | Mutual-exclusion remains exit 1; worker/task failures remain exit 3; discovered reconstruction rejection is propagated without bootstrap fallback.                                                                                              |
| CLI reference documentation         | Compliant / unchanged | `docs/cli/cli-reference.md` contains the `graph` section, all subcommands, flags, configured/bootstrap model, graph filtering fields, defaults, replacement semantics, and negation example.                                                    |
| Visible incompatibility repair      | Compliant / unchanged | Repair remains SDK/provider-owned and no backend deletion or repair logic was introduced in CLI.                                                                                                                                                |

## Implementation Status

### Parent command

`packages/cli/src/commands/graph/index-graph.ts` complies with the merged requirement:

- Captures `process.cwd()` before asynchronous resolution (`discoveryStartDir`).
- Preserves explicit `--config` as `{ mode: 'forced', configPath: context.configFilePath }`.
- Preserves automatic discovery as `{ mode: 'discovered', startDir: discoveryStartDir }`.
- Preserves bootstrap roots for `--path` and no-config fallback.
- Keeps `storageRoot` from the parent's effective config, preserving lock/storage identity.
- Calls `runIsolatedGraphIndex` once through `@specd/sdk`; no lock, fork, IPC, or direct `@specd/code-graph` ownership was introduced.
- Keeps force, exclusions, progress selection, result rendering, and error exits unchanged.

### Packaged child task

`packages/cli/src/graph-index-task.ts` complies with the merged requirement:

- `CliGraphIndexContextDescriptor` is a JSON-safe discriminated union with exact required fields.
- Forced mode calls `openSpecdHost({ configPath, options: { kernel } })`.
- Discovered mode calls `openSpecdHost({ startDir, options: { kernel } })` and supplies no bootstrap fallback.
- Bootstrap mode retains `createBootstrapGraphConfig` plus `createSdkContext`.
- `runIndexProjectGraph` remains one shared post-reconstruction invocation, so a failed discovery cannot index or silently bootstrap.
- Force, optional exclusion paths, progress, and the SDK result cross the task boundary unchanged.

### Architecture and blast radius

- CLI continues to import platform capabilities only from `@specd/sdk`, consistent with `default:_global/architecture`.
- `packages/cli/package.json` has `@specd/sdk` and no runtime dependency on `@specd/core` or `@specd/code-graph`.
- No business logic or infrastructure adapter was moved into CLI; the command selects a serializable delivery descriptor and delegates loading/orchestration.
- Implementation tracking resolves all declared symbols and has no open or out-of-scope files.
- Fresh graph impact for the two production files is **MEDIUM**. `graph-index-task.ts` reaches 7 files and 5 covering specs through program registration/tests. The implementation avoids the shared `GraphCliContext`/resolver mutation that the design identified as CRITICAL.
- Spec-dependent impact for `cli:graph-index` is LOW with no downstream dependent spec, so no additional spec delta is indicated.

## Discrepancies

### LOW — no durable CLI-to-loader integration test materializes the local cascade

**Evidence:**

- `packages/cli/test/commands/graph-index.spec.ts` mocks `resolveGraphCliContext` and `runIsolatedGraphIndex`; it proves that automatic discovery serializes the captured absolute start directory.
- `packages/cli/test/graph-index-task.spec.ts` mocks `openSpecdHost`; it proves that the child passes `startDir`, and separately proves rejection propagation with no bootstrap substitution.
- `packages/sdk/test/composition/host-context.spec.ts` proves that `openSpecdHost({ startDir })` selects discovery and `openSpecdHost({ configPath })` selects forced loading.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts` covers local-file discovery/cascade and forced-mode behavior.
- Task 6.3 records a disposable built-CLI check, but that fixture/result is not retained as an automated regression test.

**Impact:** This is not an observed code/spec mismatch. The implementation composes already-tested contracts correctly, and the full CLI suite passes. However, the strongest new scenario says that the child observes the same local cascade values as the parent; current committed CLI tests prove that transitively rather than in one cross-layer test. A future regression in integration wiring could require multiple suites to expose.

**Code/test resolution:** Add a durable integration test using a temporary repository containing `specd.yaml`, an extending `specd.local.yaml`, and distinguishable graph exclusions. Exercise the packaged task or built CLI once without `--config` and once with explicit `--config`, asserting the discovered/forced difference.

**Spec resolution:** If cross-layer observation is intentionally considered satisfied by contract composition, clarify the verification scenario to state that descriptor routing plus `sdk:host-context`/`core:config-loader` dependency scenarios are acceptable evidence. Weakening or removing the behavior itself is not recommended because it is the defect being fixed.

No HIGH, MEDIUM, or correctness discrepancies were found.

## Test Coverage

### Change-specific scenarios

| Scenario                                        | Coverage                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Command delegates once with explicit descriptor | Direct command test; exact worker call asserted.                                                                                  |
| CLI owns no lock/subprocess mechanics           | Source/package boundary assertion plus import inspection.                                                                         |
| Explicit config remains forced                  | Parent descriptor test + child exact `configPath` call test + SDK/Core dependency tests.                                          |
| Automatic discovery replays local cascade       | Parent captured-CWD descriptor test + child exact `startDir` call test + SDK/Core discovery tests; cross-layer proof is indirect. |
| Discovery replay does not bootstrap             | Direct child rejection test and command exit-3 mapping test.                                                                      |
| Packaged task indexes exactly once              | Direct forced/discovered tests assert one invocation; bootstrap test asserts the shared call and forwarding.                      |
| Bootstrap remains explicit                      | Direct command and task tests assert roots and absence of discovery.                                                              |
| Index options unchanged                         | Direct command/task assertions cover `force` and exclusion paths.                                                                 |
| Text progress / structured silence              | Existing command test asserts callback behavior and rendered progress.                                                            |
| Production isolation / SDK boundary             | Source/package assertions and imports.                                                                                            |

### Executed evidence

- `pnpm --filter @specd/cli test -- test/commands/graph-index.spec.ts test/graph-index-task.spec.ts` completed successfully. Because of the package script's Vitest invocation semantics, it ran the full CLI suite: **87 files, 1103 tests, all passed**.
- `changes implementation review` reports a fresh graph with complete coverage; four changed files are resolved and all symbol links are valid.

## Missing Tests

1. **Recommended, LOW priority:** committed cross-layer integration test for real local cascade replay versus explicit forced loading.
2. **Optional hardening:** assert `discoveryStartDir` remains the captured value if `process.cwd()` is changed after context resolution starts. The implementation captures before `await`, so current code is correct; this would protect the stated TOCTOU-of-CWD design decision.
3. **Optional hardening:** runtime serialization validation of each descriptor shape through the real isolated-worker protocol. The shapes contain strings/booleans/arrays only and the generic worker already tests JSON validation, so this is not a current gap in correctness.

## Spec Dependency Chain

```text
cli:graph-index
├─ cli:entrypoint
│  └─ defines --config exact-file semantics, exit codes, and output conventions
├─ sdk:host-context
│  └─ maps configPath -> forced loader and startDir -> discovery loader
├─ core:config-loader
│  ├─ startDir -> filename discovery + active cascade/local layers
│  └─ configPath -> explicit chain only, without discovered sibling layers
├─ core:config
│  └─ defines cascade identity, local overrides, and graph configuration
├─ code-graph:isolated-index-worker
│  └─ transports opaque JSON task input and owns process/lock/IPC lifecycle
├─ sdk:run-index-project-graph
│  └─ owns provider/index orchestration and repair
└─ default:_global/architecture
   └─ requires CLI delivery through SDK and forbids direct code-graph dependency
```

Consistency result: the new forced/discovered split is the missing adapter-level provenance needed to preserve both `cli:entrypoint` exact-file semantics and `core:config-loader` discovery semantics across the isolated process boundary. It does not alter either dependency contract and introduces no package-cycle or ownership conflict.

## Summary counts

| Category                       |                       Count |
| ------------------------------ | --------------------------: |
| Requirements reviewed          |                           7 |
| Merged scenarios reviewed      |                          29 |
| Production files changed       |                           2 |
| Test files changed             |                           2 |
| Tests executed                 |      1103 passed / 0 failed |
| HIGH discrepancies             |                           0 |
| MEDIUM discrepancies           |                           0 |
| LOW discrepancies              | 1 (test-evidence hardening) |
| Confirmed code/spec mismatches |                           0 |
| Missing recommended tests      |                           1 |
| Optional hardening tests       |                           2 |

**Audit conclusion:** `cli:graph-index` is compliant with the merged specification and its direct/global dependency contracts. The implementation is suitable to proceed. The only finding is a low-severity durability gap in cross-layer automated evidence; it does not block verification or transition.

---

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

---

# Compliance audit — `core:config-loader`

## Requirements Summary

The merged artifacts for `core:config-loader` are unchanged by this change (`op: no-op`). The authoritative merged spec contains 17 requirements and the merged verification artifact contains 66 scenarios. This audit therefore checks two things: that the existing loader contract remains implemented, and that the new isolated graph-index handoff selects the correct existing loader mode.

The requirements group into these contracts:

1. `createDefaultConfigLoader` accepts exactly the discovery form `{ startDir }` or forced form `{ configPath }`, resolves the VCS boundary, and returns the `ConfigLoader` port.
2. Discovery walks from `startDir` up to the VCS root (or checks only `startDir` without a VCS), orders all discoverable candidates, constructs the active cascade, includes extending local layers, and fails with `ConfigValidationError` when no config is found.
3. Forced mode resolves an exact entrypoint plus only its declared `extends` chain; filename-discovered sibling layers are not appended.
4. `resolvePath()` preserves the distinction: discovery returns the active chain root or `null`; forced returns the absolute requested path without an existence check; it does not throw.
5. Active layers obey scalar/object/array merge and deterministic removal rules, with standalone layers resetting prior state.
6. Parsing, environment precedence, path resolution, containment, workspace defaults/external inference, pattern validation, plugin/context mapping, approvals defaults, and error typing remain loader invariants.
7. The config-loading boundary remains architectural: the public composition factory returns a port, YAML validation stays in infrastructure, and the CLI reaches it through `@specd/sdk`.

For this change, the critical cross-spec obligations are:

- implicit `graph index` discovery must transport the original parent `startDir` and call `openSpecdHost({ startDir })` in the child, so `specd.local.yaml` and `specd.local.*.yaml` can attach normally;
- explicit `--config` must transport the resolved `configPath` and call `openSpecdHost({ configPath })`, retaining closed-chain forced semantics;
- discovery replay failure must propagate and must not become bootstrap.

## Implementation Status

### Loader and cascade implementation

**PASS — factory mode and VCS boundary.** `packages/core/src/composition/config-loader.ts:15-31` derives `probeDir` from `startDir` or `configPath`, resolves the VCS adapter once, normalizes `NullVcsAdapter` to `rootPath = null`, and constructs `FsConfigLoader(rootPath, options)`. The public factory returns `Promise<ConfigLoader>`. This matches `core:composition`, `core:vcs-adapter`, and the global architecture rule that hosts use composition factories rather than constructing infrastructure adapters.

**PASS — discriminated mode selection.** `packages/core/src/infrastructure/fs/config-loader.ts:52` defines `FsConfigLoaderOptions` as `{ startDir: string } | { configPath: string }`. `FsConfigLoader._resolveCascade()` dispatches `configPath` to `resolveForcedCascade()` and `startDir` to `findCandidateDirectory()` plus discovery/active-chain resolution.

**PASS — discovery and local cascade.** `packages/core/src/infrastructure/fs/config-cascade.ts` implements the specified candidate order (`specd.yaml`, named shared variants, `specd.local.yaml`, named local variants), VCS-bounded directory search, parsing, and `resolveActiveChain()`. A local layer with `extends: true` attaches to the prior active layer; a standalone local layer resets the chain; an explicit-base variant attaches only when its base is active. `FsConfigLoader._resolveCascade()` parses every discovered candidate and merges the resolved active chain, so local layers are not reduced to a single selected filename.

**PASS — no-config failure.** If discovery cannot find a candidate directory, `FsConfigLoader._resolveCascade()` throws `ConfigValidationError` with `no specd.yaml found (searched up to VCS root)`. Outside a VCS, `findCandidateDirectory()` checks only `startDir`. The isolated task does not set `allowBootstrapFallback`, so this failure is not converted into bootstrap.

**PASS — forced closed chain.** `resolveForcedCascade()` resolves the entry path absolutely and follows only explicit `extends` or the previous sorted candidate for `extends: true`. It never performs forward sibling discovery. Missing entries/targets, an impossible previous candidate, and cycles become `ConfigValidationError` paths.

**PASS — path probing.** `FsConfigLoader.resolvePath()` returns `path.resolve(configPath)` directly in forced mode. Discovery uses the same candidate-directory and active-chain machinery and returns `cascade.rootPath`; all discovery probe failures are caught and returned as `null`.

**PASS — remaining loader invariants.** The reviewed loader/cascade implementation validates each YAML layer before constructing the final config, applies merge/removal semantics, loads `.env` and `.env.local`, applies supported environment overrides before final Zod validation, resolves configured paths relative to the active root config directory, enforces repository containment where applicable, applies workspace defaults and external inference, validates context patterns, retains mapped schema/plugin/context fields, defaults approvals, and wraps validation/cascade failures as `ConfigValidationError`. These paths are exercised by the existing focused Core suite.

### Use by the changed graph-index flow

**PASS — parent preserves discovery intent.** `packages/cli/src/commands/graph/index-graph.ts:73-104` captures `process.cwd()` before asynchronous context resolution. A configured context without `--config` becomes `{ mode: 'discovered', startDir: discoveryStartDir }`; it is no longer degraded to a root `configFilePath`.

**PASS — explicit config preserves forced intent.** In the same branch, presence of `opts.config` produces `{ mode: 'forced', configPath: context.configFilePath }` after the existing non-null guard. The descriptor uses the already-resolved path, while Core still applies exact-file semantics.

**PASS — child chooses the matching SDK/Core mode.** `packages/cli/src/graph-index-task.ts:69-92` maps `forced` to `openSpecdHost({ configPath })`, maps `discovered` to `openSpecdHost({ startDir })`, and leaves bootstrap on `createBootstrapGraphConfig()`/`createSdkContext()`. `packages/sdk/src/composition/host-context.ts:100-125` rejects simultaneous `configPath` and `startDir`, passes the selected form to `createDefaultConfigLoader`, and only permits bootstrap fallback when explicitly requested. The graph task does not request it.

**PASS — architecture and scope.** The CLI imports these capabilities only through `@specd/sdk`; Core files are unchanged; the generic isolated-worker and SQLite-worker boundaries are untouched. The Git diff for the audited surface contains only the two intended CLI production files and their two tests.

## Discrepancies

### No blocking spec/code discrepancies

No HIGH, MEDIUM, or LOW correctness discrepancy was found between the merged `core:config-loader` requirements and the implementation used by this change. The no-op delta is appropriate: the defect was a loss of loading mode at the CLI-to-child handoff, not missing loader behavior.

### INFO — no committed real-filesystem cross-boundary regression test

**Evidence:** `packages/cli/test/commands/graph-index.spec.ts` verifies the parent descriptor while mocking `runIsolatedGraphIndex`; `packages/cli/test/graph-index-task.spec.ts` verifies child dispatch while mocking `openSpecdHost`. Core separately tests discovery, cascade, forced mode, and missing-config behavior. Task 6.3 records a disposable-repository E2E check, but that fixture is not a durable automated test in the repository.

**Impact:** This does not make the implementation non-compliant: the constituent contracts and handoff branches are automated, the focused suites pass, and the change's prescribed manual E2E was completed. It leaves a small regression-detection seam between parent descriptor construction, real IPC/task execution, SDK host reconstruction, and real Core cascade loading.

**Code possibility:** add one integration test using a temporary git repository, a base config, an extending local config, and the packaged isolated task, asserting that discovery observes the local layer while explicit `--config` does not. This would be defense in depth and is not required to correct current code.

**Spec possibility:** none required. The merged `cli:graph-index` verification scenarios already express the behavior; if the project wants to mandate a real-process/filesystem test level, that belongs in a test-strategy/global-testing requirement rather than changing config-loader semantics.

### INFO — graph freshness signal was not perfectly uniform

`project status --context --graph` reported `stale: false` but `fingerprintMismatch: true`; `changes implementation list` independently reported a fresh graph with complete coverage and all tracked symbols resolved. This is an evidence-quality observation, not a detected implementation discrepancy. Direct source inspection, merged artifacts, diffs, and executable tests were used to avoid relying solely on graph freshness metadata.

## Test Coverage

### Executed in this audit

- Core focused suites:
  - `packages/core/test/infrastructure/fs/config-loader.spec.ts`
  - `packages/core/test/infrastructure/fs/config-loader-root-containment.spec.ts`
  - Result: **2 files passed, 131 tests passed**.
- CLI handoff suites:
  - `packages/cli/test/commands/graph-index.spec.ts`
  - `packages/cli/test/graph-index-task.spec.ts`
  - Result: **2 files passed, 12 tests passed**.

### Scenario coverage assessment

- Factory/port shape and mode discrimination: covered by composition/loader code and Core/SDK tests.
- `startDir` discovery from selected and ancestor directories: covered by Core loader tests.
- Candidate ordering, extending local layers, standalone reset, inactive explicit bases: covered by Core cascade tests.
- No VCS and no config failure paths: covered by Core tests; child propagation/no-bootstrap is covered by the new CLI task test.
- Forced exact entrypoint, relative paths, `extends: true`, explicit extends, missing target, and circular chain: covered by Core tests.
- Root probing with later local attachments: covered by Core `resolvePath` tests.
- Merge/removal semantics, env precedence, validation, defaults, containment, external inference, pattern validation, mappings, and error type: covered across the 131 passing focused Core tests.
- Parent discovery descriptor, forced descriptor, original CWD capture, error routing, bootstrap preservation, and child dispatch: covered by the 12 passing CLI tests.
- Real disposable-repository distinction between discovery and explicit forced behavior: recorded as completed by task 6.3/manual E2E, but not persisted as an automated test artifact.

## Missing Tests

No test is missing at a level that blocks compliance. Recommended additional coverage:

1. **Integration/E2E (recommended, non-blocking):** run the actual isolated packaged task against a temporary git repository containing `specd.yaml` and `specd.local.yaml` with `extends: true`; assert a configuration-derived graph inclusion/exclusion difference between implicit discovery and explicit `--config`.
2. **TOCTOU real-boundary test (optional):** remove/invalidates the discovered config after parent resolution and before child reconstruction, then assert worker exit code 3 and absence of bootstrap indexing without mocking `openSpecdHost`.
3. **Relative explicit path through the full CLI (optional):** verify that a relative `--config` is transported as the resolved absolute `configFilePath` and still excludes later sibling locals.

These suggestions strengthen cross-layer regression detection; they do not indicate an unmet merged scenario because the relevant behaviors are already covered separately and the implementation paths are direct.

## Spec Dependency Chain

The effective dependency chain reviewed is:

```text
cli:graph-index
  -> sdk:host-context
     -> core:config-loader
        -> core:config
        -> core:composition
        -> core:schema-merge
        -> core:vcs-adapter-port
        -> core:vcs-adapter
        -> default:_global/architecture
  -> code-graph:isolated-index-worker (opaque JSON transport only)
```

- `core:config` confirms the semantic distinction between discovery-root mode and explicit `--config`, candidate ordering, local cascade behavior, forced closed chains, startup failures, and config field semantics.
- `core:composition` confirms that `createDefaultConfigLoader` is the host-facing factory, resolves VCS-derived root data, and returns the port rather than exposing the concrete adapter publicly.
- `core:vcs-adapter` confirms normalized roots and `NullVcsAdapter` behavior used to determine discovery bounds.
- `default:_global/architecture` confirms YAML validation at the infrastructure boundary and CLI access through SDK/composition rather than concrete Core infrastructure.
- `core:schema-merge` is relevant to `schemaOverrides` preservation but is not altered by the handoff fix.
- `code-graph:isolated-index-worker` does not interpret configuration; it transports the JSON-safe descriptor. Therefore no change to its protocol or SQLite storage worker is necessary.

The dependency chain supports the chosen design: carrying `{ startDir }` replays the existing discovery contract, while carrying `{ configPath }` replays the existing forced contract. Serializing a merged `SpecdConfig` or changing Core forced semantics would have expanded or contradicted these dependencies.

## Summary counts

| Category                               | Count | Result                             |
| -------------------------------------- | ----: | ---------------------------------- |
| Merged requirements audited            |    17 | 17 compliant                       |
| Merged verification scenarios assessed |    66 | 66 satisfied by code/test evidence |
| Focused test files executed            |     4 | 4 passed                           |
| Focused tests executed                 |   143 | 143 passed                         |
| Blocking discrepancies                 |     0 | none                               |
| HIGH discrepancies                     |     0 | none                               |
| MEDIUM discrepancies                   |     0 | none                               |
| LOW discrepancies                      |     0 | none                               |
| INFO observations                      |     2 | non-blocking                       |
| Recommended missing integration tests  |     1 | defense in depth                   |
| Optional additional boundary tests     |     2 | defense in depth                   |

**Verdict:** `core:config-loader` is compliant for this change. Its no-op spec/verification deltas are justified, the discovery/forced contracts are correctly reused by the new worker handoff, and no loader or dependency-contract change is required.
