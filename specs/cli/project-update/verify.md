# Verification: Project Update

## Requirements

### Requirement: Skills update step

#### Scenario: Declared plugins are updated

- **GIVEN** `specd.yaml` has `plugins.agents: [{ name: '@specd/plugin-agent-claude' }]`
- **WHEN** `specd project update` is run
- **THEN** each plugin's `install()` method is called
- **AND** the process exits with code 0

### Requirement: Output on success

#### Scenario: Text output is prefixed with step name

- **WHEN** `specd project update` succeeds with one plugin declared
- **THEN** stdout contains a line starting with `plugins:` followed by the updated plugin info

#### Scenario: Nothing to update prints up-to-date message

- **GIVEN** `specd.yaml` has no `plugins` section
- **WHEN** `specd project update` is run
- **THEN** stdout contains `project is up to date`
- **AND** the process exits with code 0

#### Scenario: JSON output groups results by step

- **WHEN** `specd project update --format json` succeeds
- **THEN** stdout is valid JSON with a `plugins` array containing result objects

### Requirement: Partial failure

#### Scenario: Warnings from skills update do not change exit code

- **GIVEN** one skill is current and one is missing from the bundle
- **WHEN** `specd project update` is run
- **THEN** the current skill is updated
- **AND** the missing skill warning is printed to stderr
- **AND** the process exits with code 0

#### Scenario: Missing specd.yaml exits with error

- **GIVEN** there is no `specd.yaml` discoverable from the CWD
- **WHEN** `specd project update` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
