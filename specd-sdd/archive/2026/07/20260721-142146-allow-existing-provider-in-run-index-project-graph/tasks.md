# Tasks: allow-existing-provider-in-run-index-project-graph

## 1. Domain Errors & SDK Orchestration

- [x] 1.1 Create `InvalidProviderLifecycleError` class
      `packages/sdk/src/domain/errors/invalid-provider-lifecycle-error.ts`: `InvalidProviderLifecycleError` — create error extending `SpecdError` with `code = 'INVALID_PROVIDER_LIFECYCLE'`
      Approach: Subclass `SpecdError` from `@specd/core`. Set `readonly code = 'INVALID_PROVIDER_LIFECYCLE'` and provide descriptive error message. Export error class from `@specd/sdk`.
      (Req: runIndexProjectGraph orchestration)

- [x] 1.2 Support optional existing provider, afterClose hook, and validation guard in `runIndexProjectGraph`
      `packages/sdk/src/orchestration/run-index-project-graph.ts`: `RunIndexProjectGraphInput` & `runIndexProjectGraph` — add optional `provider?: CodeGraphProvider` and `readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>` properties; add validation guard throwing `InvalidProviderLifecycleError`
      Approach: Add `readonly provider?: CodeGraphProvider` and `readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>` to `RunIndexProjectGraphInput`. Validate `if (input.provider !== undefined && (input.beforeOpen !== undefined || input.afterClose !== undefined))` -> throw `InvalidProviderLifecycleError`. Extract `executeIndex(provider)` callback. If `input.provider !== undefined`, return `executeIndex(input.provider)` directly without calling `close()`. Otherwise, wrap in `withOpenGraphProvider(ctx, executeIndex, { beforeOpen: input.beforeOpen, afterClose: input.afterClose })`.
      (Req: runIndexProjectGraph orchestration)

## 2. Unit Tests

- [x] 2.1 Add unit tests for `runIndexProjectGraph` with existing provider, validation guard, and transient provider with hooks
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`: `runIndexProjectGraph` — add tests for `input.provider` passed, validation guard throwing `InvalidProviderLifecycleError`, and transient provider forwarding `beforeOpen`/`afterClose`
      Approach: Test that when `input.provider` is provided, `IndexProjectGraph.execute()` is called on it and `provider.close()` is not called (even on error). Test that passing `input.provider` with `beforeOpen` or `afterClose` throws `InvalidProviderLifecycleError` with `code === 'INVALID_PROVIDER_LIFECYCLE'`. Test that when `input.provider` is omitted, `withOpenGraphProvider` receives `beforeOpen` and `afterClose` and closes the transient provider.
      (Req: runIndexProjectGraph orchestration, scenario: Existing open provider bypasses withOpenGraphProvider, scenario: Conflicting lifecycle hooks with existing provider throws error)
