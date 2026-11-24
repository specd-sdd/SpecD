# Verification: Project Update

## Requirements

### Requirement: Command signature

#### Scenario: Command accepts --format option

- **WHEN** `specd project update --format json` is run
- **THEN** the command accepts `--format` option
- **AND** output is in JSON format

### Requirement: Plugin update step

#### Scenario: Declared plugins are updated

- **GIVEN** `specd.yaml` has `plugins: [{ name: '@specd/plugin-agent-claude' }]`
- **WHEN** `specd project update` is run
- **THEN** each declared plugin is updated through the `UpdatePlugin` use case (not `install()`)
- **AND** the process exits with code 0

#### Scenario: Allowlist is honoured

- **GIVEN** `@acme/x` is declared with `contributions: ['audit']`
- **WHEN** `specd project update` is run
- **THEN** `UpdatePlugin` receives `contributions: ['audit']` for `@acme/x`

#### Scenario: Host opened without plugins and config untouched

- **WHEN** `specd project update` is run
- **THEN** the host is opened with `plugins: false`
- **AND** `specd.yaml` is not modified

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
- **THEN** stdout is valid JSON `{ plugins: [...], hasErrors: false }` where `plugins` holds result objects

### Requirement: Partial failure

#### Scenario: Missing specd.yaml exits with error

- **GIVEN** there is no `specd.yaml` discoverable from the CWD
- **WHEN** `specd project update` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Plugin update error exits non-zero after all plugins are processed

- **GIVEN** two declared plugins and the first one fails to update
- **WHEN** `specd project update` is run
- **THEN** the second plugin is still updated
- **AND** the error is reported for the first plugin
- **AND** `hasErrors` is `true` in JSON output
- **AND** the process exits with code 1
