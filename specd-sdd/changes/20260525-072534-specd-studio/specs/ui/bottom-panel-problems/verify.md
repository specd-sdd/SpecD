# Verification: Bottom Panel Problems

## Requirements

### Requirement: Problems is the middle bottom tab

#### Scenario: Problems tab follows Output

- **WHEN** user views the bottom tab strip
- **THEN** Problems is the second tab after Output
- **AND** precedes Logs

### Requirement: Problems filters studio output by severity

#### Scenario: Warn and error lines appear after validate

- **GIVEN** validation returns a warning line prefixed with `⚠`
- **WHEN** shell appends studio output with level `warn`
- **THEN** Problems panel lists that message
- **AND** Output panel lists all validation lines including info

#### Scenario: Info-only lines do not appear in Problems

- **GIVEN** shell appends an `info` output line
- **WHEN** user opens Problems tab
- **THEN** that line is not listed in Problems

#### Scenario: Workflow blockers stay on Overview

- **GIVEN** `getChangeStatus` reports transition blockers
- **WHEN** status poll updates
- **THEN** blockers render on Overview only
- **AND** Problems content is unchanged

### Requirement: empty state copy

#### Scenario: Empty problems shows correct placeholder

- **WHEN** no warn or error output entries exist
- **THEN** UI shows warnings/errors placeholder text
- **AND** does not mention validation-only copy

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`
- **AND** bottom panel uses `PortStudioPanel` via hooks

### Requirement: view surfaces loading and error states

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** port returns a network or HTTP error
- **WHEN** output poll rejects
- **THEN** UI renders the message instead of stale data
