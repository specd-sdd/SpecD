# Verification: GetProjectSummary

## Requirements

### Requirement: Returns count-only project summary

#### Scenario: Result contains all count fields without entities

- **GIVEN** a configured project with active changes, drafts, discarded changes, archived changes, and specs across multiple workspaces
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** the result includes `activeCount`, `draftCount`, `discardedCount`, `archivedCount`, `specsByWorkspace`, and `workspaceCount`
- **AND** the result does not include change entities, spec metadata, graph data, or context payloads

### Requirement: Orchestrates existing list use cases

#### Scenario: Active count matches ListChanges length

- **GIVEN** `ListChanges.execute()` returns three active changes
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `activeCount` is `3`

#### Scenario: Draft count matches ListDrafts length

- **GIVEN** `ListDrafts.execute()` returns two drafts
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `draftCount` is `2`

#### Scenario: Discarded count matches ListDiscarded length

- **GIVEN** `ListDiscarded.execute()` returns one discarded change
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `discardedCount` is `1`

#### Scenario: Archived count uses ArchiveListResult meta total

- **GIVEN** `ListArchived.execute()` returns `{ items: [...], meta: { total: 5, count: 5, limit: 100 } }`
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `archivedCount` is `5`
- **AND** `archivedCount` is not derived from `items.length` when pagination limits returned items

### Requirement: Orchestrates workspace spec counting

#### Scenario: Spec counts keyed by workspace name

- **GIVEN** `ListWorkspaces.execute()` returns workspaces `default` (3 specs) and `core` (10 specs)
- **WHEN** `GetProjectSummary.execute()` is called
- **THEN** `specsByWorkspace` is `{ default: 3, core: 10 }`
- **AND** `workspaceCount` is `2`

### Requirement: Parallelizes independent queries

#### Scenario: Independent list operations run concurrently

- **WHEN** `GetProjectSummary.execute()` runs
- **THEN** list use case calls and per-workspace `count()` operations are not serialized behind unrelated awaits

### Requirement: Constructor accepts orchestration dependencies

#### Scenario: Constructor requires injected list use cases

- **WHEN** `GetProjectSummary` is instantiated
- **THEN** it requires `ListChanges`, `ListDrafts`, `ListDiscarded`, `ListArchived`, and `ListWorkspaces` as constructor dependencies
- **AND** it does not construct repositories or read configuration directly

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
