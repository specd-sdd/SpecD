# Verification: Spec Write-Metadata

## Requirements

### Requirement: Content source

#### Scenario: Reads JSON from stdin

- **GIVEN** valid JSON metadata is piped to stdin
- **WHEN** `specd spec write-metadata auth/login` is run
- **THEN** the metadata is written successfully

#### Scenario: Reads JSON from file

- **GIVEN** a file `meta.json` with valid JSON metadata
- **WHEN** `specd spec write-metadata auth/login --input meta.json` is run
- **THEN** the metadata is written successfully

### Requirement: YAML validation

#### Scenario: Rejects invalid JSON

- **WHEN** `specd spec write-metadata auth/login --input bad.txt` is run with non-JSON content
- **THEN** stderr contains `error: invalid JSON:` and exit code is 1

### Requirement: Text output

#### Scenario: Successful write in text format

- **WHEN** the write succeeds and format is `text`
- **THEN** the command outputs `wrote metadata for default:auth/login`

### Requirement: JSON output

#### Scenario: Successful write in JSON format

- **WHEN** the write succeeds and format is `json`
- **THEN** the command outputs `{ "result": "ok", "spec": "default:auth/login" }`

### Requirement: Error — invalid metadata structure

#### Scenario: Structurally invalid metadata exits 1

- **GIVEN** valid YAML content with `keywords: [123]` (invalid type)
- **WHEN** `specd spec write-metadata auth/login --input /tmp/bad.yaml` is invoked
- **THEN** the command writes `error: Metadata validation failed: ...` to stderr and exits with code 1

### Requirement: Error — spec not found

#### Scenario: Unknown spec exits 1

- **WHEN** the spec does not exist in the workspace
- **THEN** the command writes `error: spec '<specPath>' not found` to stderr and exits with code 1

### Requirement: Error — conflict detected

#### Scenario: Conflict without --force exits 1

- **GIVEN** the metadata file was modified since it was last read
- **WHEN** `specd spec write-metadata auth/login` is invoked without `--force`
- **THEN** the command exits with code 1 and reports the conflict

#### Scenario: Force flag bypasses conflict

- **GIVEN** the metadata file was modified since it was last read
- **WHEN** `specd spec write-metadata auth/login --force` is invoked
- **THEN** the write succeeds and the conflict is ignored

### Requirement: Error — dependsOn overwrite

#### Scenario: dependsOn change without --force exits 1

- **GIVEN** existing metadata has `dependsOn: [core:config, core:schema-format]`
- **AND** incoming YAML has `dependsOn: [core:change]`
- **WHEN** `specd spec write-metadata auth/login --input /tmp/metadata.yaml` is invoked without `--force`
- **THEN** the command writes `error: dependsOn would change` to stderr
- **AND** exits with code 1
- **AND** stdout is empty

#### Scenario: --force bypasses dependsOn check

- **GIVEN** existing metadata has `dependsOn: [core:config]`
- **AND** incoming YAML has `dependsOn: [core:change]`
- **WHEN** `specd spec write-metadata auth/login --input /tmp/metadata.yaml --force` is invoked
- **THEN** the write succeeds
