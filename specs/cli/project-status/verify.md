# Verification: project status command

## Requirements

### Requirement: project status command exists

#### Scenario: Command returns consolidated project state

- **GIVEN** a configured specd project
- **WHEN** the user runs `specd project status`
- **THEN** the output includes project root, schema ref, workspaces, specs, and changes

### Requirement: includes workspace information

#### Scenario: Output includes all workspace details

- **GIVEN** a project with multiple workspaces
- **WHEN** `specd project status` is executed
- **THEN** each workspace shows name, prefix, and ownership

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