# SDK Run Index Project Graph

## Purpose

`graph index` requires listing workspaces, resolving VCS state, and invoking `IndexProjectGraph` with the correct project graph config. Hosts should not assemble this pipeline manually. `runIndexProjectGraph` provides the SDK orchestration entry used by CLI (with optional lock wrapper) and future hosts.

## Requirements

### Requirement: runIndexProjectGraph orchestration

`runIndexProjectGraph(ctx: SdkHostContext, input: RunIndexProjectGraphInput): Promise<RunIndexProjectGraphResult>` SHALL:

1. Validate input combinations:
   - IF `input.provider` is provided AND (`input.beforeOpen` is provided OR `input.afterClose` is provided), throw `InvalidProviderLifecycleError` (a `SpecdError` with `code: 'INVALID_PROVIDER_LIFECYCLE'`)
2. Resolve `SpecdConfig` via `ctx.kernel.project.getConfig.execute()`
3. Call `ctx.kernel.project.listWorkspaces.execute()` for workspace targets
4. Prepare `projectRoot`, `workspaces`, `graphConfig`, `codeGraphVersion`, `vcsRoot`, `vcsRef`, `force`, and `onProgress`
5. If `input.provider` is provided:
   - Expect `input.provider` to be an already open `CodeGraphProvider` instance
   - Invoke `createIndexProjectGraph()` directly on `input.provider`
   - MUST NOT close `input.provider` on completion or failure
6. If `input.provider` is omitted:
   - Run inside `withOpenGraphProvider(ctx, async (provider) => { ... }, { beforeOpen: input.beforeOpen, afterClose: input.afterClose })`
   - Invoke `createIndexProjectGraph()` on the opened transient provider
   - Close the transient provider upon completion

`input.workspaces` MAY restrict indexing to a subset; when omitted, all configured workspaces MUST be indexed.

### Requirement: Lock acquisition out of scope

Subprocess lock for concurrent index exclusion (`acquireGraphIndexLock`) MUST NOT run inside `runIndexProjectGraph`. CLI adapters MAY call lock helpers in a `beforeOpen` hook passed to `withOpenGraphProvider`.

### Requirement: Progress callback passthrough

When `input.onProgress` is provided, the orchestration MUST forward progress events from `IndexProjectGraph` without transformation.

### Requirement: Result passthrough

`RunIndexProjectGraphResult` MUST match `IndexProjectGraph` result fields (indexed file/symbol counts, per-workspace breakdown, errors) without lossy mapping.

## Spec Dependencies

- [`sdk:with-open-graph-provider`](../with-open-graph-provider/spec.md) — provider lifecycle wrapper
- [`code-graph:index-project-graph`](../../../../specs/code-graph/index-project-graph/spec.md) — indexing use case
- [`core:list-workspaces`](../../../../specs/core/list-workspaces/spec.md) — workspace enumeration
