# IndexProjectGraph

## Purpose

Hosts (`graph index`, SDK `runIndexProjectGraph`) currently assemble workspace targets, merge graph configuration, and invoke `provider.index()` inline. `IndexProjectGraph` extracts that orchestration so adapters handle only I/O formatting, locks, and subprocess isolation while the code-graph package owns index execution semantics.

## Requirements

### Requirement: Executes project indexing

`IndexProjectGraph.execute(input)` MUST call `provider.index()` with an `IndexOptions` object built from:

- `projectRoot`
- `workspaces`
- optional `configuredWorkspaces`
- `graphConfig`, including the per-file size limit and the size-exempt patterns exactly as declared at project level and per workspace (the project and the workspace pattern lists are kept separate); they are resolved into effective values by the indexer through the effective graph configuration
- `codeGraphVersion`
- `vcsRoot`
- optional `vcsRef`
- optional `onProgress`
- optional `onEvent`

and MUST return the resulting `IndexResult` unchanged.

### Requirement: Effective size limit resolution

The effective graph configuration built for an indexing run SHALL resolve, for every workspace, one effective `maxFileBytes` (the workspace value, otherwise the project value, otherwise the built-in default of 262144 bytes, with `0` meaning no limit) and one effective set of `largeFilePaths` (the project patterns together with the workspace patterns, each kept with its base directory). This resolution SHALL happen in that single place, including for the configuration bootstrapped when no `specd.yaml` exists, and no other call site SHALL apply the default.

The resolved values SHALL be part of the graph fingerprint inputs, so that changing the limit or the exemptions is detected as a change of the discovery configuration.

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
`workspaces`, optional `configuredWorkspaces`, `graphConfig`, `codeGraphVersion`,
`vcsRoot`, optional `vcsRef`, optional `force`, optional `onProgress`, and optional
`onEvent`; `vcsRoot` and `configuredWorkspaces` (when provided) are forwarded unchanged.

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
