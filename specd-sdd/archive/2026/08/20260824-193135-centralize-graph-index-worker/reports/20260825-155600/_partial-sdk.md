# Compliance audit — SDK partial

## Scope and evidence

- Change: `centralize-graph-index-worker`
- Reviewed merged specs: `sdk:run-index-project-graph`,
  `sdk:with-open-graph-provider`, and `sdk:composition`.
- Reviewed implementation: `packages/sdk/src/orchestration/run-index-project-graph.ts`,
  `packages/sdk/src/composition/with-open-graph-provider.ts`,
  `packages/sdk/src/index.ts`, and `packages/sdk/package.json`.
- Reviewed tests: `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`,
  `packages/sdk/test/composition/with-open-graph-provider.spec.ts`, and
  `packages/sdk/test/barrel.spec.ts`.

Graph-first lookup resolved the public logical symbols `runIndexProjectGraph` and
`withOpenGraphProvider`, including their public bindings. The dependency-impact
query by bare symbol name returned `not_found`; direct source/import inspection was
used only for that unavailable graph edge.

## Requirements summary

1. SDK indexing obtains configuration/workspaces/VCS inputs, delegates through
   `IndexProjectGraph`, preserves output fields, and does not acquire CLI locks.
2. Explicit providers are caller-owned and never closed, recreated, or retried by
   SDK orchestration. Transient providers use the common lifecycle helper.
3. Only a forced transient index may recover a typed
   `GraphStorageRecoveryRequiredError`: close, recreate, and retry one parameterless
   open. Other errors and a second failure propagate.
4. The generic provider helper keeps ordered hooks, cleanup/error precedence, and
   no-process-exit behavior while exposing a single optional recovery callback.
5. SDK publishes the high-level isolated worker contracts but not raw graph-index
   locks or IPC envelopes, and keeps runtime dependencies limited to Core and Code
   Graph.

## Implementation status

| Area                                  | Status    | Evidence                                                                                                                                                                         |
| ------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared-provider use-case delegation | Compliant | `runIndexProjectGraph` creates `createIndexProjectGraph()` and calls `execute()` with provider, graph config, workspace selection, VCS, force, and original progress callback.   |
| Provider ownership                    | Compliant | Explicit provider returns through `executeIndex` and bypasses `withOpenGraphProvider`; no close/recreate/retry path is reachable.                                                |
| Force-only typed recovery             | Compliant | Only `input.force === true` installs `recoverOpenFailure`; it accepts only `GraphStorageRecoveryRequiredError`, invokes `provider.recreate()`, and returns one recovery request. |
| Generic lifecycle/cleanup             | Compliant | Helper calls parameterless `open`, closes before recovery, retries at most once, preserves terminal errors, and invokes `afterClose` after final cleanup.                        |
| Curated SDK surface                   | Compliant | Root barrel exports `runIsolatedGraphIndex` and typed worker contracts; lock helpers/raw IPC are absent. Package runtime deps are exactly Core and Code Graph.                   |

## Discrepancies

No discrepancies found in this scope.

## Test coverage

Focused verification passed:

```
pnpm --filter @specd/sdk test -- run-index-project-graph.spec.ts with-open-graph-provider.spec.ts barrel.spec.ts
9 files passed, 72 tests passed

pnpm --filter @specd/sdk typecheck
TypeScript: No errors found

pnpm --filter @specd/sdk lint
passed
```

The tests cover subset/all workspaces, callback forwarding, explicit-provider
ownership, force result decoration, typed recovery, rejected recovery conditions,
lifecycle-hook conflict validation, recovery ordering, failed recovery/retry cleanup,
and the curated public barrel (including absence of locks).

## Missing tests

No required acceptance scenario is untested. A possible non-blocking strengthening
would be an explicit `runIndexProjectGraph` assertion that `afterClose` runs exactly
once on successful typed recovery; the generic helper already tests recovery order
and the implementation has one final `afterClose` path. This is not a compliance
gap because the merged scenarios do not require that SDK-level duplicate assertion.

## Dependency chain

`CLI host` → `@specd/sdk.runIndexProjectGraph` →
`withOpenGraphProvider` (transient only) → parameterless
`CodeGraphProvider.open/close/recreate` → `IndexProjectGraph.execute` →
`CodeGraphProvider.index`.

For caller-owned providers, the lifecycle-helper segment is intentionally skipped:
`host` → `runIndexProjectGraph` → `IndexProjectGraph.execute(explicit provider)`.

## Summary counts

- Requirements reviewed: 5 groups
- Compliant: 5
- Discrepancies: 0 (critical 0, high 0, medium 0, low 0)
- Required missing tests: 0
