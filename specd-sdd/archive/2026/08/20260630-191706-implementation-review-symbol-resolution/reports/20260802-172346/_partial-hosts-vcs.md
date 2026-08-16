# Partial compliance review — CLI/SDK hosts and Core VCS

## Scope and result

Reviewed the implementation against the current projected requirements for these 11 specs:

- `cli:change-implementation`
- `cli:graph-impact`
- `cli:graph-search`
- `cli:change-status`
- `cli:graph-index`
- `cli:graph-stats`
- `sdk:build-implementation-review`
- `sdk:composition`
- `sdk:run-index-project-graph`
- `core:vcs-adapter-port`
- `core:vcs-implementation-detector`

The review used `project status --context --graph`, graph-first symbol inspection, `changes spec-preview` for every assigned spec, direct implementation/test inspection, and focused Vitest execution.

**Strict result: FULLY COMPLIANT.** All **84 projected requirements conform**; there are **0 partial** and **0 non-conformant** requirements. A focused re-audit of graph-index host composition against the merged projection resolved the sole earlier finding.

| Spec                               | Requirements | Conformant | Partial | Non-conformant |
| ---------------------------------- | -----------: | ---------: | ------: | -------------: |
| `cli:change-implementation`        |            9 |          9 |       0 |              0 |
| `cli:graph-impact`                 |            9 |          9 |       0 |              0 |
| `cli:graph-search`                 |            7 |          7 |       0 |              0 |
| `cli:change-status`                |           13 |         13 |       0 |              0 |
| `cli:graph-index`                  |            6 |          6 |       0 |              0 |
| `cli:graph-stats`                  |            6 |          6 |       0 |              0 |
| `sdk:build-implementation-review`  |            5 |          5 |       0 |              0 |
| `sdk:composition`                  |            7 |          7 |       0 |              0 |
| `sdk:run-index-project-graph`      |            5 |          5 |       0 |              0 |
| `core:vcs-adapter-port`            |           12 |         12 |       0 |              0 |
| `core:vcs-implementation-detector` |            5 |          5 |       0 |              0 |
| **Total**                          |       **84** |     **84** |   **0** |          **0** |

## Re-audit of graph-index host composition

The merged `cli:graph-index` projection requires the worker/bypass path to obtain an `SdkHostContext` through the shared SDK composition boundary while preserving already-resolved CLI state. Specifically, configured mode must reuse the exact resolved kernel without reloading configuration or creating a parallel kernel, and bootstrap mode must create the equivalent SDK context from the explicit resolved bootstrap config.

The implementation conforms:

1. `resolveGraphCliContext` produces the single resolved `{ config, kernel }` state.
2. `index-graph.ts:99` passes those exact values to `resolveSdkHostContext(config, kernel)` before calling `runIndexProjectGraph`.
3. In configured mode, `resolveSdkHostContext` returns the same kernel reference and a provider factory closed over the same config (`packages/cli/src/helpers/sdk-host.ts:21-25`). It neither reloads config nor constructs another kernel.
4. In bootstrap mode, where the resolved kernel is `null`, it calls `createSdkContext` with the already-resolved bootstrap config (`packages/cli/src/helpers/sdk-host.ts:27`). This preserves explicit `--path`/fallback bootstrap semantics rather than rediscovering a different configured project.

The merged verification scenarios are covered by command tests asserting `resolveSdkHostContext(config, kernel)` in configured mode and `resolveSdkHostContext(config, null)` for explicit bootstrap mode. The focused graph-index suite passes all 9 tests. Requiring the helper name `openSpecdHost` here would contradict the resolved-state reuse obligation because that bootstrap API loads configuration and builds a new kernel; the contract is the `SdkHostContext` boundary and state identity, not a specific bootstrap helper.

## Confirmed implementation coverage

### CLI implementation review and status

- `change implementation list`, mutation commands, and `change status` share the SDK-owned reviewed implementation projection rather than reconstructing divergent CLI views.
- The integration suite confirms list, review, and status return the same immutable reviewed projection after mutations.
- Structured formats preserve the authoritative projection and text output renders its state consistently.

### Graph search and impact

- The CLI builds one search request and delegates search planning, ranking, file-result suppression, and result limits to Code Graph; it does not reproduce orchestration policy in the command layer.
- Symbol, file, document, and spec result modes and their formatting remain covered.
- Impact commands preserve symbol/file resolution, dependency direction, depth, workspace qualification, and structured output behavior.

### Graph index

- The normal parent path acquires the shared index lock and spawns a child using the current Node executable and CLI argv.
- Worker environment markers prevent recursive spawning and identify the already-held lock.
- Standard I/O is inherited, signals are forwarded, signal exits are mapped, child exit status is propagated, and the lock is released.
- Worker bypass and worker execution delegate indexing to `runIndexProjectGraph` and preserve phase metrics and full-rebuild reporting.
- Configured execution reuses the exact resolved config and kernel, while bootstrap execution creates its SDK context from the explicit resolved bootstrap config without implicit rediscovery.

### Graph stats and freshness presentation

- Stats uses one provider lifecycle and one health evaluation.
- Text output exposes health state, global/workspace latch state, content/coverage/schema/generation dimensions, and reason codes.
- JSON/TOON output preserves additional stats fields rather than narrowing the SDK/provider result.
- Downstream Code Graph coverage confirms the global stale latch, VCS candidate evaluation, and filesystem `mtime`/size/hash fallback used for non-VCS workspaces.

### SDK composition and indexing

- `runIndexProjectGraph` now uses the shared `withOpenGraphProvider` lifecycle with the specialized `openForIndexing` operation.
- `withOpenGraphProvider` supports a typed alternate open operation while retaining before-open, after-close, close-on-failure, and caller-owned-provider semantics.
- Repair/full-rebuild information is combined with the provider result and explicit force input without discarding phase metrics.
- SDK composition/barrel exports include the required host and orchestration entry points.

### Core VCS port and detector

- Git, Mercurial, Subversion, and null adapters implement the port semantics for repository-relative changed paths and stable-reference discovery without embedding graph-specific policy.
- The implementation detector uses `refAt` when available, falls back through adapter stable-reference behavior, and retains rebase/generic exclusion policy at the Core boundary.
- Graph relevance filtering, including configured `excludePaths`, remains downstream of the VCS adapter; an excluded manifest returned by VCS therefore does not by itself make graph health stale.

## Focused verification

All focused suites passed:

| Area                                             | Test files |   Tests | Result   |
| ------------------------------------------------ | ---------: | ------: | -------- |
| SDK orchestration/composition/barrel             |          4 |      35 | Pass     |
| CLI assigned command behavior                    |          7 |      94 | Pass     |
| Core VCS composition/adapters/detector/barrel    |          5 |      32 | Pass     |
| Code Graph health/search/index/lock dependencies |          4 |      28 | Pass     |
| **Total**                                        |     **20** | **189** | **Pass** |

Commands were executed with Vitest against the focused source suites. The CLI run emitted only the existing schema-name warning (`@specd/schema-std@1` versus `schema-std@1`); it did not fail any test.

The graph-index suite was rerun after the merged spec/verify projection changed: **1 file, 9 tests, all passed**. This is a focused confirmation within the already-counted CLI suite, so it does not increase the unique 20-file/189-test totals above.

## Test gaps and residual risk

These are coverage gaps, not additional demonstrated compliance failures:

- The graph-index parent test proves successful worker execution and shared-lock ownership, but lacks isolated assertions for non-zero child exit propagation, SIGINT/SIGTERM forwarding and mapped exits, busy-lock exit/message behavior, spawn errors, exact-once release, and worker-mode prevention of nested spawn.
- The command suite verifies configured/bootstrap argument identity at the host-context boundary; the small `resolveSdkHostContext` helper itself has no separate focused unit suite, so its two branches are currently supported by code inspection and broader command behavior rather than direct branch-isolated tests.
- Cross-backend parity for all graph health/search behaviors is not exhaustively exercised by the focused suites; the reviewed abstractions preserve the intended boundary, but backend-wide confidence still depends on the broader repository suite.

## Conclusion

The assigned CLI, SDK, and Core VCS surface is fully compliant with the merged projected requirements: **84 of 84 conform**, and all focused tests are green. No material discrepancy remains. The listed test-hardening opportunities are residual coverage improvements, not observed requirement failures.
