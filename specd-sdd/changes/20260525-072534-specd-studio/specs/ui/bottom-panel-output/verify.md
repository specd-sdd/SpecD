# Verification: Bottom Panel Output

## Requirements

### Requirement: Output is the leading bottom tab

#### Scenario: Output is first tab and default on mount

- **WHEN** Studio shell mounts
- **THEN** Output is the leftmost bottom tab
- **AND** Output is selected
- **AND** `listStudioOutput` polling is enabled

### Requirement: Output lists all studio output entries

#### Scenario: Output panel shows user-facing messages

- **WHEN** shell appends studio output after a save
- **THEN** output panel lists the message after poll/refetch

### Requirement: shell appends on successful actions

#### Scenario: Description save selects Output tab

- **GIVEN** user saved change description from Overview
- **WHEN** shell handles success
- **THEN** Output tab is active
- **AND** a line mentions updated description

#### Scenario: Validate appends lines with levels

- **WHEN** validation completes with failures and warnings
- **THEN** each result line is appended to studio output
- **AND** failures use level `error` and warnings use level `warn`

### Requirement: empty state copy

#### Scenario: Empty output shows action-results placeholder

- **WHEN** studio output stream is empty
- **THEN** placeholder describes saves and studio actions
- **AND** does not claim to be the validation-only panel

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Hook delegates to configured adapter

- **WHEN** component mounts and polls output
- **THEN** calls go through `SpecdDataPort.listStudioOutput`

### Requirement: view surfaces loading and error states

#### Scenario: Hook exposes loading while port call is in flight

- **WHEN** port method is invoked from the component
- **THEN** consumers observe loading state until the promise settles
