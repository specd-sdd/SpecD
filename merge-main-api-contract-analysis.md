# Merge `main` Contract Analysis

Base used for this review:

- Merge integrated against local `main` / `origin/main` at `f5b2cda7`.
- I could not refresh from GitHub because this environment does not have valid SSH auth for `git@github.com`.
- `api` and `client` typechecks did not emit errors with the current local declarations, but this analysis is based primarily on source-level review of the merged tree.

## Executive Summary

The merge from `main` brought in three groups of contract changes that matter for this branch:

1. `core` now exposes more remote-safe change operations and more status data.
2. archived-change contracts were split into fast index entries vs full archived detail read models.
3. `core`/`cli` now include project/spec metadata operations and workspace-listing capabilities that are not yet surfaced through `api`.
4. `code-graph` now has richer indexing/search capabilities than the current `api`/`client` DTOs expose.

This branch already absorbed part of group 1:

- `saveArtifact`
- `validateBatch`
- `getReadOnlyChangeArtifact`
- `specDependsOn`
- graph coverage DTOs (`GraphFileRefDto`, `GraphSymbolRefDto`, `GraphSpecCoverageDto`, `ChangeGraphViewDto`)

So the main remaining work is not “fix the merge”, but “finish the contract alignment”.

The most important additional finding from a second pass is that archived-change contracts changed more than they first appeared to. The old mental model of “archived list and archived detail are basically the same shape” is no longer true in `main`.

There is also an architectural alignment point for graph bootstrapping: this branch should stop treating API-side graph preparation as the source of truth. After the merge, graph initialization should follow the same preparation pattern currently used by CLI: resolve workspaces through `kernel.project.listWorkspaces.execute()`, build the effective project graph config from `SpecdConfig`, and then call the code-graph provider with that assembled input.

## What `main` Added Or Changed

### 1. Change/status contracts in `core`

Relevant merged surfaces:

- `GetStatus` now includes `specDependsOn`.
- `Kernel.changes` now includes `saveArtifact`, `validateBatch`, `getReadOnlyChangeArtifact`.
- `Kernel.project` / `Kernel.specs` now expose metadata-oriented operations in the merged code path.

Observed integration status in this branch:

- Already wired in `api`:
  - [packages/api/src/delivery/http/handlers/handler-changes-mutate.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-changes-mutate.ts:1)
  - [packages/api/src/delivery/http/presenters/presenter-change.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/presenters/presenter-change.ts:92)
- Already wired in `client`:
  - [packages/client/src/port-changes-mutate.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/port-changes-mutate.ts:1)
  - [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:236)
  - [packages/client/src/dto/change-detail.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/dto/change-detail.ts:15)
- Already used in UI:
  - [packages/ui/src/change/ChangeSpecsReadonlyPanel.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeSpecsReadonlyPanel.tsx:13)
  - [packages/ui/src/change/ChangeScopeDialog.tsx](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/ui/src/change/ChangeScopeDialog.tsx:57)

Conclusion:

- No major adaptation appears pending here.
- This is the part of the merge that is already substantially aligned.

### 2. Project/spec metadata and workspace contracts

### 2. Archived-change contracts

Relevant merged `core`/`cli` surfaces:

- `ArchivedChange` is no longer a standalone immutable class with its own minimal field set.
- `ArchivedChange` is now a read model extending `ReadOnlyChangeView`.
- `ArchiveRepository.list()` no longer returns `ArchivedChange[]`.
- `ArchiveRepository.list()` now returns paginated `ArchivedChangeIndexEntry[]` plus `meta`.
- `ArchiveRepository.get()` still returns full archived detail, but that detail is now manifest-backed read-only change data.

Relevant merged source:

- [packages/core/src/domain/entities/archived-change.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/domain/entities/archived-change.ts:1)
- [packages/core/src/domain/read-only-change-view.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/domain/read-only-change-view.ts:18)
- [packages/core/src/application/ports/archive-repository.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/application/ports/archive-repository.ts:1)
- [packages/core/src/infrastructure/fs/archive-repository.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/infrastructure/fs/archive-repository.ts:118)

Relevant merged specs:

- [specs/core/archive-repository-port/spec.md](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specs/core/archive-repository-port/spec.md:1)
- [specs/core/get-archived-change/spec.md](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specs/core/get-archived-change/spec.md:1)
- [specs/core/list-archived/spec.md](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specs/core/list-archived/spec.md:1)
- [specs/core/read-only-change-view/spec.md](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specs/core/read-only-change-view/spec.md:1)

What changed semantically:

- archived detail is now part of the same read-only change-view family as drafted/discarded changes
- archived detail includes the shared read-only fields such as:
  - `description`
  - `history`
  - `artifacts` as full read-only artifact structures rather than a plain string list
  - `workspaces`
  - `specDependsOn`
- archived listing is now intentionally lightweight and index-backed:
  - `items: ArchivedChangeIndexEntry[]`
  - `meta: { total, count, limit, page?, startAt? }`

Observed current API/client shape in this branch:

- archived list handler still assumes `listArchived.execute()` returns an array:
  - [packages/api/src/delivery/http/handlers/handler-changes-collection.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-changes-collection.ts:35)
- archived detail handler still serializes an older minimal DTO:
  - [packages/api/src/delivery/http/handlers/handler-archived-changes.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-archived-changes.ts:25)
- client archived DTOs still model list/detail as simplified legacy payloads:
  - [packages/client/src/dto/archived-change.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/dto/archived-change.ts:1)
- client remote adapter still expects `/archived-changes` to return a plain array:
  - [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:122)

Conclusion:

- This branch’s archived-change API/client surface is behind `main`.
- The gap is not just naming; it is a structural contract split:
  - archive list now means index rows
  - archive detail now means full read-only change view
- If Studio relies on archived changes, this is a real alignment task and should be treated as a first-class follow-up.

### 3. Project/spec metadata and workspace contracts

Relevant merged `core`/`cli` surfaces:

- `ListWorkspaces`
- `GetProjectMetadata`
- `UpdateProjectMetadata`
- `UpdateSpecMetadata`

Observed state in this branch:

- `client` already has a workspace-listing surface:
  - [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:518)
  - [packages/client/src/port-workspaces-specs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/port-workspaces-specs.ts:10)
- But `api` does not currently expose dedicated endpoints for:
  - project metadata read/update
  - spec metadata update
  - explicit workspace listing

Relevant current API files:

- [packages/api/src/delivery/http/handlers/handler-project.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-project.ts:1)
- [packages/api/src/delivery/http/presenters/presenter-project.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/presenters/presenter-project.ts:1)

Conclusion:

- If Studio or remote clients need those new metadata flows, `api` is still behind `main`.
- This is a real post-merge follow-up area, not just optional cleanup.

Practical adoption guidance for this branch:

- `ListWorkspaces`: should be treated as adopted from `main`, not re-derived ad hoc in this branch.
- `GetProjectMetadata`, `UpdateProjectMetadata`, `UpdateSpecMetadata`: should be the basis for any new remote metadata flows rather than custom API-side logic.

### 4. Code-graph contracts

This is the biggest remaining mismatch area.

Merged `code-graph` capabilities now include richer search/index surfaces:

- `searchSymbols()` returns `snippet`, `startLine`, `endLine`.
- `searchSpecs()` returns `snippet`, `startLine`, `endLine`.
- `SearchOptions` supports `kinds`, `filePattern`, `excludePaths`, `excludeWorkspaces`, `workspace`.
- indexing now uses richer graph config semantics:
  - project-level `graphConfig`
  - workspace-level overrides

Relevant merged source:

- [packages/code-graph/src/composition/code-graph-provider.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/code-graph/src/composition/code-graph-provider.ts:332)
- [packages/code-graph/src/domain/value-objects/search-options.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/code-graph/src/domain/value-objects/search-options.ts:1)
- [packages/code-graph/src/domain/value-objects/index-options.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/code-graph/src/domain/value-objects/index-options.ts:1)

Observed current API/client shape:

- `api` graph search DTO drops snippet/range information:
  - [packages/api/src/delivery/http/dto/graph-search.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/dto/graph-search.ts:1)
  - [packages/api/src/delivery/http/presenters/presenter-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/presenters/presenter-graph.ts:31)
- `client` graph search input only exposes `kind?: string`, and the remote adapter does not even send it:
  - [packages/client/src/inputs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/inputs.ts:82)
  - [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:615)
- `api` graph search handler accepts only `workspace`, `symbols`, `specs`, `limit`, `q`:
  - [packages/api/src/delivery/http/handlers/handler-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-graph.ts:66)
- `client` impact input does not expose `depth`, even though the API handler supports it and `code-graph` supports `maxDepth`:
  - [packages/client/src/inputs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/inputs.ts:91)
  - [packages/api/src/delivery/http/handlers/handler-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-graph.ts:119)
- `api` impact DTO drops symbol depth and drops richer impact data such as `affectedProcesses`:
  - [packages/api/src/delivery/http/dto/graph-impact.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/dto/graph-impact.ts:1)
  - [packages/code-graph/src/domain/value-objects/impact-result.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/code-graph/src/domain/value-objects/impact-result.ts:1)

Conclusion:

- This branch’s graph API is functional, but it is not yet exposing the richer graph contract that now exists under it.
- This is the area most likely to produce “it works, but Studio can’t use the new contract” problems.
- Graph preparation/bootstrap is also misaligned conceptually if API still tries to own graph initialization details itself.
- After the merge, graph setup should mirror the current CLI assembly flow:
  - `kernel.project.listWorkspaces.execute()`
  - `buildProjectGraphConfig(config, overrides)`
  - `provider.index(indexOptions)`

## Concrete Gaps To Address

### Priority 1: Align archived-change API/client contracts with the merged split model

Why:

- `main` now distinguishes fast archive listing from full archived detail.
- Current API/client code still treats archived changes as a simplified shared shape.

Files to review:

- [packages/api/src/delivery/http/handlers/handler-changes-collection.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-changes-collection.ts:35)
- [packages/api/src/delivery/http/handlers/handler-archived-changes.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-archived-changes.ts:1)
- [packages/api/src/delivery/http/openapi-schemas.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/openapi-schemas.ts:355)
- [packages/client/src/dto/archived-change.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/dto/archived-change.ts:1)
- [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:122)

What to do:

- Change `/archived-changes` to reflect the merged list contract instead of returning a bare array.
- Decide whether the remote API should expose the `meta` pagination block as-is.
- Update archived list DTOs to represent `ArchivedChangeIndexEntry`, not legacy mini-detail.
- Update archived detail DTOs to reflect the newer read-only archived shape.
- Re-check UI archived panels/hooks so they consume the split correctly:
  - summary list from index rows
  - detail view from full archived read model

### Priority 2: Align graph indexing with merged `code-graph` input model

Why:

- The graph indexer now expects project-level graph config semantics, not only the older workspace-target shape.
- The branch should no longer treat API as the owner of graph bootstrap/setup behavior.
- The branch should assemble graph indexing input the same way the CLI does today.

Files to review:

- [packages/api/src/composition/build-graph-index-targets.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/composition/build-graph-index-targets.ts:1)
- [packages/api/src/delivery/http/handlers/handler-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-graph.ts:45)
- [packages/cli/src/commands/graph/index-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/cli/src/commands/graph/index-graph.ts:1)
- [packages/cli/src/commands/graph/build-project-graph-config.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/cli/src/commands/graph/build-project-graph-config.ts:1)

What to do:

- Re-check that `/graph/index` is building the payload expected by the merged `IndexOptions`.
- Make sure project-level graph config and workspace-level graph overrides are forwarded, not silently ignored.
- Verify whether API should stop using its own target-building/bootstrap path and instead mirror the CLI preparation flow.
- Concretely, API-side indexing should be assembled like the CLI currently does:
  - fetch workspaces from `kernel.project.listWorkspaces.execute()`
  - derive `graphConfig` with `buildProjectGraphConfig(config, overrides)`
  - pass those values directly into the code-graph provider index call
- `api` should not invent a parallel graph bootstrap contract when `main` already has an established assembly pattern.

### Priority 3: Expose the richer graph search contract

Why:

- `main` improved graph search result richness.
- Current API strips that extra context before it reaches the client.

Files to review:

- [packages/api/src/delivery/http/dto/graph-search.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/dto/graph-search.ts:1)
- [packages/api/src/delivery/http/presenters/presenter-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/presenters/presenter-graph.ts:31)
- [packages/api/src/delivery/http/openapi-schemas.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/openapi-schemas.ts:495)
- [packages/client/src/dto/graph-search.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/dto/graph-search.ts:1)
- [packages/client/src/inputs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/inputs.ts:82)
- [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:615)

What to do:

- Decide whether the Studio UI needs `snippet`, `startLine`, `endLine`.
- If yes, extend both API and client DTOs.
- Replace or complement `kind?: string` with the merged search contract (`kinds`, and optionally `filePattern`, `excludePaths`, `excludeWorkspaces`).
- Make the remote adapter actually forward the selected filters.

### Priority 4: Expose impact depth and decide how much impact detail the client should see

Why:

- The merged graph engine supports depth-sensitive impact analysis.
- The current client cannot request depth.
- The current DTO also drops per-symbol `depth`.

Files to review:

- [packages/client/src/inputs.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/inputs.ts:91)
- [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:624)
- [packages/api/src/delivery/http/dto/graph-impact.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/dto/graph-impact.ts:1)
- [packages/api/src/delivery/http/presenters/presenter-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/presenters/presenter-graph.ts:58)
- [packages/code-graph/src/domain/value-objects/impact-result.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/code-graph/src/domain/value-objects/impact-result.ts:1)

What to do:

- Add `depth?: number` to client graph impact input.
- Forward `depth` through the remote adapter.
- Decide whether to expose `depth` in `GraphSymbolRefDto` or in an impact-specific symbol DTO.
- Optionally decide whether `affectedProcesses` and file/symbol aggregation should also be exposed.

### Priority 5: Decide whether remote API must surface metadata operations from merged `core`

Why:

- `main` added metadata-oriented capabilities that currently live in `core`/`cli`, but not in `api`.
- If Studio is expected to trigger them remotely, the server contract is incomplete.

Files to review:

- [packages/api/src/delivery/http/handlers/handler-project.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-project.ts:1)
- [packages/api/src/delivery/http/presenters/presenter-project.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/presenters/presenter-project.ts:1)
- [packages/client/src/adapter-remote-specd-data.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/adapter-remote-specd-data.ts:518)

What to do:

- Decide whether Studio only needs the existing `/project` payload, or also:
  - explicit workspace listing
  - project metadata read/update
  - spec metadata update
- If yes, add routes, DTOs, OpenAPI schemas, client ports, and remote adapter methods.

Use-case adoption note:

- For this branch, new remote work in these areas should be built on the merged `core` use cases rather than parallel branch-local orchestration.
- In practice that means preferring:
  - `ListWorkspaces`
  - `GetArchivedChange`
  - `ListArchived`
  - `GetProjectMetadata`
  - `UpdateProjectMetadata`
  - `UpdateSpecMetadata`

### Priority 6: Review semantic `SpecRepository` contract drift where Studio depends on derived metadata

Why:

- `main` replaced raw persisted sidecar access with semantic repository methods.
- This matters indirectly anywhere API/client/studio logic assumes old sidecar semantics or expects metadata-derived graph/context state to behave the old way.

Relevant merged surfaces:

- `readPersistedSchema`
- `readPersistedDependsOn`
- `readPersistedImplementation`
- `specHash`
- `updatePersistedSchema`
- `updatePersistedDependsOn`
- `updatePersistedImplementation`

Files/specs to review:

- [packages/core/src/application/ports/spec-repository.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/core/src/application/ports/spec-repository.ts:1)
- [specs/core/spec-repository-port/spec.md](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specs/core/spec-repository-port/spec.md:1)

What to do:

- Treat raw `spec-lock` structure as an adapter detail, not an application contract.
- When adding new remote metadata/spec endpoints, align them with semantic operations rather than old sidecar assumptions.
- Keep this in mind especially for graph/context refresh flows driven by Studio.

## Things That Look Already In Good Shape

These appear to have survived the merge well and should mainly need regression verification:

- `specDependsOn` plumbing through change detail/status
- read-only artifact retrieval for draft/discarded
- artifact save route
- batch validation route
- graph coverage DTOs for specs and changes
- `listWorkspaces` surface already present in the client abstraction, even if server coverage may still need expanding

Relevant files:

- [packages/api/src/delivery/http/handlers/handler-changes-read.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-changes-read.ts:240)
- [packages/api/src/delivery/http/handlers/handler-changes-mutate.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-changes-mutate.ts:32)
- [packages/api/src/delivery/http/handlers/handler-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/delivery/http/handlers/handler-graph.ts:221)
- [packages/client/src/port-graph.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/port-graph.ts:1)
- [packages/client/src/port-changes-mutate.ts](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/client/src/port-changes-mutate.ts:1)

## Recommended Implementation Order

1. Fix archived-change list/detail contract alignment.
2. Fix graph indexing contract alignment.
3. Expand graph search API/client contract.
4. Expand graph impact API/client contract.
5. Decide whether metadata/workspace endpoints are required for this branch.
6. Run targeted API/client/UI verification for archived-change flows and the already-integrated change/artifact/status flows.

## Suggested Follow-Up Checks

- API-focused:
  - archived changes list endpoint
  - archived change detail endpoint
  - graph index endpoint
  - graph search endpoint
  - graph impact endpoint
  - project endpoints
- Client-focused:
  - archived list/detail DTO parity
  - remote adapter query forwarding
  - DTO/OpenAPI parity
- UI-focused:
  - archived change summary/detail behavior
  - any graph result list that would benefit from snippets/depth
  - any workspace/metadata flows expected by Studio
