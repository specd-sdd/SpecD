# Verification: Spec Write-Metadata

## Requirements

### Requirement: Content source

#### Scenario: Reads YAML from stdin

- **WHEN** `specd spec write-metadata auth/login` is invoked without `--input`
- **THEN** the command reads all of stdin until EOF and passes the content to the use case

#### Scenario: Reads YAML from file

- **WHEN** `specd spec write-metadata auth/login --input /tmp/metadata.yaml` is invoked
- **THEN** the command reads `/tmp/metadata.yaml` and passes its content to the use case

### Requirement: YAML validation

#### Scenario: Rejects invalid YAML

- **WHEN** the content is not valid YAML (e.g. `{{{`)
- **THEN** the command writes `error: invalid YAML: ...` to stderr and exits with code 1

### Requirement: Text output

#### Scenario: Successful write in text format

- **WHEN** the write succeeds and format is `text`
- **THEN** the command outputs `wrote .specd-metadata.yaml for default:auth/login`

### Requirement: JSON output

#### Scenario: Successful write in JSON format

- **WHEN** the write succeeds and format is `json`
- **THEN** the command outputs `{ "result": "ok", "spec": "default:auth/login" }`

### Requirement: Error — spec not found

#### Scenario: Unknown spec exits 1

- **WHEN** the spec does not exist in the workspace
- **THEN** the command writes `error: spec '<specPath>' not found` to stderr and exits with code 1

### Requirement: Error — conflict detected

#### Scenario: Conflict without --force exits 1

- **GIVEN** the `.specd-metadata.yaml` file was modified since it was last read
- **WHEN** `specd spec write-metadata auth/login` is invoked without `--force`
- **THEN** the command exits with code 1 and reports the conflict

#### Scenario: Force flag bypasses conflict

- **GIVEN** the `.specd-metadata.yaml` file was modified since it was last read
- **WHEN** `specd spec write-metadata auth/login --force` is invoked
- **THEN** the write succeeds and the conflict is ignored
