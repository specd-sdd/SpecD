# Verification: Spec Context

## Requirements

### Requirement: Command signature

#### Scenario: Missing path argument

- **WHEN** `specd spec context` is run without a path
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --depth without --follow-deps

- **WHEN** `specd spec context default:auth/login --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Behaviour

#### Scenario: Full mode is the absolute default

- **GIVEN** `specd.yaml` sets `contextMode: summary`
- **WHEN** `specd spec context <spec-id>` is run
- **THEN** output contains `full` mode sections (Description, Rules, Constraints)
- **AND** the config mode is ignored

#### Scenario: Fresh metadata used in full mode

- **GIVEN** a spec has fresh metadata
- **WHEN** `specd spec context <spec-id>` is run
- **THEN** stdout contains full metadata-derived context

#### Scenario: Stale metadata falls back to raw artifacts

- **GIVEN** a spec has stale metadata
- **WHEN** `specd spec context <spec-id>` is run
- **THEN** stderr contains a stale-metadata warning

#### Scenario: Section flags filter only full-mode output

- **WHEN** `specd spec context <spec-id> --rules --scenarios` is run
- **THEN** output includes Title, Description, Rules, and Scenarios
- **AND** Constraints are omitted

#### Scenario: --follow-deps includes dependency specs

- **GIVEN** a root spec depends on another spec
- **WHEN** `specd spec context <spec-id> --follow-deps` is run
- **THEN** output contains root and dependency entries in `full` mode

### Requirement: Output

#### Scenario: Text output includes explicit mode label

- **WHEN** `specd spec context <spec-id>` is run in text mode
- **THEN** each rendered spec block includes an explicit mode label

#### Scenario: JSON output — full mode includes full sections

- **GIVEN** effective mode is full
- **WHEN** `specd spec context <spec-id> --format json` is run
- **THEN** JSON includes full-mode fields

#### Scenario: JSON output — summary mode omits full content

- **GIVEN** effective mode is summary
- **WHEN** `specd spec context <spec-id> --format json` is run
- **THEN** JSON includes summary fields and omits full content blocks

#### Scenario: JSON output — list mode keeps minimal fields

- **GIVEN** effective mode is list
- **WHEN** `specd spec context <spec-id> --format json` is run
- **THEN** JSON entries remain minimal list-shaped objects

#### Scenario: Default sections in full mode

- **WHEN** `specd spec context <spec-id>` is run without section flags
- **THEN** output includes Title, Description, Rules, and Constraints by default
- **AND** Scenarios are omitted unless explicitly requested

### Requirement: Error cases

#### Scenario: Unknown workspace

- **WHEN** `specd spec context unknown-ws:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: No artifacts at path

- **WHEN** `specd spec context default:nonexistent` is run and no files exist at that path
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
