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
- `vcsRoot`
- optional `vcsRef`
- optional `onProgress`

and MUST return the resulting `IndexResult` unchanged.

### Requirement: Supports force recreate

When `input.force` is true, `IndexProjectGraph` MUST pass that intent through the `IndexOptions` forwarded to `provider.index(...)`.

`IndexProjectGraph` MUST NOT call `provider.recreate()` directly. The provider owns any destructive reset, storage-generation rotation, and lock policy required to honor force reindex semantics.

### Requirement: Accepts open provider and prepared inputs

`IndexProjectGraphInput` MUST include:

- `provider: CodeGraphProvider` (already opened)
- `projectRoot: string`
- `workspaces: WorkspaceIndexTarget[]`
- `graphConfig: ProjectGraphConfig`
- `codeGraphVersion: string`
- `vcsRoot: string | null`
- optional `vcsRef: string`
- optional `force: boolean`
- optional `onProgress: IndexProgressCallback`

`vcsRoot` MUST be forwarded unchanged to the `IndexOptions` passed to `provider.index(...)`.

The use case MUST NOT resolve workspaces from `specd.yaml`, acquire locks, spawn subprocesses, or perform direct destructive reset calls against the provider or store.

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
