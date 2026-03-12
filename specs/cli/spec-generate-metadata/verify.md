# Verification: Spec Generate-Metadata

## Requirements

### Requirement: Command signature

#### Scenario: Missing path argument

- **WHEN** `specd spec generate-metadata` is invoked without a `<specPath>` argument
- **THEN** the command exits with an error

### Requirement: Error — spec not found

#### Scenario: Unknown spec exits 1

- **WHEN** `specd spec generate-metadata core:core/nonexistent --write` is invoked
- **THEN** stderr contains `error: Spec 'core:core/nonexistent' not found`
- **AND** exits with code 1

#### Scenario: Unknown workspace exits 1

- **WHEN** `specd spec generate-metadata fake:auth/login --write` is invoked
- **THEN** stderr contains an `error:` message about the unknown workspace
- **AND** exits with code 1

### Requirement: Error — no metadataExtraction

#### Scenario: Schema has no metadataExtraction

- **WHEN** the core use case returns `hasExtraction: false`
- **THEN** the command writes `error: schema has no metadataExtraction declarations` to stderr
- **AND** exits with code 1

### Requirement: Default output (no --write)

#### Scenario: Text format outputs YAML to stdout

- **GIVEN** the core use case returns metadata with `title: 'Login'` and `generatedBy: 'core'`
- **WHEN** `specd spec generate-metadata auth/login` is invoked without `--write`
- **THEN** stdout contains the YAML representation including `title: Login` and `generatedBy: core`

#### Scenario: JSON format outputs spec and metadata

- **GIVEN** the core use case returns metadata with `title: 'Login'`
- **WHEN** `specd spec generate-metadata auth/login --format json` is invoked
- **THEN** stdout contains a JSON object with `spec: "default:auth/login"` and `metadata` containing the extracted fields

### Requirement: Write mode

#### Scenario: Write persists metadata and confirms

- **WHEN** `specd spec generate-metadata auth/login --write` is invoked
- **THEN** `SaveSpecMetadata` is called with the generated YAML content
- **AND** stdout contains `wrote .specd-metadata.yaml for default:auth/login`

### Requirement: Force flag

#### Scenario: Write with force passes force flag

- **WHEN** `specd spec generate-metadata auth/login --write --force` is invoked
- **THEN** `SaveSpecMetadata` is called with `force: true`

#### Scenario: Force without write exits with error

- **WHEN** `specd spec generate-metadata auth/login --force` is invoked without `--write`
- **THEN** the command writes `error: --force requires --write` to stderr
- **AND** exits with code 1

### Requirement: Error — dependsOn overwrite (write mode)

#### Scenario: dependsOn change in write mode exits 1

- **GIVEN** existing metadata has `dependsOn: [core:config, core:schema-format]`
- **AND** the generated metadata has `dependsOn: [core:change]`
- **WHEN** `specd spec generate-metadata auth/login --write` is invoked without `--force`
- **THEN** the command writes `error: dependsOn would change` to stderr
- **AND** exits with code 1
- **AND** stdout is empty

#### Scenario: Write mode JSON output on dependsOn error

- **GIVEN** existing metadata has `dependsOn: [core:config]`
- **AND** the generated metadata has `dependsOn: [core:change]`
- **WHEN** `specd spec generate-metadata auth/login --write --format json` is invoked without `--force`
- **THEN** the command exits with code 1
- **AND** stderr contains `error: dependsOn would change`
- **AND** stdout is empty

#### Scenario: --write --force bypasses dependsOn check

- **GIVEN** existing metadata has `dependsOn: [core:config]`
- **AND** the generated metadata has `dependsOn: [core:change]`
- **WHEN** `specd spec generate-metadata auth/login --write --force` is invoked
- **THEN** the write succeeds
