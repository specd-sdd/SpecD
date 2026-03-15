# Verification: Change Context

## Requirements

### Requirement: Command signature

#### Scenario: Missing step argument

- **WHEN** `specd change context my-change` is run without the step
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --depth without --follow-deps

- **WHEN** `specd change context my-change designing --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output

#### Scenario: Context block printed verbatim

- **WHEN** `specd change context my-change designing` is run
- **THEN** stdout contains the compiled context block exactly as returned by CompileContext
- **AND** no framing headers are added
- **AND** the process exits with code 0

#### Scenario: dependsOn not followed by default

- **GIVEN** a spec in the change's context has `.specd-metadata.yaml` with `dependsOn` entries pointing to other specs
- **WHEN** `specd change context my-change implementing` is run without `--follow-deps`
- **THEN** the dependent specs are not included in the output

#### Scenario: --follow-deps includes transitive dependencies

- **GIVEN** a spec in context has `dependsOn` entries pointing to other specs
- **WHEN** `specd change context my-change implementing --follow-deps` is run
- **THEN** the context block includes content from the dependent specs as well

#### Scenario: --depth limits traversal

- **GIVEN** spec A depends on spec B which depends on spec C
- **WHEN** `specd change context my-change implementing --follow-deps --depth 1` is run
- **THEN** the output includes content from spec B but not spec C

#### Scenario: Section flags filter spec content

- **GIVEN** specs in context have description, rules, constraints, and scenarios in their metadata
- **WHEN** `specd change context my-change implementing --rules --constraints` is run
- **THEN** the context block contains rules and constraints sections from each spec
- **AND** description and scenarios sections are not present

#### Scenario: No section flags includes all sections

- **GIVEN** specs in context have all metadata sections populated
- **WHEN** `specd change context my-change implementing` is run without section flags
- **THEN** the context block contains description, rules, constraints, and scenarios from each spec

### Requirement: Step availability warning

#### Scenario: Step not yet available

- **GIVEN** the step `implementing` has blocking artifacts
- **WHEN** `specd change context my-change implementing` is run
- **THEN** stderr contains a `warning:` line listing the blocking artifacts
- **AND** stdout still contains the context block
- **AND** the process exits with code 0

### Requirement: Context warnings

#### Scenario: Stale metadata warning

- **GIVEN** a spec included in context has stale metadata
- **WHEN** `specd change context my-change designing` is run
- **THEN** stderr contains a `warning:` line for the stale spec
- **AND** the context block is still printed to stdout
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change context nonexistent designing` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output

#### Scenario: JSON output contains contextBlock and warnings

- **WHEN** `specd change context my-change designing --format json` is run
- **THEN** stdout is valid JSON with `contextBlock`, `stepAvailable`, `blockingArtifacts`, and `warnings`
- **AND** `contextBlock` contains the compiled context text
- **AND** the process exits with code 0
