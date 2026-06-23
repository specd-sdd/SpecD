# Verification: Bottom Panel Problems

## Requirements

### Requirement: Problems is the middle bottom tab

#### Scenario: Problems tab follows Output

- **WHEN** user views the bottom tab strip
- **THEN** Problems is the second tab after Output
- **AND** precedes Logs

### Requirement: Problems filters local output by severity

#### Scenario: Warn and error lines appear after validate

- **GIVEN** validation returns a warning line prefixed with `⚠`
- **WHEN** shell appends local output with level `warn`
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

### Requirement: view uses local output state only

#### Scenario: Problems derives from the same local output buffer as Output

- **WHEN** Output and Problems are inspected together
- **THEN** Problems filters the local output buffer
- **AND** no separate remote studio-output fetch is required

### Requirement: view is independent from remote log fetches

#### Scenario: Remote log failure does not block Problems rendering

- **GIVEN** warn/error entries already exist in the local output buffer
- **WHEN** a remote `/logs` request fails
- **THEN** Problems still renders those local entries
