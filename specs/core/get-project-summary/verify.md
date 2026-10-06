# Verification: GetProjectSummary

## Requirements

### Requirement: Returns count-only project summary

#### Scenario: Result contains all count fields without entities

- **GIVEN** a configured project with active changes, drafts, discarded changes, archived changes, and specs across multiple workspaces
- **WHEN** `GetProjectSummary.execute()` is called without enrichment flags
- **THEN** the result includes `activeCount`, `draftCount`, `discardedCount`, `archivedCount`, `specsByWorkspace`, and `workspaceCount`
- **AND** the result does not include `active`, `drafts`, `specsHealth`, or `overlaps` keys
- **AND** the result does not include change entities, spec metadata, graph data, or context payloads

### Requirement: Optional enrichment input flags

#### Scenario: Omitted flags keep count-only behaviour

- **WHEN** `GetProjectSummary.execute()` or `execute({})` is called
- **THEN** list use cases are not invoked for enrichment
- **AND** `GetSpecsHealth` is not invoked
- **AND** `DetectOverlap` is not invoked
- **AND** enrichment keys are absent from the result

### Requirement: Optional active and draft change listings with tasks

#### Scenario: includeChanges returns active and drafts with task totals

- **GIVEN** two active changes and one draft with known task checkbox counts
- **WHEN** `GetProjectSummary.execute({ includeChanges: true })` is called
- **THEN** `active` and `drafts` are present arrays matching those buckets
- **AND** each entry has `name`, `state`, and `tasks.incomplete` / `tasks.total` from `CountTasks`
- **AND** discarded and archived names do not appear in either array

#### Scenario: Empty buckets yield empty arrays when includeChanges is true

- **GIVEN** a project with zero active changes and zero drafts
- **WHEN** `GetProjectSummary.execute({ includeChanges: true })` is called
- **THEN** `active` is `[]`
- **AND** `drafts` is `[]`

#### Scenario: includeChanges false does not invoke CountTasks for enrichment

- **WHEN** `GetProjectSummary.execute({ includeChanges: false })` is called
- **THEN** `CountTasks.execute` is not invoked for summary enrichment
- **AND** `active` and `drafts` keys are absent

### Requirement: Optional specs health enrichment

#### Scenario: includeSpecsHealth embeds GetSpecsHealthResult

- **GIVEN** `GetSpecsHealth.execute({})` returns a health summary with issues
- **WHEN** `GetProjectSummary.execute({ includeSpecsHealth: true })` is called
- **THEN** `specsHealth` equals that result

#### Scenario: includeSpecsHealth false does not invoke GetSpecsHealth

- **WHEN** `GetProjectSummary.execute()` is called without `includeSpecsHealth`
- **THEN** `GetSpecsHealth` is not invoked
- **AND** `specsHealth` is absent

#### Scenario: specsHealth keeps a spec that is in an active change

- **GIVEN** an active change whose `specIds` include `core:get-project-summary`
- **AND** `GetSpecsHealth.execute({})` reports that spec
- **WHEN** `GetProjectSummary.execute({ includeSpecsHealth: true })` is called
- **THEN** `specsHealth` still includes `core:get-project-summary`
- **AND** the use case does not drop or reclassify that spec because it appears in the change

### Requirement: Optional active-change overlap enrichment

#### Scenario: includeOverlaps returns the active-change OverlapReport

- **GIVEN** two active changes share a spec id
- **AND** `DetectOverlap.execute()` with no name returns an `OverlapReport` whose `hasOverlap` is `true`
- **WHEN** `GetProjectSummary.execute({ includeOverlaps: true })` is called
- **THEN** `overlaps` equals that report
- **AND** `DetectOverlap` is invoked without a `name` filter

#### Scenario: includeOverlaps with no overlap returns an empty report

- **GIVEN** active changes do not share spec ids
- **AND** `DetectOverlap.execute()` returns an `OverlapReport` with empty `entries` and `hasOverlap` `false`
- **WHEN** `GetProjectSummary.execute({ includeOverlaps: true })` is called
- **THEN** `overlaps` is present
- **AND** `overlaps.entries` is empty
- **AND** `overlaps.hasOverlap` is `false`

#### Scenario: includeOverlaps false omits overlaps and skips DetectOverlap

- **WHEN** `GetProjectSummary.execute({ includeOverlaps: false })` is called
- **THEN** `DetectOverlap` is not invoked
- **AND** the `overlaps` key is absent

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
- **THEN** change-bucket `count()` calls run concurrently with `ListWorkspaces.execute()`
- **AND** per-workspace `specRepo.count()` starts when that workspace list resolves
- **AND** those spec counts do not wait for change-bucket `count()` calls or for `DetectOverlap.execute()` to finish

#### Scenario: Summary does not materialize list entries during counting

- **WHEN** `GetProjectSummary.execute()` runs
- **THEN** it does not invoke list use cases solely to measure returned array lengths

### Requirement: Constructor accepts orchestration dependencies

#### Scenario: Constructor requires count-capable dependencies

- **WHEN** `GetProjectSummary` is instantiated
- **THEN** it receives dependencies sufficient to call `ChangeRepository.count()`, `countDrafts()`, `countDiscarded()`, archive `count()`, and `ListWorkspaces` for per-workspace `SpecRepository.count()`
- **AND** it does not construct repositories or read configuration directly

#### Scenario: Constructor accepts enrichment collaborators

- **WHEN** `GetProjectSummary` is instantiated with enrichment support
- **THEN** it receives dependencies sufficient to invoke `ListChanges`, `ListDrafts`, `CountTasks`, `GetSpecsHealth`, and `DetectOverlap`
- **AND** count fields are still measured via repository `count*` surfaces rather than list `.length`

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
- **AND** `resolveGetProjectSummaryDeps(resolver)` resolves at least `changes`, `archive`, `listWorkspaces`, `listChanges`, `listDrafts`, `countTasks`, `getSpecsHealth`, and `detectOverlap`
- **AND** `detectOverlap` comes from `createDetectOverlap(resolveDetectOverlapDeps(resolver))`
- **AND** the factory delegates to canonical `createGetProjectSummary(deps)`
