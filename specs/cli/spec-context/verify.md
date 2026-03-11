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

#### Scenario: Fresh metadata used

- **GIVEN** `default:auth/login` has fresh `.specd-metadata.yaml` with valid content hashes
- **WHEN** `specd spec context default:auth/login` is run
- **THEN** stdout contains the metadata summary (description, rules, constraints, scenarios)
- **AND** no warning is emitted to stderr
- **AND** the process exits with code 0

#### Scenario: Stale metadata falls back to raw artifacts

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with mismatched content hashes
- **WHEN** `specd spec context default:auth/login` is run
- **THEN** stdout contains the metadataExtraction fallback content
- **AND** stderr contains a `warning:` line about stale metadata
- **AND** the process exits with code 0

#### Scenario: Section flags filter output

- **GIVEN** `default:auth/login` has metadata with description, rules, constraints, and scenarios
- **WHEN** `specd spec context default:auth/login --rules --scenarios` is run
- **THEN** stdout contains the rules and scenarios sections
- **AND** stdout does not contain the description or constraints sections

#### Scenario: No section flags includes all sections

- **GIVEN** `default:auth/login` has metadata with all sections populated
- **WHEN** `specd spec context default:auth/login` is run without section flags
- **THEN** stdout contains description, rules, constraints, and scenarios

#### Scenario: --follow-deps includes dependency specs

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with `dependsOn: ["default:auth/shared-errors"]`
- **AND** `default:auth/shared-errors` exists with its own metadata
- **WHEN** `specd spec context default:auth/login --follow-deps` is run
- **THEN** stdout contains a `### Spec: default:auth/login` block followed by a `### Spec: default:auth/shared-errors` block

#### Scenario: --depth limits traversal

- **GIVEN** `default:auth/login` depends on `default:auth/shared-errors` which depends on `default:common/errors`
- **WHEN** `specd spec context default:auth/login --follow-deps --depth 1` is run
- **THEN** stdout contains `default:auth/login` and `default:auth/shared-errors` but not `default:common/errors`

#### Scenario: Cycle detection prevents infinite loop

- **GIVEN** `default:a` depends on `default:b` and `default:b` depends on `default:a`
- **WHEN** `specd spec context default:a --follow-deps` is run
- **THEN** each spec appears at most once in the output
- **AND** the process exits with code 0

### Requirement: Output

#### Scenario: Text header format

- **WHEN** `specd spec context default:auth/login` is run
- **THEN** stdout begins with `### Spec: default:auth/login`

#### Scenario: JSON output — all sections, no deps

- **GIVEN** `default:auth/login` has fresh metadata with all sections
- **WHEN** `specd spec context default:auth/login --format json` is run
- **THEN** stdout is valid JSON with `specs` array containing one entry with `spec`, `title`, `description`, `rules`, `constraints`, `scenarios`, and `stale: false`
- **AND** `warnings` is `[]`

#### Scenario: JSON output — section filter applied

- **WHEN** `specd spec context default:auth/login --constraints --format json` is run
- **THEN** the spec entry in `specs[0]` contains `constraints` but not `rules`, `scenarios`, or `description`

#### Scenario: JSON output — absent section omitted

- **GIVEN** `default:auth/login` has metadata with rules but no scenarios
- **WHEN** `specd spec context default:auth/login --scenarios --format json` is run
- **THEN** the spec entry in `specs[0]` does not contain a `scenarios` key

#### Scenario: JSON output — with dependencies

- **GIVEN** `default:auth/login` depends on `default:auth/shared-errors`
- **WHEN** `specd spec context default:auth/login --follow-deps --format json` is run
- **THEN** `specs` contains two entries: `specs[0]` for `default:auth/login` and `specs[1]` for `default:auth/shared-errors`

### Requirement: Error cases

#### Scenario: Unknown workspace

- **WHEN** `specd spec context unknown-ws:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: No artifacts at path

- **WHEN** `specd spec context default:nonexistent` is run and no files exist at that path
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
