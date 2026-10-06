# Verification: project status command

## Requirements

### Requirement: project status command exists

#### Scenario: Command returns consolidated project state

- **GIVEN** a configured specd project
- **WHEN** the user runs `specd project status`
- **THEN** the output includes project root, schema ref, workspaces, specs, and changes

### Requirement: includes workspace information

#### Scenario: Workspaces obtained from orchestrator

- **WHEN** `specd project status` is executed
- **THEN** it obtains the list of workspaces via `ListWorkspaces`
- **AND** the output includes rich information for each orchestrated workspace

### Requirement: includes spec counts

#### Scenario: Spec counts use GetProjectSummary

- **WHEN** `specd project status` calculates spec counts
- **THEN** spec counts come from `buildProjectStatusSnapshot` / `GetProjectSummary`
- **AND** the handler does not call `kernel.project.getProjectSummary.execute()` beside the snapshot
- **AND** it does not call `SpecRepository.count()` directly or orchestrate `ListWorkspaces` for counting
- **AND** it does not perform full metadata extraction

### Requirement: includes change counts

#### Scenario: Output shows active, drafts, discarded, and archived counts

- **GIVEN** a project with active changes, drafts, discarded, and archived entries
- **WHEN** `specd project status` runs
- **THEN** output includes counts for active, drafts, discarded, and archived

#### Scenario: Counts obtained via enriched snapshot summary

- **WHEN** `specd project status` runs
- **THEN** change counts come from `buildProjectStatusSnapshot` / `GetProjectSummary`
- **AND** the handler does not call list use cases directly for counting

#### Scenario: Active and draft listings always present

- **GIVEN** a project with at least one active change that has task checkboxes
- **WHEN** `specd project status` runs
- **THEN** output includes active and drafts listings with `name`, `state`, and task incomplete/total
- **AND** the snapshot was requested with `includeChanges: true`

### Requirement: includes specs health (always)

#### Scenario: Specs health always requested and shown

- **WHEN** `specd project status` runs
- **THEN** the snapshot is requested with `includeSpecsHealth: true`
- **AND** output includes `specsHealth` aggregates (`totalSpecs`, `passed`, `failed`, `warned`) and `issues` when present

#### Scenario: Text mode uses word labels for health counters

- **WHEN** `specd project status` runs with default text format
- **THEN** the specs-health summary line includes the labels `ok`, `failed`, and `warning` (not glyph-only markers such as `✓` / `✗` / `⚠`)
- **AND** json/toon still expose structured `passed` / `failed` / `warned` fields

### Requirement: includes active-change overlaps (always)

#### Scenario: Overlaps always requested from the snapshot

- **GIVEN** active changes share a spec id
- **WHEN** `specd project status` runs
- **THEN** `buildProjectStatusSnapshot` is requested with `includeOverlaps: true` together with `includeChanges: true` and `includeSpecsHealth: true`
- **AND** json/toon output includes root `overlaps` with `hasOverlap` `true` and the shared `specId`, copied from `snapshot.summary.overlaps`
- **AND** the command does not call `GetProjectSummary` or `DetectOverlap` beside the snapshot

#### Scenario: Empty overlap report is still shown

- **GIVEN** active changes do not share spec ids
- **WHEN** `specd project status` runs
- **THEN** root `overlaps` is present
- **AND** `entries` is empty
- **AND** `hasOverlap` is `false`

#### Scenario: Text lists spec ids and change names

- **GIVEN** an overlap entry for `core:get-project-summary` involving changes `alpha` and `beta`
- **WHEN** `specd project status` runs in text mode
- **THEN** the text lists `core:get-project-summary`, `alpha`, and `beta`
- **AND** json/toon keep the structured `OverlapReport` fields on the command root `overlaps`, copied from `snapshot.summary.overlaps`

### Requirement: help schema matches the command payload

#### Scenario: Help schema shows overlaps and approval field names

- **WHEN** `specd project status --help` is shown
- **THEN** the JSON/TOON schema lists `overlaps` with `hasOverlap` and `entries` and does not mark it optional
- **AND** approvals are `specEnabled` and `signoffEnabled`
- **AND** each workspace entry includes `name`, `prefix`, `ownership`, `isExternal`, and `codeRoot`

### Requirement: includes approval gates

#### Scenario: Output shows approval gate status

- **GIVEN** a project with approval gates enabled
- **WHEN** `specd project status` runs
- **THEN** spec approval and signoff approval status are included

### Requirement: includes graph freshness (always)

#### Scenario: Graph freshness included by default

- **GIVEN** a project with an indexed code graph
- **WHEN** `specd project status` runs without --graph flag
- **THEN** graph staleness and last indexed timestamp are included
- **AND** the command obtains them via `buildProjectStatusSnapshot` with `{ includeGraph: true, includeChanges: true, includeSpecsHealth: true, includeOverlaps: true }`
- **AND** graph data comes exclusively from `@specd/sdk`

### Requirement: supports --graph flag

#### Scenario: Extended graph stats with --graph flag

- **GIVEN** a project with indexed code
- **WHEN** `specd project status --graph` runs
- **THEN** indexed files count, symbols count, and hotspots are included
- **AND** the command calls `buildProjectStatusSnapshot` with `{ includeGraph: true, includeHotspots: true, includeChanges: true, includeSpecsHealth: true, includeOverlaps: true }`

### Requirement: supports --context flag

#### Scenario: Context references with --context flag

- **GIVEN** a project with context configured
- **WHEN** `specd project status --context` runs
- **THEN** context references (instructions, files, specs) are included

#### Scenario: Prefers optimized project context when fresh

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** project-level optimized context is fresh
- **WHEN** `specd project status --context` is run
- **THEN** it displays the optimized context content

#### Scenario: CLI does not build CompileContextConfig inline for --context

- **WHEN** `specd project status --context` is run
- **THEN** the command does not construct a `CompileContextConfig` object from `SpecdConfig`
- **AND** it invokes `GetProjectContext.execute` with runtime overrides only

#### Scenario: Primary context call uses baked defaults

- **GIVEN** `specd project status --context` is executed
- **WHEN** the handler loads project context
- **THEN** it calls `GetProjectContext.execute({})` first

#### Scenario: Raw spec catalogue uses llmOptimizedContext override when optimized context is fresh

- **GIVEN** `llmOptimizedContext` is enabled and optimized project context is fresh
- **WHEN** `specd project status --context` is executed
- **THEN** it calls `GetProjectContext.execute({ llmOptimizedContext: false })` to obtain the raw spec id list

### Requirement: Optimization warning signal

#### Scenario: Displays warning when project cache is stale

- **GIVEN** `llmOptimizedContext: true`
- **AND** project metadata is stale
- **WHEN** `specd project status --context` is run
- **THEN** a `stale-optimization` warning is emitted
- **AND** the message mentions `specd-project-context-optimizer`

### Requirement: includes config flags (always)

#### Scenario: Output always includes config flags

- **GIVEN** a configured specd project
- **WHEN** `specd project status` runs (without any flags)
- **THEN** llmOptimizedContext enabled flag is included
- **AND** spec approval enabled flag is included
- **AND** signoff approval enabled flag is included

### Requirement: defaults to text output

#### Scenario: Default output is text

- **WHEN** `specd project status` runs without --format
- **THEN** output is human-readable plain text

### Requirement: supports json and toon formats

#### Scenario: JSON output is valid

- **WHEN** `specd project status --format json` runs
- **THEN** output is valid JSON

#### Scenario: TOON output is formatted

- **WHEN** `specd project status --format toon` runs
- **THEN** output is TOON-formatted

### Requirement: SDK host bootstrap

#### Scenario: Host context from openSpecdHost

- **WHEN** `specd project status` is executed
- **THEN** it obtains host context via `openSpecdHost` from `@specd/sdk` (directly or through `resolveCliContext`)

### Requirement: No direct repository bootstrap in command handler

#### Scenario: Command handler routes repository-backed reads through SDK host context only

- **WHEN** `project status` assembles repository-backed project information
- **THEN** it obtains that information only through the SDK host context and its project queries
- **AND** it does not construct `ChangeRepository` or `SpecRepository` instances directly
- **AND** it does not assemble an alternate repository bootstrap path with semantics different from the canonical composition-backed status flow
