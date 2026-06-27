# IndexProjectGraph

## Purpose

Hosts (`graph index`, SDK `runIndexProjectGraph`) currently assemble workspace targets, merge graph configuration, and invoke `provider.index()` inline. `IndexProjectGraph` extracts that orchestration so adapters handle only I/O formatting, locks, and subprocess isolation while the code-graph package owns index execution semantics.

## Requirements

### Requirement: Executes project indexing

`IndexProjectGraph.execute(input)` MUST call `provider.index()` with an `IndexOptions` object built from:

- `projectRoot`
- `workspaces`
- `graphConfig`
- `codeGraphVersion`
- optional `vcsRef`
- optional `onProgress`

and MUST return the resulting `IndexResult` unchanged.

### Requirement: Supports force recreate

When `input.force` is `true`, `IndexProjectGraph` MUST call `provider.recreate()` before `provider.index()`. When `force` is `false` or omitted, it MUST NOT recreate the store.

### Requirement: Accepts open provider and prepared inputs

`IndexProjectGraphInput` MUST include:

- `provider: CodeGraphProvider` (already opened)
- `projectRoot: string`
- `workspaces: WorkspaceIndexTarget[]`
- `graphConfig: ProjectGraphConfig`
- `codeGraphVersion: string`
- optional `vcsRef: string`
- optional `force: boolean`
- optional `onProgress: IndexProgressCallback`

The use case MUST NOT resolve workspaces from `specd.yaml`, acquire locks, or spawn worker processes — callers supply prepared targets and config.

### Requirement: Factory wires dependencies

`createIndexProjectGraph()` in composition MUST return a stateless `IndexProjectGraph` instance.

## Constraints

- MUST NOT open or close the provider.
- MUST NOT acquire or release the graph indexing lock.
- Per-file index errors are reported in `IndexResult.errors`; the use case MUST NOT throw for parse failures.

## Spec Dependencies

- [`code-graph:composition`](../composition/spec.md) — `CodeGraphProvider`, `IndexOptions`, `IndexResult`
- [`code-graph:indexer`](../indexer/spec.md) — indexing semantics delegated via provider
- [`code-graph:graph-store`](../graph-store/spec.md) — recreate semantics for `--force`
- [`core:config`](../../../core/config/spec.md) — project root and config types used by callers
