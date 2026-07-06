# GetProjectSummary

## Purpose

Delivery mechanisms (`project status`, SDK snapshot builders) need consolidated project counts without loading change entities, spec metadata, graph statistics, or compiled context. Today each caller orchestrates multiple list use cases and per-workspace counting independently. `GetProjectSummary` provides a single application use case that returns count-only aggregates for the default workspace change buckets and all configured workspaces' spec totals.

## Requirements

### Requirement: Returns count-only project summary

`GetProjectSummary.execute()` MUST return a `GetProjectSummaryResult` with:

- `activeCount` — number of active (non-drafted, non-discarded) changes
- `draftCount` — number of drafted changes
- `discardedCount` — number of discarded changes
- `archivedCount` — number of archived changes
- `specsByWorkspace` — map of workspace name to spec count
- `workspaceCount` — number of configured workspaces

The result MUST NOT include change entities, spec metadata, graph data, or context payloads.

### Requirement: Orchestrates existing list use cases

`GetProjectSummary` MUST obtain change counts by delegating to:

- `ListChanges.execute()` for `activeCount`
- `ListDrafts.execute()` for `draftCount`
- `ListDiscarded.execute()` for `discardedCount`
- `ListArchived.execute()` for `archivedCount`

Change counts from `ListChanges`, `ListDrafts`, and `ListDiscarded` MUST be the `.length` of the corresponding result arrays.

`archivedCount` MUST be `meta.total` from the `ArchiveListResult` returned by `ListArchived.execute()` (not `items.length`, because listing may be paginated).

### Requirement: Orchestrates workspace spec counting

`GetProjectSummary` MUST obtain spec counts by delegating to `ListWorkspaces.execute()` and calling `SpecRepository.count()` on each returned workspace's `specRepo`. Results MUST be assembled into `specsByWorkspace` keyed by workspace `name`, preserving declaration order from configuration when iterated.

`workspaceCount` MUST equal the number of workspaces returned by `ListWorkspaces`.

### Requirement: Parallelizes independent queries

`GetProjectSummary.execute()` MUST run independent list and count operations concurrently (for example via `Promise.all`) so summary assembly does not serialize unrelated I/O.

### Requirement: Constructor accepts orchestration dependencies

`GetProjectSummary` MUST accept the five list use cases and `ListWorkspaces` as constructor dependencies. It MUST NOT construct repositories or read `specd.yaml` directly.

### Requirement: Factory wires from SpecdConfig

`createGetProjectSummary(config)` in composition MUST construct and wire all dependencies from a resolved `SpecdConfig`, following the same pattern as other `createList*` factories.

### Requirement: Config-based summary wiring preserves complete repository bootstrap semantics

When `createGetProjectSummary(config)` wires `ListChanges`, `ListDrafts`, `ListDiscarded`, and `ListWorkspaces`, the resulting read path MUST preserve complete repository bootstrap semantics for those downstream use cases.

In particular, summary reads MUST inherit schema-driven artifact-type behavior from change repositories and canonical metadata-path behavior from spec repositories through the downstream factories they compose. `GetProjectSummary` MUST NOT introduce an alternate or partial repository bootstrap path that can yield divergent status or count results for the same persisted project state.

### Requirement: Kernel exposes use case

`createKernel()` MUST wire `GetProjectSummary` on `kernel.project.getProjectSummary`.

### Requirement: Config-based factory delegates through resolveGetProjectSummaryDeps

The config-based `createGetProjectSummary(config, options?)` form MUST derive `GetProjectSummaryDeps` through `resolveGetProjectSummaryDeps(resolver)` and then delegate to canonical `createGetProjectSummary(deps)`.

`resolveGetProjectSummaryDeps(resolver)` MUST resolve:

- `listChanges: ListChanges`
- `listDrafts: ListDrafts`
- `listDiscarded: ListDiscarded`
- `listArchived: ListArchived`
- `listWorkspaces: ListWorkspaces`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT invoke code-graph providers or context compilation.
- The use case MUST NOT load spec metadata or change artifact content.
- The use case MUST NOT mutate configuration, repositories, or stored changes.

## Spec Dependencies

- [`core:list-workspaces`](../list-workspaces/spec.md)
- [`core:list-changes`](../list-changes/spec.md)
- [`core:list-drafts`](../list-drafts/spec.md)
- [`core:list-discarded`](../list-discarded/spec.md)
- [`core:list-archived`](../list-archived/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
