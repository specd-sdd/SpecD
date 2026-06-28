# SDK Run Index Project Graph

## Purpose

`graph index` requires listing workspaces, resolving VCS state, and invoking `IndexProjectGraph` with the correct project graph config. Hosts should not assemble this pipeline manually. `runIndexProjectGraph` provides the SDK orchestration entry used by CLI (with optional lock wrapper) and future hosts.

## Requirements

### Requirement: runIndexProjectGraph orchestration

`runIndexProjectGraph(ctx: SdkHostContext, input: RunIndexProjectGraphInput): Promise<RunIndexProjectGraphResult>` SHALL:

1. Resolve `SpecdConfig` via `ctx.kernel.project.getConfig.execute()`
2. Call `ctx.kernel.project.listWorkspaces.execute()` for workspace targets
3. Run inside `withOpenGraphProvider(ctx, async (provider) => { ... })`
4. Invoke `createIndexProjectGraph()` from `@specd/code-graph` and call `indexProjectGraph.execute({ provider, projectRoot, workspaces, graphConfig, codeGraphVersion, force, vcsRef, onProgress })` with values prepared from config, workspace list, VCS ref, and `input`

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
