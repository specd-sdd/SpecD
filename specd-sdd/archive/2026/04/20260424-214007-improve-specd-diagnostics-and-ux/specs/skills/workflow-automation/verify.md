# Verification: Workflow Automation

## Requirements

### Requirement: Diagnostic Priority

#### Scenario: Agent chooses text format for status checks

- **WHEN** an AI agent needs to check the current status of a change
- **THEN** it SHALL use `specd change status <name> --format text`
- **AND** it MUST NOT use `--format json` as the primary diagnostic tool

### Requirement: Data Extraction

#### Scenario: Agent chooses JSON for tool-call preparation

- **GIVEN** an agent needs to retrieve a list of spec IDs to pass to another tool
- **WHEN** it executes the status check
- **THEN** it SHALL use `--format json` or `--format toon` to ensure robust parsing of the spec ID array

### Requirement: Repair Strategy

#### Scenario: Agent follows repair guide after transition failure

- **GIVEN** a transition from `designing` to `ready` fails with `MISSING_ARTIFACT`
- **WHEN** the CLI output provides a Repair Guide
- **THEN** the agent SHALL execute the recommended command (e.g., `/specd-design`)
- **AND** it MUST NOT attempt to force the transition again without addressing the blocker
