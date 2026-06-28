# SDK Build Project Status Snapshot

## Purpose

`project status --graph` and future API hosts need a single orchestration that combines core project summary data with code-graph health in one call. Today the CLI duplicates this wiring. `buildProjectStatusSnapshot` centralises the cross-package read path in `@specd/sdk`.

## Requirements

### Requirement: buildProjectStatusSnapshot orchestration

`buildProjectStatusSnapshot(ctx: SdkHostContext, options?: BuildProjectStatusSnapshotOptions): Promise<BuildProjectStatusSnapshotResult>` SHALL:

1. Call `ctx.kernel.project.getProjectSummary.execute()` for workspace counts, change/draft/discarded/archive totals, and spec counts per workspace
2. When `options.includeGraph` is `true` (default `false`), call `withOpenGraphProvider(ctx, async (provider) => { ... })`, construct `createGetGraphHealth()` from `@specd/code-graph`, and run `getGraphHealth.execute({ config, provider, codeGraphVersion, workspaces, assertUnlocked: false })` where `config` comes from `ctx.kernel.project.getConfig.execute()` and `workspaces` from `ctx.kernel.project.listWorkspaces.execute()`
3. Return a merged result object containing summary fields plus optional `graphHealth` and `hotspots` when graph data was requested

When graph loading fails (provider open, health query, or hotspots), the function MUST return `graphHealth: null` (and `hotspots: null` when requested) without throwing — hosts treat null as unavailable graph data.

When `includeGraph` is `false`, the function MUST NOT open a graph provider.

### Requirement: Result shape stability

`BuildProjectStatusSnapshotResult` MUST expose:

- `summary` — the `GetProjectSummaryResult` from core
- `graphHealth` — `GetGraphHealthResult | null` (null when graph not requested or unavailable)
- `approvals` — `{ specEnabled: boolean; signoffEnabled: boolean }` derived from `ctx.kernel.project.getConfig.execute()`
- `llmOptimizedContext` — boolean from config

Hotspots MAY be included when `options.includeHotspots` is true and graph is loaded; otherwise omitted or null.

### Requirement: No presenter formatting

The function MUST return structured data only. Text/JSON/toon formatting remains in CLI presenters (change 12).

## Spec Dependencies

- [`sdk:host-context`](../host-context/spec.md) — host context for kernel and provider access
- [`core:get-project-summary`](../../../../specs/core/get-project-summary/spec.md) — project summary use case
- [`code-graph:get-graph-health`](../../../../specs/code-graph/get-graph-health/spec.md) — graph health use case
