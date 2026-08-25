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
