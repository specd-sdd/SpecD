# Design: allow-existing-provider-in-run-index-project-graph

## Executive Summary

This design extends `RunIndexProjectGraphInput` in `@specd/sdk` by adding optional `provider?: CodeGraphProvider` and `afterClose?: (provider: CodeGraphProvider) => Promise<void>` parameters. When `input.provider` is supplied (as in long-lived MCP servers, API hosts, or daemons), `runIndexProjectGraph` delegates indexing directly to `input.provider` instead of creating and closing a transient provider with `withOpenGraphProvider`. In this mode, `runIndexProjectGraph` expects `input.provider` to be already open, throws a typed `InvalidProviderLifecycleError` (`SpecdError` subclass with `code: 'INVALID_PROVIDER_LIFECYCLE'`) if `beforeOpen` or `afterClose` is also passed, and does not close `input.provider` even if indexing fails. When `input.provider` is omitted, `runIndexProjectGraph` uses `withOpenGraphProvider` to manage a transient provider lifecycle, forwarding both `beforeOpen` and `afterClose` options.

## Architecture & Layering Alignment

- **Package**: `@specd/sdk`
- **Subsystem**: Orchestration (`packages/sdk/src/orchestration/run-index-project-graph.ts`) & Errors (`packages/sdk/src/domain/errors/invalid-provider-lifecycle-error.ts`)
- **Layering Rules**: Follows `@specd/sdk` composition rules (re-exports domain/application use cases, composes core & code-graph, no internal I/O in core domain). `InvalidProviderLifecycleError` extends `SpecdError` from `@specd/core`.
- **Global Conventions**: Strict ESM, TypeScript types, explicit return types, no `any`, proper JSDoc comments.

## Affected Areas

- `packages/sdk/src/domain/errors/invalid-provider-lifecycle-error.ts`:
  - `InvalidProviderLifecycleError` class extending `SpecdError` with `code = 'INVALID_PROVIDER_LIFECYCLE'`.
- `packages/sdk/src/orchestration/run-index-project-graph.ts`:
  - `RunIndexProjectGraphInput` interface: add `readonly provider?: CodeGraphProvider` and `readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>`.
  - `runIndexProjectGraph` function: validate `if (input.provider !== undefined && (input.beforeOpen !== undefined || input.afterClose !== undefined))` -> throw `InvalidProviderLifecycleError`. If `input.provider !== undefined`, call `executeIndex(input.provider)` directly without closing `input.provider`. Otherwise, delegate to `withOpenGraphProvider(ctx, executeIndex, providerOptions)`.
- `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`:
  - Unit tests verifying transient provider flow (with `beforeOpen` & `afterClose`), existing provider bypass flow (without close), and conflicting hooks validation guard (asserting `InvalidProviderLifecycleError` and `code === 'INVALID_PROVIDER_LIFECYCLE'`).

## Technical Decisions & Approach

1. **New Error Construct**:

   ```ts
   import { SpecdError } from '@specd/core'

   export class InvalidProviderLifecycleError extends SpecdError {
     readonly code = 'INVALID_PROVIDER_LIFECYCLE'

     constructor() {
       super(
         "Cannot specify 'beforeOpen' or 'afterClose' lifecycle hooks when providing an existing open 'provider' instance to runIndexProjectGraph.",
       )
     }
   }
   ```

2. **Interface & Validation Guard**:

   ```ts
   export interface RunIndexProjectGraphInput {
     readonly force?: boolean
     readonly workspaces?: readonly string[]
     readonly onProgress?: IndexProgressCallback
     /** Hook invoked before provider open (only applies when creating a transient provider). */
     readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
     /** Hook invoked after provider close (only applies when creating a transient provider). */
     readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>
     readonly excludePaths?: readonly string[]
     /** Optional open provider instance. When supplied, indexing runs on this instance directly without wrapping in withOpenGraphProvider or calling beforeOpen/afterClose/close. */
     readonly provider?: CodeGraphProvider
   }

   if (
     input.provider !== undefined &&
     (input.beforeOpen !== undefined || input.afterClose !== undefined)
   ) {
     throw new InvalidProviderLifecycleError()
   }
   ```

3. **Orchestration Execution**:

   ```ts
   const executeIndex = async (provider: CodeGraphProvider) => {
     const indexProjectGraph = createIndexProjectGraph()
     return indexProjectGraph.execute({
       provider,
       projectRoot,
       workspaces,
       graphConfig,
       codeGraphVersion,
       vcsRoot,
       ...(input.force !== undefined ? { force: input.force } : {}),
       ...(vcsRef !== undefined ? { vcsRef } : {}),
       ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
     })
   }

   if (input.provider !== undefined) {
     return executeIndex(input.provider)
   }

   const providerOptions: WithOpenGraphProviderOptions | undefined =
     input.beforeOpen !== undefined || input.afterClose !== undefined
       ? {
           ...(input.beforeOpen !== undefined ? { beforeOpen: input.beforeOpen } : {}),
           ...(input.afterClose !== undefined ? { afterClose: input.afterClose } : {}),
         }
       : undefined

   return withOpenGraphProvider(ctx, executeIndex, providerOptions)
   ```

4. **Documentation Updates**:
   Update JSDoc in `packages/sdk/src/orchestration/run-index-project-graph.ts` to document `input.provider` and `input.afterClose`.

## Testing Strategy

- Unit test in `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`:
  - Verify that when `input.provider` is passed, `IndexProjectGraph.execute()` is called with `input.provider`, `beforeOpen`/`afterClose` are not called, and `provider.close()` is **not** called (even if `execute()` throws).
  - Verify that when `input.provider` is passed together with `beforeOpen` or `afterClose`, `runIndexProjectGraph` throws `InvalidProviderLifecycleError` with `code: 'INVALID_PROVIDER_LIFECYCLE'`.
  - Verify that when `input.provider` is omitted, `withOpenGraphProvider` passes `beforeOpen` and `afterClose` to `withOpenGraphProvider` and closes the transient provider instance upon completion.

## Open Questions

(None)
