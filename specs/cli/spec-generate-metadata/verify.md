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
- **AND** stdout contains `wrote metadata for default:auth/login`

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

### Requirement: Batch mode (--all)

#### Scenario: --all without --write

- **WHEN** `specd spec generate-metadata --all` is run without `--write`
- **THEN** stderr contains `error: --all requires --write` and exit code is 1

#### Scenario: --all with specPath

- **WHEN** `specd spec generate-metadata core:config --all --write` is run
- **THEN** stderr contains `error: --all and <specPath> are mutually exclusive` and exit code is 1

#### Scenario: --status without --all

- **WHEN** `specd spec generate-metadata --status stale --write` is run without `--all`
- **THEN** stderr contains `error: --status requires --all` and exit code is 1

#### Scenario: --all with default status filter

- **GIVEN** 3 specs exist: one with `stale` metadata, one with `missing` metadata, one with `fresh` metadata
- **WHEN** `specd spec generate-metadata --all --write` is run
- **THEN** metadata is generated and written for the `stale` and `missing` specs only
- **AND** the `fresh` spec is skipped
- **AND** text output shows `wrote metadata for ...` for each processed spec
- **AND** a summary line shows `generated metadata for 2/2 specs`

#### Scenario: --all --status all

- **GIVEN** 3 specs exist with varying metadata status
- **WHEN** `specd spec generate-metadata --all --write --status all` is run
- **THEN** metadata is generated for all 3 specs regardless of status

#### Scenario: --all with individual failures continues batch

- **GIVEN** 2 specs have stale metadata, one will fail with `DependsOnOverwriteError`
- **WHEN** `specd spec generate-metadata --all --write` is run without `--force`
- **THEN** the failing spec is reported as an error
- **AND** the other spec succeeds
- **AND** exit code is 1
- **AND** summary shows `generated metadata for 1/2 specs`

#### Scenario: --all --force skips conflict detection

- **GIVEN** specs with stale metadata and existing `dependsOn`
- **WHEN** `specd spec generate-metadata --all --write --force` is run
- **THEN** all specs are regenerated without conflict errors

#### Scenario: --all JSON output

- **GIVEN** 2 specs with stale metadata
- **WHEN** `specd spec generate-metadata --all --write --format json` is run
- **THEN** output is `{ result: "ok", total: 2, succeeded: 2, failed: 0, specs: [...] }`

#### Scenario: invalid --status value

- **WHEN** `specd spec generate-metadata --all --write --status bogus` is run
- **THEN** stderr contains an error about invalid status value and exit code is 1
