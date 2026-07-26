# GetProjectSummary

## Purpose

Delivery mechanisms (`project status`, SDK snapshot builders) need consolidated project counts without loading change entities, spec metadata, graph statistics, or compiled context by default. Today each caller orchestrates multiple list use cases and per-workspace counting independently. `GetProjectSummary` provides a single application use case that returns count-only aggregates for the default workspace change buckets and all configured workspaces' spec totals.

Callers that need agent-oriented detail MAY request optional enrichments via execute input flags: active/draft change listings with per-change task progress, and/or specs health. Without those flags, the use case MUST remain on the cheap count-only path.

## Requirements

### Requirement: Returns count-only project summary

`GetProjectSummary.execute(input?)` MUST always return the count fields of `GetProjectSummaryResult`:

- `activeCount` — number of active (non-drafted, non-discarded) changes
- `draftCount` — number of drafted changes
- `discardedCount` — number of discarded changes
- `archivedCount` — number of archived changes
- `specsByWorkspace` — map of workspace name to spec count
- `workspaceCount` — number of configured workspaces

When enrichment flags are omitted or false, the result MUST NOT include `active`, `drafts`, or `specsHealth` keys (absent / TypeScript-optional omitted — not `null`).

The count-only path MUST NOT include change entities, spec metadata, graph data, or context payloads.

### Requirement: Optional enrichment input flags

`GetProjectSummary.execute(input?)` MUST accept an optional input object with:

- `includeChanges?: boolean` — default `false`
- `includeSpecsHealth?: boolean` — default `false`

When both flags are omitted or `false`, behaviour MUST match the count-only path (no list materialization, no specs validation for health).

### Requirement: Optional active and draft change listings with tasks

When `includeChanges` is `true`, the result MUST include:

- `active` — array of entries for every active change
- `drafts` — array of entries for every drafted change

Each entry MUST contain:

- `name` (string) — change slug
- `state` (string) — current lifecycle state
- `tasks` — `{ incomplete: number; total: number }` derived from `CountTasks.execute({ change }).total` (`incomplete` and `total` only; callers that need `complete` MAY compute `total - incomplete`)

Discarded and archived changes MUST NOT appear as listing entries (counts only).

When `includeChanges` is `true` and a bucket is empty, the corresponding array MUST be present and empty (`[]`), not omitted.

Listing assembly MUST:

1. Obtain active rows via `ListChanges.execute()` (or equivalent `ChangeRepository.list()` with the same bootstrap semantics)
2. Obtain draft rows via `ListDrafts.execute()` (or equivalent `ChangeRepository.listDrafts()`)
3. For each listed name, load the change detail required by `CountTasks` (`ChangeRepository.get` / `getDraft` as appropriate)
4. Run `CountTasks.execute({ change })` and project `tasks` from `total`

When `includeChanges` is `false` or omitted, the use case MUST NOT call list use cases, load change details for task counting, or invoke `CountTasks` solely for summary enrichment.

### Requirement: Optional specs health enrichment

When `includeSpecsHealth` is `true`, the result MUST include `specsHealth` set to the `GetSpecsHealthResult` returned by `GetSpecsHealth.execute({})` (project-wide; no workspace filter unless a future input adds one).

When `includeSpecsHealth` is `false` or omitted, the `specsHealth` key MUST be absent and `GetSpecsHealth` MUST NOT be invoked.

### Requirement: Orchestrates existing list use cases

For the always-on count fields, `GetProjectSummary` MUST obtain change counts without materializing full list results:

- `activeCount` — `ChangeRepository.count()`
- `draftCount` — `ChangeRepository.countDrafts()`
- `discardedCount` — `ChangeRepository.countDiscarded()`
- `archivedCount` — `ArchiveRepository.count()` (or `ListArchived` `meta.total` with equivalent bootstrap)

It MUST NOT call `ListChanges.execute()`, `ListDrafts.execute()`, or `ListDiscarded.execute()` solely to measure `.length` of returned arrays for those counts.

`archivedCount` MUST NOT use `items.length` from a paginated list when `meta.total` is available.

List materialization for enrichment is governed exclusively by the `includeChanges` requirement above.

### Requirement: Orchestrates workspace spec counting

`GetProjectSummary` MUST obtain spec counts by delegating to `ListWorkspaces.execute()` and calling `SpecRepository.count()` on each returned workspace's `specRepo`. Results MUST be assembled into `specsByWorkspace` keyed by workspace `name`, preserving declaration order from configuration when iterated.

It MUST NOT invoke `ListSpecs.execute()` or materialize spec list entries solely to count specs.

`workspaceCount` MUST equal the number of workspaces returned by `ListWorkspaces`.

### Requirement: Parallelizes independent queries

`GetProjectSummary.execute()` MUST run independent count operations concurrently (for example via `Promise.all`) so summary assembly does not serialize unrelated I/O.

Change-bucket counts and per-workspace spec counts MAY run in parallel when their repository instances are independent.

### Requirement: Constructor accepts orchestration dependencies

`GetProjectSummary` MUST accept constructor dependencies sufficient to:

- Invoke `ChangeRepository.count()` / `countDrafts()` / `countDiscarded()`
- Invoke `ArchiveRepository.count()` (or equivalent) for archived totals
- Invoke `ListWorkspaces` for per-workspace `SpecRepository.count()`
- When enrichment is supported: invoke `ListChanges` / `ListDrafts` (or equivalent repository list surfaces), load change details for `CountTasks`, invoke `CountTasks`, and invoke `GetSpecsHealth`

It MUST NOT construct repositories or read `specd.yaml` directly.

### Requirement: Factory wires from SpecdConfig

`createGetProjectSummary(config)` in composition MUST construct and wire all dependencies from a resolved `SpecdConfig`, following the same pattern as other `createList*` factories.

### Requirement: Config-based summary wiring preserves complete repository bootstrap semantics

When `createGetProjectSummary(config)` wires `ListChanges`, `ListDrafts`, `ListDiscarded`, and `ListWorkspaces`, the resulting read path MUST preserve complete repository bootstrap semantics for those downstream use cases.

In particular, summary reads MUST inherit schema-driven artifact-type behavior from change repositories and canonical metadata-path behavior from spec repositories through the downstream factories they compose. `GetProjectSummary` MUST NOT introduce an alternate or partial repository bootstrap path that can yield divergent status or count results for the same persisted project state.

### Requirement: Kernel exposes use case

`createKernel()` MUST wire `GetProjectSummary` on `kernel.project.getProjectSummary`.

### Requirement: Config-based factory delegates through resolveGetProjectSummaryDeps

The config-based `createGetProjectSummary(config, options?)` form MUST derive `GetProjectSummaryDeps` through `resolveGetProjectSummaryDeps(resolver)` and then delegate to canonical `createGetProjectSummary(deps)`.

`resolveGetProjectSummaryDeps(resolver)` MUST resolve at least:

- `changes: ChangeRepository`
- `archive: ArchiveRepository`
- `listWorkspaces: ListWorkspaces`
- `listChanges: ListChanges`
- `listDrafts: ListDrafts`
- `countTasks: CountTasks`
- `getSpecsHealth: GetSpecsHealth`

Count fields MUST still be obtained from `ChangeRepository.count()` / `countDrafts()` / `countDiscarded()` and `ArchiveRepository.count()`, never by measuring list result length.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT invoke code-graph providers or context compilation.
- On the count-only path (both enrichment flags false/omitted), the use case MUST NOT load spec metadata, change artifact content, or materialize list entries.
- When `includeChanges` is true, the use case MAY materialize list entries and load change/task artifact content required by `CountTasks`.
- When `includeSpecsHealth` is true, the use case MAY invoke `GetSpecsHealth` (which validates specs).
- The use case MUST NOT mutate configuration, repositories, or stored changes.

## Spec Dependencies

- [`core:list-workspaces`](../list-workspaces/spec.md) — per-workspace spec counting
- [`core:list-changes`](../list-changes/spec.md) — active change listing when `includeChanges`
- [`core:list-drafts`](../list-drafts/spec.md) — draft listing when `includeChanges`
- [`core:list-discarded`](../list-discarded/spec.md) — discarded count semantics / related listing surface
- [`core:list-archived`](../list-archived/spec.md) — archived count semantics
- [`core:count-tasks`](../count-tasks/spec.md) — per-change task incomplete/total when `includeChanges`
- [`core:get-specs-health`](../get-specs-health/spec.md) — specs health when `includeSpecsHealth`
- [`core:kernel`](../kernel/spec.md) — kernel exposure
- [`core:composition-resolver`](../composition-resolver/spec.md) — resolver-backed factory deps
