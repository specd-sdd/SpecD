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

#### Scenario: Spec counts use efficient repository counting

- **WHEN** `specd project status` calculates spec counts
- **THEN** it calls `SpecRepository.count()` for each workspace
- **AND** it does not perform full metadata extraction

### Requirement: includes change counts

#### Scenario: Output includes active changes, drafts, and discarded counts

- **GIVEN** a project with changes, drafts, and discarded changes
- **WHEN** `specd project status` is run
- **THEN** output includes counts for each category

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

### Requirement: supports --graph flag

#### Scenario: Extended graph stats with --graph flag

- **GIVEN** a project with indexed code
- **WHEN** `specd project status --graph` runs
- **THEN** indexed files count, symbols count, and hotspots are included

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
