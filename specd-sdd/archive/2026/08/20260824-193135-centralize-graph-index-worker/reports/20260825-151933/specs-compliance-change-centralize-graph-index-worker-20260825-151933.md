# Specs compliance audit — centralize-graph-index-worker

- Mode: Full verification compliance audit
- Change state when audited: designing (returned from verification because artifact review is required)
- Scope: 9 change specs, relevant direct dependencies, and global directives
- Repository checks: verification pre-hooks passed (tests, lint, typecheck); production `graph index --force --format json` exited 0 with no index errors.

## Executive summary

| Severity | ID    | Classification               | Summary                                                                                                                                        |
| -------- | ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium   | SDK-1 | Implementation/spec boundary | `runIndexProjectGraph` calls `provider.index()` directly although its merged contract requires delegation through `createIndexProjectGraph()`. |
| Medium   | S-1   | Artifact drift               | An inherited SQLite scenario implies ordinary indexing rebuilds after an open failure, conflicting with the force-only SDK recovery contract.  |
| Low      | S-2   | Artifact ambiguity           | A generic GraphStore scenario says recreated storage is “ready for fresh indexing” without saying it must first be explicitly opened.          |
| Low      | D-3   | Tooling health               | Graph stats reports current/complete coverage while exposing only one indexed file and three symbols; impact analysis is unreliable.           |

No worker, CLI, SQLite, or SDK lifecycle defect other than SDK-1 was confirmed. Focused SDK tests passed (72 tests); verification hooks passed global tests, lint, and typecheck.

## Recommended next action

Use `/specd-design centralize-graph-index-worker` first to resolve S-1 and S-2. Decide SDK-1 explicitly: either implement delegation through `createIndexProjectGraph()` and add its seam test, or revise the coupled specs if direct `provider.index()` is the intended architecture. The evidence favors implementation because it preserves the stated Code Graph application boundary.

## Detailed findings (verbatim partial reports)

# Compliance audit partial — worker/public composition/SDK/CLI

Change: `centralize-graph-index-worker`  
Scope: `code-graph:isolated-index-worker`, `code-graph:composition`,
`sdk:composition`, and `cli:graph-index` (including their direct boundaries).

## Evidence reviewed

- Merged change previews for the four owned specs and their verification scenarios.
- Public/composition code: `run-isolated-graph-index.ts`, the isolated-worker
  supervisor and protocol tests, `sdk/src/index.ts`,
  `sdk/src/orchestration/run-index-project-graph.ts`,
  `cli/src/commands/graph/index-graph.ts`, and `cli/src/graph-index-task.ts`.
- Package boundaries: CLI and SDK `package.json`, code-graph public exports, and
  `docs/cli/cli-reference.md`.
- Graph status: reports `current`, but only `fileCount: 1` / `symbolCount: 3` for
  1,106 indexed source files. Symbol/impact evidence is therefore unusable; this
  audit used the permitted direct-file fallback.
- Test command executed: `pnpm --filter @specd/cli test -- graph-index.spec.ts
graph-index-integration.spec.ts graph-index-task.spec.ts` — 81 files / 869 tests
  passed. The command then began the code-graph worker subset; its final result was
  not observable from this isolated audit invocation, so it is not counted as fresh
  passing evidence here.

## Requirement-to-implementation assessment

| Area                                                         | Status             | Evidence                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High-level worker API, no host `exit`/formatting             | Pass               | `runIsolatedGraphIndex` is a public code-graph façade; the CLI alone owns formatting and exit status.                                                                                      |
| Lock ownership, fork, validated protocol, signal/IPC cleanup | Pass (test-backed) | Supervisor encapsulates these internals; worker tests cover progress, duplicate terminals, clean premature exit, and failed initial send.                                                  |
| Published ESM worker and trusted built task                  | Pass               | Module-relative child URL; code-graph build emits child; `dist.spec.ts` verifies built tasks and clean forced repeats.                                                                     |
| Code-graph curated public surface                            | Pass               | Public barrels expose only high-level worker contracts; raw locks/protocol/child adapter remain internal.                                                                                  |
| SDK curated worker surface and layering                      | Pass               | SDK root re-exports the host-facing types/errors and no raw lock/IPC; package stays dependent on core/code-graph only. Narrow `domain/` and private `shared/` conform to merged scenarios. |
| CLI-to-SDK-only boundary                                     | Pass               | CLI imports `runIsolatedGraphIndex` from SDK, carries a serializable descriptor, and has no `@specd/code-graph` dependency.                                                                |
| CLI child task reconstruction                                | Pass               | `graph-index-task.ts` explicitly reconstructs configured/bootstrap SDK context and calls `runIndexProjectGraph` once.                                                                      |
| Force/recovery behavior through packaged child               | Pass               | Integration tests exercise repeated force, no lock residue, forced corrupt-store recovery, and non-force preservation.                                                                     |
| CLI format/progress neutrality                               | Pass               | Text parent renders progress; JSON/TOON omit callback. Integration tests parse one structured final result with no IPC/progress contamination.                                             |
| CLI reference repair explanation                             | Pass               | `docs/cli/cli-reference.md` documents logical `--force`, typed one-shot recovery, non-force preservation, and no native crash hang.                                                        |

## Discrepancies and risks

### D-1 — Workflow artifact review is currently required (blocker, not an implementation defect)

Fresh `changes status` reports state `designing`, every change artifact as
`pending-review`, and blocker `REVIEW_REQUIRED`. This is a lifecycle gate and makes a
verification-to-done transition invalid until the modified artifacts are semantically
reviewed/revalidated. It appears consistent with recent in-flight edits; it is not
evidence that the worker implementation violates a requirement.

### D-2 — No independently observed final result for this audit's code-graph worker subset (coverage gap)

The CLI focused suite completed successfully. The subsequent code-graph worker subset
was started by the combined command but the executor returned before its terminal
summary was available. Existing change history records worker/package tests and global
hooks as passing, but this partial does not treat that history as a replacement for a
fresh result. Re-run the focused code-graph worker tests (or the repository test hook)
before declaring the audit's test evidence fully fresh.

### D-3 — Code-graph index content is materially underpopulated despite a “current” state (tooling-health risk)

`graph stats` reports a current, coverage-complete graph while reporting only one source
file and three symbols. This prevents graph-based impact verification for the changed
implementation. The requirement surface itself is not contradicted by source review or
tests, but the graph index's freshness/coverage reporting should be investigated outside
this change if reproducible.

No implementation/spec contradiction was found in the assigned four-spec scope.

## Test coverage and remaining gaps

- Covered: CLI delegation, descriptor serialization, bootstrap/configured paths,
  structured-output cleanliness, force runs, lock release, corruption recovery,
  busy-lock exit, public-barrel boundaries, worker terminal/protocol behaviors, and
  built worker task fixtures.
- Useful additional hardening (non-blocking): a real CLI subprocess test that injects
  each typed worker failure class (startup/protocol/signal/task) and asserts the exact
  existing code-3 presentation path, rather than relying primarily on the command unit
  mock. Current behavior is unit-covered generically and architecture-compliant.

## Dependency consistency

- CLI -> SDK -> code-graph follows the declared no-direct-code-graph CLI dependency.
- The isolated worker remains code-graph-owned; CLI's packaged task is selected
  programmatically and executes SDK orchestration.
- SDK's `runIndexProjectGraph` owns force/open-error recovery; provider recreation is
  closed-only and does not leak into the CLI or worker API.
- Documentation and CLI semantics agree that force is logical reindexing, with physical
  recreation reserved for typed recoverable open failure.

## Summary counts

- Requirements assessed: 10 grouped areas
- Passing/aligned: 10
- Implementation defects: 0
- Spec contradictions: 0
- Blocking lifecycle findings: 1 (`REVIEW_REQUIRED`)
- Evidence/tooling risks: 2 (unobserved focused terminal result; underpopulated graph)
- Non-blocking test hardening suggestions: 1

# Compliance partial — Code Graph store contracts

Audit mode: change (`centralize-graph-index-worker`)

Scope owned: `code-graph:index-project-graph`, `code-graph:graph-store`, and `code-graph:sqlite-graph-store`; direct contract consistency with `code-graph:composition` and global architecture/testing conventions was considered.

## Requirements summary

| Spec                             | Change-relevant requirement                         | Expected contract                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:index-project-graph` | Forced logical reindex; prepared provider lifecycle | The already-open provider receives `force`; the use case does not open/close/clear/recreate or own recovery.                                                                                                                                                         |
| `code-graph:graph-store`         | Lifecycle and recreation                            | `open()` is parameterless/non-destructive; recoverable corruption/incompatible-schema failures are typed and leave the store closed; `recreate()` requires a closed store and rotates generation; `clear()` is the healthy opened-store logical reset used by force. |
| `code-graph:sqlite-graph-store`  | SQLite realization                                  | Physical recreation is closed-only and leaves no worker open; known corrupt/incompatible open failures are typed; ordinary failures propagate; healthy force clears rather than delete/reopen.                                                                       |

## Implementation status

### `code-graph:index-project-graph`

Conformant for the new force/lifecycle contract.

- `packages/code-graph/src/application/use-cases/index-project-graph.ts` only builds `IndexOptions` and delegates once to `input.provider.index()`.
- It forwards `force: true`, VCS root/ref, and progress; it neither imports nor calls lifecycle, lock, workspace-resolution, or process APIs.
- `CodeGraphProvider.index()` in `packages/code-graph/src/composition/code-graph-provider.ts` owns the opened-store force behavior: it calls `store.clear()` under its index lock before the indexer executes.

### `code-graph:graph-store`

Conformant for the new lifecycle separation.

- The abstract port documents parameterless `open`, `clear`, closed-only `recreate`, and observable storage generation.
- `CodeGraphProvider.recreate()` rejects while provider-open with `GraphStoreRecreateRequiresClosedError`; `clear()` requires an open provider and preserves the generation.
- `SQLiteGraphStore.recreate()` invalidates sessions, rejects if the worker client is open, removes only the graph persistence directory, rotates the generation, and does not reopen the worker.

### `code-graph:sqlite-graph-store`

Conformant for typed SQLite-open handling and worker error transport.

- `SQLiteGraphDatabase.open()` closes any partially opened native handle, clears prepared statements, translates recognized recovery conditions into `GraphStorageRecoveryRequiredError`, and preserves unrelated errors.
- `serializeError()` now includes `recoveryReason`; `deserializeWorkerError()` consequently restores `CORRUPT` rather than defaulting it to schema incompatibility.
- `SQLiteGraphStore.clear()` dispatches the logical reset to the live worker. It does not delete/reopen storage.

## Discrepancies

### Finding S-1 — inherited SQLite verification scenario contradicts the narrowed recovery authority

Severity: **medium (artifact/spec drift)**

Evidence:

- The merged `code-graph:sqlite-graph-store` verification artifact still has the inherited **Reference schema upgrade / SQLite old schema rebuilds safely** scenario: after a normal read failure, “graph index” rotates generation and rebuilds the database.
- The change delta and implementation intentionally narrow physical recreation: ordinary reads propagate open failure, and recovery is authorized by the SDK only for forced indexing (`force: true`) after close; `IndexProjectGraph` itself expressly has no recovery responsibility.

Both possibilities:

1. **Spec drift likely:** update/remove the inherited scenario so it says an SDK-owned _forced_ reindex handles a typed recovery error, closes, recreates, and retries once. This matches the current design and implementation.
2. **Implementation change possible:** if every ordinary `graph index` after a typed schema failure is meant to rotate storage, SDK/provider recovery would need to be broadened beyond `force`; that contradicts the recently added force-only safety contract and is not recommended without an explicit product decision.

No code defect is asserted for S-1; the evidence favors the first interpretation.

### Observation S-2 — inherited generic “ready for fresh indexing” wording is ambiguous after recreate

Severity: **low (wording ambiguity)**

The inherited `code-graph:graph-store` verification scenario says a recreated backend is “ready for a fresh indexing run,” while the modified requirement requires it to remain closed until explicit `open()`. The concrete new scenario clarifies the intended order, and implementation is correct; nevertheless, changing the old wording to “ready to be explicitly opened for a fresh indexing run” would eliminate ambiguity.

## Test coverage

| Contract                                                                                       | Evidence                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Force is logical clear, never physical recreate                                                | `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`; `packages/code-graph/test/composition/code-graph-provider.spec.ts` (“uses logical clear rather than physical recreation for forced indexing”). |
| Closed-only provider/store recreation                                                          | `code-graph-provider.spec.ts`; `sqlite-graph-store.spec.ts`; `sqlite-worker-lifecycle.spec.ts`.                                                                                                                              |
| Closed recreation clears data, companion lifecycle, no residual worker handle                  | `sqlite-worker-lifecycle.spec.ts` (“executes recreate() asynchronously on closed store without lingering WAL/SHM files”).                                                                                                    |
| Corrupt data becomes typed, leaves physical bytes/generation untouched until explicit recreate | `sqlite-graph-store.spec.ts` (“classifies invalid SQLite bytes as recoverable corruption without mutating the closed store”).                                                                                                |
| Ordinary runtime/module open failure propagates without deletion or epoch rotation             | `sqlite-graph-store.spec.ts` (“propagates ordinary runtime open failures without recreating or rotating storage”).                                                                                                           |
| Recovery reason survives worker IPC                                                            | `sqlite-worker-protocol.spec.ts` checks `CORRUPT` round-trip.                                                                                                                                                                |

Focused command was launched for the above suites:

`pnpm --filter @specd/code-graph test -- index-project-graph.spec.ts code-graph-provider.spec.ts sqlite-graph-store.spec.ts sqlite-worker-lifecycle.spec.ts sqlite-worker-protocol.spec.ts`

The available command capture showed Vitest startup but did not return a final aggregate in this isolated audit invocation. Earlier lifecycle hooks reported passing repository tests; the audit therefore does not claim an independent final count from this command.

## Missing tests

1. Add an end-to-end storage-path test that starts with an incompatible SQLite database and proves only SDK force recovery (not direct `IndexProjectGraph`, and not a non-forced caller) executes close → recreate → one retry. This belongs principally to `sdk:run-index-project-graph`, but it is the integration test that closes S-1’s semantic gap.
2. Add or rename the generic GraphStore recreation test to explicitly assert that an immediate indexing attempt before `open()` rejects with `StoreNotOpenError`; current SQLite tests establish the intended state indirectly.

## Dependency consistency

- `code-graph:index-project-graph` is consistent with `code-graph:composition`: the provider owns locking and logical clear; the use case is a stateless application orchestrator.
- The new GraphStore/SQLite separation is consistent with global architecture: destructive filesystem work stays in the infrastructure adapter and the use case depends on the host port.
- S-1 is inconsistent with the direct SDK recovery dependency (`sdk:run-index-project-graph` / `sdk:with-open-graph-provider`): the latter specifies typed-error recovery only on force, whereas the inherited SQLite scenario suggests a broader index-triggered recreation.

## Summary counts

- Requirements audited: 3 change-scoped specs; all change-added/modified storage and `IndexProjectGraph` requirements inspected.
- Confirmed implementation conformances: 8.
- Discrepancies: 1 medium artifact/spec-drift finding; 1 low wording ambiguity.
- Confirmed test areas: 5.
- Missing/strengthening tests: 2.
- Implementation defects found: 0.

# Compliance audit — SDK orchestration and provider lifecycle

**Change:** `centralize-graph-index-worker`  
**Scope:** `sdk:run-index-project-graph`, `sdk:with-open-graph-provider`, and direct dependencies `sdk:host-context`, `code-graph:composition`, and `code-graph:index-project-graph`.  
**Method:** merged `changes spec-preview` content, graph symbol lookup, source/test inspection, and focused SDK tests.

## Requirements summary

### `sdk:run-index-project-graph`

- Reject lifecycle hooks paired with a caller-owned provider using `InvalidProviderLifecycleError`.
- Resolve config and all/selected workspaces; prepare graph configuration, package version, VCS context, force, and progress input.
- Use `withOpenGraphProvider` for transient providers; never manage the lifecycle of an explicit already-open provider.
- For a transient `force: true` run only, recover one typed `GraphStorageRecoveryRequiredError`: close, recreate the closed storage, re-open once, then index. Non-forced, untyped, non-recoverable, recovery, and retry failures must propagate without another retry or deletion.
- Keep locking outside the SDK; pass progress and final index/full-rebuild results without loss.

### `sdk:with-open-graph-provider`

- Create a provider, order `beforeOpen -> open -> callback -> close -> afterClose`, and use parameterless `open()`.
- Close and call `afterClose` on failed opens and callback failures; preserve primary callback/open/recovery errors over cleanup errors.
- Support one opt-in `recoverOpenFailure(error, closedProvider)` call after the first failed open; retry `open()` at most once.
- Never exit the process and do not alter the direct provider lifecycle contract.

## Implementation status

| Requirement area                                     | Evidence                                                                                                                                                                                             | Status            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Explicit-provider ownership and invalid hook pairing | `packages/sdk/src/orchestration/run-index-project-graph.ts:46-55,105-106`; tests cover no close and typed error                                                                                      | Conformant        |
| Input/config/workspace/VCS/progress preparation      | `run-index-project-graph.ts:57-102`; focused tests cover subset, all workspaces, version and progress                                                                                                | Conformant        |
| Bounded force-only typed recovery                    | `run-index-project-graph.ts:108-126` configures recovery only when force is true; helper at `with-open-graph-provider.ts:52-82` closes before callback, performs one retry, and has terminal cleanup | Conformant        |
| Ordinary/non-forced failure propagation              | `with-open-graph-provider.ts:52-57,69-81`; SDK test covers force false typed and force true non-recoverable errors                                                                                   | Conformant        |
| Lifecycle hooks/cleanup/error precedence             | `with-open-graph-provider.ts:19-91`; helper tests cover success, open failure, callback error, recovery callback failure, retry-open failure, close/afterClose precedence                            | Conformant        |
| No process exit                                      | no `process.exit` in helper; explicit unit test                                                                                                                                                      | Conformant        |
| Lock remains out of SDK orchestration                | no lock-helper import/call in `run-index-project-graph.ts`                                                                                                                                           | Conformant        |
| Delegation to `IndexProjectGraph` use case           | `run-index-project-graph.ts:79-102` calls `provider.index(...)` directly and does not import/call `createIndexProjectGraph()`                                                                        | **Finding SDK-1** |

## Discrepancies

### SDK-1 — `runIndexProjectGraph` bypasses the required `IndexProjectGraph` use case

**Severity:** medium (architecture/spec compliance; current runtime behaviour is largely equivalent).

The merged `sdk:run-index-project-graph` requirement says the SDK must invoke `createIndexProjectGraph()` on either the transient or explicit provider. The merged `code-graph:index-project-graph` contract also defines that use case as the host orchestration boundary for prepared, already-open providers. However, `packages/sdk/src/orchestration/run-index-project-graph.ts:79-102` builds the options and calls `provider.index(...)` directly; `createIndexProjectGraph` is neither imported nor used.

**Implementation-bug interpretation:** the SDK has duplicated the Code Graph application-use-case responsibility. A future `IndexProjectGraph` behaviour change can be missed by SDK indexing, and tests mock `createIndexProjectGraph` while the source bypasses it, so the apparent seam is not actually asserted.

**Spec-drift interpretation:** if the intended design is for `runIndexProjectGraph` itself to be the sole host orchestration layer and direct `provider.index` is deliberately accepted, the SDK spec should remove the `createIndexProjectGraph()` requirement and adjust its dependency wording. That interpretation is less consistent with the change’s merged `code-graph:index-project-graph` purpose and boundary.

**Recommended resolution:** implement the specified delegation and assert the factory/use-case invocation in `run-index-project-graph.spec.ts`; alternatively revise both coupled specifications with an explicit architectural decision.

No other implementation/spec discrepancy was found in the assigned SDK contracts.

## Test coverage

- Ran `pnpm --filter @specd/sdk test -- run-index-project-graph.spec.ts with-open-graph-provider.spec.ts`: **9 files, 72 tests passed**.
- `run-index-project-graph.spec.ts` covers workspace selection, all-workspace indexing, progress/version propagation, transient hooks, explicit provider ownership, parameterless opening, forced result reporting, typed force-only recovery, non-forced/non-recoverable propagation, and invalid lifecycle hooks.
- `with-open-graph-provider.spec.ts` covers successful ordering, after-close errors, callback-error preservation, before-open order, failed-open cleanup, accepted/declined recovery, recovery-callback failure, retry-open failure/no third open, and no process exit.

## Missing or insufficient tests

1. **SDK-1 test gap:** no test proves `runIndexProjectGraph` calls `createIndexProjectGraph()`; the current mocked factory is unused by the production source, so existing tests do not protect the architecture boundary.
2. A focused orchestration test should assert that the force-recovery result retains `IndexProjectGraph` result fields _through the factory/use-case seam_, including `fullRebuildReason`.
3. Coverage is sufficient for helper cleanup ordering, including the regressions reported before this audit; no additional lifecycle failure-path gap was identified.

## Dependency consistency

- `sdk:host-context` supplies only kernel plus a factory that creates a fresh provider; the helper conforms by creating one provider and no top-level duplicated config.
- Merged `code-graph:composition` now permits recovery `recreate()` as a closed-provider operation and states force is logical clearing, which is consistent with SDK force-only recovery after an open failure. The SDK calls `recreate()` only after the helper has closed the provider.
- Merged `code-graph:index-project-graph` says it receives an already-open provider, does not open/close/recreate, and only forwards logical force. The SDK recovery happens before indexing, which is consistent; the direct `provider.index` call is the sole boundary mismatch (SDK-1).
- Graph symbol search resolved both SDK symbols and their declarations/exports. `graph impact --symbol` returned `not_found` despite those results, so dependency traversal could not supply extra evidence; source imports and merged specs were used as the documented fallback.

## Summary counts

| Category                 |                                       Count |
| ------------------------ | ------------------------------------------: |
| Requirements reviewed    |                                          10 |
| Conformant areas         |                                           9 |
| Implementation findings  |                                           1 |
| Spec-drift possibilities | 1 (the alternative interpretation of SDK-1) |
| Missing-test findings    |                  2 (both follow from SDK-1) |
| Focused test failures    |                                           0 |
