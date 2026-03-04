# Verification: Spec Metadata

## Requirements

### Requirement: Command signature

#### Scenario: Missing path argument

- **WHEN** `specd spec metadata` is run without a path
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Behaviour

#### Scenario: Fresh hash shown as fresh

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with a `contentHashes` entry for `spec.md` matching the current file on disk
- **WHEN** `specd spec metadata default:auth/login` is run
- **THEN** the `spec.md` line shows `fresh`

#### Scenario: Stale hash shown as STALE

- **GIVEN** `default:auth/login` has `.specd-metadata.yaml` with a `contentHashes` entry for `spec.md` that does not match the current file
- **WHEN** `specd spec metadata default:auth/login` is run
- **THEN** the `spec.md` line shows `STALE`

#### Scenario: Sections with no content omitted in text mode

- **GIVEN** `.specd-metadata.yaml` has no `dependsOn` entries
- **WHEN** `specd spec metadata default:auth/login` is run
- **THEN** the `dependsOn:` section is not printed

### Requirement: Output format

#### Scenario: Text output shows counts for rules, constraints, scenarios

- **GIVEN** `.specd-metadata.yaml` has 3 rules, 2 constraints, and 5 scenarios
- **WHEN** `specd spec metadata default:auth/login` is run
- **THEN** stdout shows `rules: 3`, `constraints: 2`, and `scenarios: 5`

#### Scenario: JSON output includes full rules, constraints, scenarios

- **GIVEN** `.specd-metadata.yaml` has rules, constraints, and scenarios
- **WHEN** `specd spec metadata default:auth/login --format json` is run
- **THEN** stdout is valid JSON with `rules`, `constraints`, and `scenarios` as full arrays, not counts
- **AND** `fresh` at the top level is `true` when all hashes match
- **AND** the process exits with code 0

#### Scenario: JSON fresh field reflects all hashes

- **GIVEN** one of the `contentHashes` entries is stale
- **WHEN** `specd spec metadata default:auth/login --format json` is run
- **THEN** `fresh` at the top level is `false`

### Requirement: Error cases

#### Scenario: Metadata file absent

- **GIVEN** `default:auth/login` exists but has no `.specd-metadata.yaml`
- **WHEN** `specd spec metadata default:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Unknown workspace

- **WHEN** `specd spec metadata unknown-ws:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
