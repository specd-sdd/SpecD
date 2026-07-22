# Verification: GetProjectSummary

## Requirements

### Requirement: Returns count-only project summary

#### Scenario: Result contains all count fields without entities

- **GIVEN** a configured project with active changes, drafts, discarded changes, archived changes, and specs across multiple workspaces
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** the result includes `activeCount`, `draftCount`, `discardedCount`, `archivedCount`, `specsByWorkspace`, and `workspaceCount`
- **AND** the result does not include change entities, spec metadata, graph data, or context payloads

### Requirement: Orchestrates existing list use cases

#### Scenario: Active count uses ChangeRepository.count()

- **GIVEN** `ChangeRepository.count()` returns `3`
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `activeCount` is `3`
- **AND** `ListChanges.execute()` is not invoked solely to measure length

#### Scenario: Draft count uses ChangeRepository.countDrafts()

- **GIVEN** `ChangeRepository.countDrafts()` returns `2`
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `draftCount` is `2`

#### Scenario: Discarded count uses ChangeRepository.countDiscarded()

- **GIVEN** `ChangeRepository.countDiscarded()` returns `1`
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `discardedCount` is `1`

#### Scenario: Archived count uses meta.total not items.length

- **GIVEN** `ListArchived.execute()` or `ArchiveRepository.count()` yields `{ items: [...], meta: { total: 5, count: 1, limit: 1 } }`
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `archivedCount` is `5`
- **AND** `archivedCount` is not derived from `items.length`

### Requirement: Orchestrates workspace spec counting

#### Scenario: Spec counts keyed by workspace name from count()

- **GIVEN** `ListWorkspaces.execute()` returns workspaces `default` and `core`
- **AND** their `SpecRepository.count()` results are `3` and `10`
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `specsByWorkspace` is `{ default: 3, core: 10 }`
- **AND** `workspaceCount` is `2`
- **AND** `ListSpecs.execute()` is not invoked solely to count specs

#### Scenario: Workspace count matches ListWorkspaces length

- **GIVEN** `ListWorkspaces.execute()` returns three configured workspaces
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `workspaceCount` is `3`

### Requirement: Parallelizes independent queries

#### Scenario: Independent count operations run concurrently

- **WHEN** `GetProjectSummary.execute()` runs
- **THEN** change-bucket `count()` calls and per-workspace spec `count()` operations are not serialized behind unrelated awaits

#### Scenario: Summary does not materialize list entries during counting

- **WHEN** `GetProjectSummary.execute()` runs
- **THEN** it does not invoke list use cases solely to measure returned array lengths

### Requirement: Constructor accepts orchestration dependencies

#### Scenario: Constructor requires count-capable dependencies

- **WHEN** `GetProjectSummary` is instantiated
- **THEN** it receives dependencies sufficient to call `ChangeRepository.count()`, `countDrafts()`, `countDiscarded()`, archive `count()` or `ListArchived` for `meta.total`, and `ListWorkspaces` for per-workspace `SpecRepository.count()`
- **AND** it does not construct repositories or read configuration directly

#### Scenario: Constructor does not require list use cases for counting

- **WHEN** `GetProjectSummary` is instantiated for count-only summary assembly
- **THEN** it is wired to repository count surfaces rather than `ListChanges.execute()` / `ListDrafts.execute()` / `ListDiscarded.execute()` / `ListSpecs.execute()` for measurement

### Requirement: Factory wires from SpecdConfig

#### Scenario: createGetProjectSummary returns wired instance

- **GIVEN** a resolved `SpecdConfig`
- **WHEN** `createGetProjectSummary(config)` is called
- **THEN** it returns a `GetProjectSummary` instance with all dependencies wired from config

### Requirement: Config-based summary wiring preserves complete repository bootstrap semantics

#### Scenario: Summary path inherits complete bootstrap semantics from downstream factories

- **GIVEN** `createGetProjectSummary(config)` wires `ListChanges`, `ListDrafts`, `ListDiscarded`, and `ListWorkspaces` from `SpecdConfig`
- **WHEN** `GetProjectSummary.execute()` is called through that config-based path
- **THEN** change and workspace counts are derived through downstream repositories with complete artifact-type and metadata bootstrap semantics
- **AND** the summary path does not introduce an alternate or partial repository bootstrap that can produce divergent status or count results

### Requirement: Kernel exposes use case

#### Scenario: Kernel project namespace includes getProjectSummary

- **GIVEN** `createKernel(config)` is called
- **WHEN** the returned kernel is inspected
- **THEN** `kernel.project.getProjectSummary` is a `GetProjectSummary` instance

### Requirement: Config-based factory delegates through resolveGetProjectSummaryDeps

#### Scenario: createGetProjectSummary config form derives GetProjectSummaryDeps through resolveGetProjectSummaryDeps

- **WHEN** `createGetProjectSummary(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetProjectSummaryDeps` through `resolveGetProjectSummaryDeps(resolver)`
- **AND** `resolveGetProjectSummaryDeps(resolver)` resolves:
- `listChanges: ListChanges`
- `listDrafts: ListDrafts`
- `listDiscarded: ListDiscarded`
- `listArchived: ListArchived`
- `listWorkspaces: ListWorkspaces`
- **AND** the factory delegates to canonical `createGetProjectSummary(deps)`
