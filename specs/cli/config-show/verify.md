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

- **GIVEN** a config whose `plugins` list contains one entry
- **WHEN** `specd config show` runs in text mode
- **THEN** the output includes a `plugins` section listing the plugin names without a type grouping

#### Scenario: No contributions suffix without allowlist

- **GIVEN** a plugin entry without `contributions`
- **WHEN** `specd config show` runs in text mode
- **THEN** its line shows `(present)` and no `[contributions: ...]` suffix

#### Scenario: TOON output

- **WHEN** `specd config show --format toon` is run
- **THEN** stdout is the `SpecdConfig` object encoded as TOON, including the `plugins` list

#### Scenario: JSON output serializes SpecdConfig directly

- **WHEN** `specd config show --format json` is run
- **THEN** stdout is the `SpecdConfig` object as-is, with `plugins` as the flat list

#### Scenario: Broken plugin does not prevent config show

- **GIVEN** a configured plugin that fails to load
- **WHEN** `specd config show` is run
- **THEN** the config is printed and no plugin is loaded

#### Scenario: contributions allowlist shown

- **GIVEN** a plugin entry with `contributions: ['audit']`
- **WHEN** `specd config show` runs in text mode
- **THEN** its line includes `contributions: audit`

### Requirement: Help text

#### Scenario: Help documents current SpecdConfig fields

- **WHEN** `specd config show --help` is run
- **THEN** the documented JSON shape lists current `SpecdConfig` fields
- **AND** every documented key exists at that level of `SpecdConfig`
- **AND** every key of the workspace, storage and context-entry shapes of `SpecdConfig` is documented

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
