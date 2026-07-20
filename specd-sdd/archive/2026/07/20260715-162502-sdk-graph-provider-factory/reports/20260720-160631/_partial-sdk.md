# SDK compliance audit — `sdk:host-context`, `sdk:with-open-graph-provider`

## Scope and evidence

- Change: `sdk-graph-provider-factory`; merged artifacts inspected with `changes spec-preview`.
- Direct dependencies reviewed: `sdk:composition`, `core:kernel`, `core:composition`, and the change's merged `code-graph:composition`; global architecture, conventions, and testing constraints were also checked.
- Code-graph status was current (`stale: false`) before inspection. Graph search/impact located `SdkHostContext`, `createSdkContext`, `openSpecdHost`, and `withOpenGraphProvider`, plus their callers and focused tests.
- Focused verification: `pnpm --filter @specd/sdk test` — **6 files, 40 tests passed**.

## `sdk:host-context`

### Requirements and implementation status

| Requirement                                                                | Status | Evidence                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readonly, minimal `SdkHostContext` shape                                   | Pass   | `packages/sdk/src/composition/host-context.ts` exports only readonly `kernel` and `createGraphProvider`; it carries no config or write API.                                                                                                                 |
| Context reads configuration through kernel and retains no duplicate config | Pass   | The context object contains no config member; `Kernel` owns `project.getConfig` per `core:kernel`.                                                                                                                                                          |
| `createSdkContext` awaits core kernel composition                          | Pass   | It awaits `createKernel(config, options?.kernel)` before returning.                                                                                                                                                                                         |
| Factory uses same config and creates a fresh graph provider                | Pass   | The closure passes the exact `config` reference to `createCodeGraphProvider(config, options?.graph)` for every invocation; no provider instance is retained.                                                                                                |
| SDK-owned nested kernel/graph composition options                          | Pass   | `SdkContextOptions` separates `kernel?: KernelOptions` and `graph?: CodeGraphCompositionOptions`; omitted graph options pass `undefined`, preserving code-graph defaults.                                                                                   |
| Mutually-exclusive forced/discovery host bootstrap                         | Pass   | `openSpecdHost` rejects mixed `configPath`/`startDir` before constructing the loader; otherwise uses forced path, supplied root, or `process.cwd()` discovery as specified.                                                                                 |
| Return contract and warning handling                                       | Pass   | Result contains config, resolved path, and context; warnings remain solely on `config.warnings`, with no top-level warning collection.                                                                                                                      |
| Opt-in config-less graph bootstrap                                         | Pass   | Only a discovery `ConfigNotFoundError` with `allowBootstrapFallback: true` reaches VCS root resolution and `createBootstrapGraphConfig`; explicit `configPath` errors rethrow. A no-VCS root throws from `VcsAdapter.rootDir()`, preserving normal failure. |
| No config mutations in host context                                        | Pass   | Implementation imports no config writer and exposes neither writer APIs nor mutation methods.                                                                                                                                                               |

### Test coverage

- `host-context.spec.ts` covers config identity, fresh providers, graph/kernel option forwarding, cwd/explicit/forced loader modes, mixed-input rejection before loader creation, warning retention/no duplication, and successful VCS fallback.
- Coverage gaps (non-blocking): no focused test asserts that an explicit `configPath` plus fallback flag still propagates the loader failure; no focused test asserts that a no-VCS root rejects; no direct type/runtime assertion documents the absence of context write methods. All three are implemented by the source, but dedicated regression tests would make the merged scenarios fully evidenced.

### Dependency consistency

- Consistent with `sdk:composition`: files sit in `src/composition`, SDK depends only on core/code-graph, and public host symbols are re-exported through the SDK barrel.
- Consistent with `core:kernel` and `core:composition`: kernel creation is delegated to `createKernel`, config loading to `createDefaultConfigLoader`; SDK does not replicate core composition or config writing.
- Consistent with merged `code-graph:composition`: graph composition options and `createCodeGraphProvider` are forwarded without redefining the provider contract.
- Consistent with global architecture/conventions: composition-only orchestration, named exports, explicit public return types, immutable interfaces, ESM imports, and kebab-case source/test paths.

## `sdk:with-open-graph-provider`

### Requirements and implementation status

| Requirement                           | Status | Evidence                                                                                                                                                   |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider lifecycle order              | Pass   | The helper obtains `ctx.createGraphProvider()`, awaits optional `beforeOpen`, awaits `provider.open()`, runs `fn`, then closes.                            |
| Hooks around lifecycle                | Pass   | `beforeOpen` runs after creation/before open; `afterClose` runs after each attempted close path, including an `open()` failure and callback-error cleanup. |
| Callback-error precedence             | Pass   | On callback failure, `close(true)` suppresses close and after-close failures, then rethrows the original callback error.                                   |
| Open-failure cleanup                  | Pass   | An `open()` rejection is caught while cleanup has not started, so close/after-close are attempted and the original open error propagates.                  |
| Successful-operation cleanup failures | Pass   | Close or `afterClose` failure can propagate after a successful callback, as the merged requirement permits.                                                |
| No process-exit behavior              | Pass   | Source contains no exit call; focused test spies on `process.exit` and verifies it is unused.                                                              |
| Does not alter provider contract      | Pass   | It consumes only the `CodeGraphProvider` lifecycle API from code-graph and returns the callback result; long-lived hosts may use providers directly.       |

### Test coverage

- `with-open-graph-provider.spec.ts` covers success ordering, successful close/after-close ordering, close and after-close failures after success, callback-error preservation when close fails, `beforeOpen` order, open failures with and without `beforeOpen`, `afterClose` on failed open, and no process exit.
- Coverage gap (non-blocking): no isolated test exercises a rejecting `beforeOpen` hook and asserts that close then `afterClose` run while the hook error is preserved. The implementation does this through its catch/cleanup path; adding the test would protect the broad “regardless of whether the operation … threw” requirement.

### Dependency consistency

- Consistent with `sdk:host-context`: the helper receives its provider exclusively through `SdkHostContext.createGraphProvider`.
- Consistent with merged `code-graph:composition`: it calls the existing `open`/`close` lifecycle and does not add state or methods to `CodeGraphProvider`.
- Consistent with global architecture/testing/conventions: it is SDK composition orchestration rather than a core domain use case, uses typed Vitest mocks, has no snapshots or filesystem I/O, and exposes a named function with an explicit return type.

## Discrepancies and alternatives

No implementation/spec contradiction was found for either audited merged spec.

The only findings are **three test-coverage gaps** above. They do not demonstrate an implementation defect: source control flow satisfies the stated behavior. If the team regards every merged scenario/edge case as requiring a direct regression test, add the missing tests; otherwise the current implementation is compliant.

## Summary

| Metric                                  | Count |
| --------------------------------------- | ----: |
| Requirements evaluated                  |    17 |
| Passing implementation requirements     |    17 |
| Spec/code discrepancies                 |     0 |
| Dependency/global consistency conflicts |     0 |
| Test-coverage gaps (non-blocking)       |     3 |
| Focused test failures                   |     0 |

**Audit conclusion:** implementation is compliant with `sdk:host-context` and `sdk:with-open-graph-provider`; improve edge-case regression coverage as noted.
