# Verification: Spec Invalidate-Metadata

## Requirements

### Requirement: Command signature

#### Scenario: Accepts specPath as argument

- **WHEN** `specd spec invalidate-metadata auth/login` is invoked
- **THEN** the command accepts `<specPath>` as the spec to invalidate

#### Scenario: Supports --config option

- **WHEN** `specd spec invalidate-metadata auth/login --config /tmp/specd.yaml` is run
- **THEN** the command uses the specified config path

### Requirement: Text output

#### Scenario: Successful invalidation in text format

- **WHEN** the invalidation succeeds and format is `text`
- **THEN** the command outputs `invalidated metadata for default:auth/login`

### Requirement: JSON output

#### Scenario: Successful invalidation in JSON format

- **WHEN** the invalidation succeeds and format is `json`
- **THEN** the command outputs `{ "result": "ok", "spec": "default:auth/login" }`

### Requirement: Error — spec not found or no metadata

#### Scenario: Unknown spec exits 1

- **WHEN** the spec does not exist in the workspace
- **THEN** the command writes `error: spec '<specPath>' not found or has no metadata` to stderr and exits with code 1

#### Scenario: No metadata exits 1

- **GIVEN** a spec that exists but has no metadata
- **WHEN** `specd spec invalidate-metadata auth/login` is invoked
- **THEN** the command writes `error: spec 'auth/login' not found or has no metadata` to stderr and exits with code 1
