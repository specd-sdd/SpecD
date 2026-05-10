# Verification: Config Show

## Requirements

### Requirement: Command signature

#### Scenario: No positional arguments

- **WHEN** `specd config show` is run
- **THEN** the command proceeds without positional arguments

### Requirement: Output format

#### Scenario: artifactRules not shown in text output

- **GIVEN** a config with `artifactRules` set
- **WHEN** `specd config show` runs in text mode
- **THEN** the output does not include an `artifactRules` section

#### Scenario: plugins shown in text output

- **GIVEN** a config with `plugins.agents` containing one entry
- **WHEN** `specd config show` runs in text mode
- **THEN** the output includes a `plugins` section listing the agent names

### Requirement: Sensitive fields

#### Scenario: No sensitive values in config output

- **WHEN** `specd config show` is run
- **THEN** the output contains only filesystem paths, schema references, and boolean flags
- **AND** no redaction is applied

### Requirement: Error cases

#### Scenario: Config not found

- **GIVEN** CWD is not under any directory containing `specd.yaml`
- **WHEN** `specd config show` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message describing the discovery failure
