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

### Requirement: Supports forced logical reindex

`IndexProjectGraph` SHALL forward `force` to `CodeGraphProvider.index()` as a
request for a complete logical reindex. A forced run MUST clear reusable indexed
contents and bypass incremental reuse so every selected input is reconsidered.

`IndexProjectGraph` MUST NOT call `CodeGraphProvider.recreate()` and MUST NOT
implement physical-storage recovery. The provider supplied to this use case is
already open; recoverable open failures are handled by the SDK lifecycle owner
before this use case is invoked.

### Requirement: Accepts open provider and prepared inputs

`IndexProjectGraph` SHALL accept an already-open `CodeGraphProvider` and prepared
project inputs. `IndexProjectGraphInput` MUST include `provider`, `projectRoot`,
`workspaces`, `graphConfig`, `codeGraphVersion`, `vcsRoot`, optional `vcsRef`,
optional `force`, and optional `onProgress`; `vcsRoot` is forwarded unchanged.

It MUST NOT resolve workspaces, acquire locks, spawn processes, open, close, clear
directly, recreate, or otherwise own storage lifecycle. Its only force
responsibility is forwarding the force intent to provider indexing.

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
