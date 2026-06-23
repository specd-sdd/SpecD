# Verification: Bottom Panel Logs

## Requirements

### Requirement: Logs is the trailing bottom tab

#### Scenario: Logs is rightmost web bottom tab

- **WHEN** user views the bottom tab strip
- **THEN** Logs is the third tab after Output and Problems

### Requirement: Logs polls readProjectLogs

#### Scenario: Logs panel shows ring entries

- **GIVEN** server received `POST /v1/logs` from studio
- **WHEN** user opens Logs tab
- **THEN** formatted log lines include the posted message

### Requirement: Logs does not duplicate Output

#### Scenario: Trace log uses action id not output body

- **GIVEN** shell appended output with message `Saved proposal.md`
- **WHEN** trace log is written
- **THEN** log message is `save-artifact` (or equivalent action id)
- **AND** log line text is not identical to `Saved proposal.md`

#### Scenario: Save confirmation is not logs-only

- **WHEN** user saves an artifact successfully
- **THEN** confirmation appears in studio output
- **AND** Logs may contain a debug trace but not as the sole user-facing message

### Requirement: empty state copy

#### Scenario: Empty logs shows specd log placeholder

- **WHEN** no log lines are returned
- **THEN** placeholder mentions specd log entries

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component uses readProjectLogs hook

- **WHEN** Logs tab is mounted
- **THEN** data comes from `SpecdDataPort.readProjectLogs`

### Requirement: view surfaces loading and error states

#### Scenario: Failed log fetch shows error

- **GIVEN** `GET /v1/logs` fails
- **WHEN** hook rejects
- **THEN** UI shows a human-readable error
