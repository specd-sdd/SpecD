# Verification: Bottom Panel Output

## Requirements

### Requirement: Output is the leading bottom tab

#### Scenario: Output is first tab and default on mount

- **WHEN** Studio shell mounts
- **THEN** Output is the leftmost bottom tab
- **AND** Output is selected

### Requirement: Output lists all local session output entries

#### Scenario: Output panel shows user-facing messages

- **WHEN** shell appends a local output entry after a save
- **THEN** output panel lists the message immediately

### Requirement: shell appends local output on successful actions

#### Scenario: Description save selects Output tab

- **GIVEN** user saved change description from Overview
- **WHEN** shell handles success
- **THEN** Output tab is active
- **AND** a local output line mentions updated description

#### Scenario: Validate appends lines with levels

- **WHEN** validation completes with failures and warnings
- **THEN** each result line is appended to local output
- **AND** failures use level `error` and warnings use level `warn`

### Requirement: local output buffer is capped

#### Scenario: Oldest entries are dropped beyond the cap

- **GIVEN** the local output buffer already contains 400 entries
- **WHEN** a new output entry is appended
- **THEN** buffer size remains 400
- **AND** the oldest prior entry is removed

### Requirement: empty state copy

#### Scenario: Empty output shows action-results placeholder

- **WHEN** studio output stream is empty
- **THEN** placeholder describes saves and studio actions
- **AND** does not claim to be the validation-only panel

### Requirement: view uses local output state and port hooks only

#### Scenario: Output rendering does not depend on remote studio-output fetch

- **WHEN** component renders bottom panel output
- **THEN** it reads from local shell-managed output state
- **AND** remote `SpecdDataPort` access is reserved for project logs/traces

### Requirement: view surfaces local state immediately

#### Scenario: Remote log failure does not clear existing output entries

- **WHEN** a debug trace write or log read fails remotely
- **THEN** already-buffered local output entries remain visible
