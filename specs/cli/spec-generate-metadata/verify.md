# Verification: Spec Generate-Metadata

## Requirements

### Requirement: Command signature

#### Scenario: Missing path argument

- **WHEN** `specd spec generate-metadata` is invoked without a `<specPath>` argument
- **THEN** the command exits with an error

#### Scenario: No --write flag accepted

- **WHEN** `specd spec generate-metadata auth/login --write` is invoked
- **THEN** the command exits with an unknown-option error, since the command always regenerates and persists without a separate write flag

#### Scenario: No --status flag accepted

- **WHEN** `specd spec generate-metadata --all --status stale` is invoked
- **THEN** the command exits with an unknown-option error, since `--status` no longer exists

### Requirement: Error — spec not found

#### Scenario: Unknown spec exits 1

- **WHEN** `specd spec generate-metadata core:nonexistent` is invoked
- **THEN** stderr contains `error: Spec 'core:nonexistent' not found`
- **AND** exits with code 1

#### Scenario: Unknown workspace exits 1

- **WHEN** `specd spec generate-metadata fake:auth/login` is invoked
- **THEN** stderr contains an `error:` message about the unknown workspace
- **AND** exits with code 1

### Requirement: Error — no metadataExtraction

#### Scenario: Schema has no metadataExtraction

- **WHEN** the core use case returns `hasExtraction: false`
- **THEN** the command writes `error: schema has no metadataExtraction declarations` to stderr
- **AND** exits with code 1

### Requirement: Output (single spec)

#### Scenario: Text format reports regenerated spec

- **WHEN** `specd spec generate-metadata auth/login` is invoked
- **THEN** it calls `RegenerateSpecMetadata` for `default:auth/login`
- **AND** stdout contains `regenerated metadata for default:auth/login`

#### Scenario: JSON format reports regenerated result

- **WHEN** `specd spec generate-metadata auth/login --format json` is invoked
- **THEN** stdout contains `{ "result": "ok", "spec": "default:auth/login", "regenerated": true }`

### Requirement: Force flag

#### Scenario: Force flag passed through to RegenerateSpecMetadata

- **WHEN** `specd spec generate-metadata auth/login --force` is invoked
- **THEN** `RegenerateSpecMetadata` is called with `force: true`

#### Scenario: Omitting --force keeps standard conflict detection

- **WHEN** `specd spec generate-metadata auth/login` is invoked without `--force`
- **THEN** `RegenerateSpecMetadata` is called with `force` not set to `true`
- **AND** standard conflict detection against the observed revision applies

### Requirement: Error — dependsOn overwrite

#### Scenario: dependsOn change exits 1

- **GIVEN** existing metadata has `dependsOn: [core:config, core:schema-format]`
- **AND** the regenerated metadata has `dependsOn: [core:change]`
- **WHEN** `specd spec generate-metadata auth/login` is invoked without `--force`
- **THEN** the command writes `error: dependsOn would change` to stderr
- **AND** exits with code 1
- **AND** stdout is empty

#### Scenario: JSON output on dependsOn error

- **GIVEN** existing metadata has `dependsOn: [core:config]`
- **AND** the regenerated metadata has `dependsOn: [core:change]`
- **WHEN** `specd spec generate-metadata auth/login --format json` is invoked without `--force`
- **THEN** the command exits with code 1
- **AND** stderr contains `error: dependsOn would change`
- **AND** stdout is empty

#### Scenario: --force bypasses dependsOn check

- **GIVEN** existing metadata has `dependsOn: [core:config]`
- **AND** the regenerated metadata has `dependsOn: [core:change]`
- **WHEN** `specd spec generate-metadata auth/login --force` is invoked
- **THEN** the write succeeds

### Requirement: Batch mode (--all)

#### Scenario: --all with specPath is rejected

- **WHEN** `specd spec generate-metadata core:config --all` is run
- **THEN** stderr contains `error: --all and <specPath> are mutually exclusive`
- **AND** exit code is 1

#### Scenario: --all discovers every spec without ListSpecs and regenerates unfiltered

- **GIVEN** 3 specs exist across two workspaces with varying metadata freshness
- **WHEN** `specd spec generate-metadata --all` is run
- **THEN** every spec is discovered directly through workspace and repository listing, not through `ListSpecs`
- **AND** metadata is forcibly regenerated and persisted for all 3 specs regardless of current freshness
- **AND** a summary line shows `regenerated metadata for 3/3 specs`

#### Scenario: --all with individual failures continues batch

- **GIVEN** 2 specs exist, one will fail with `DependsOnOverwriteError`
- **WHEN** `specd spec generate-metadata --all` is run without `--force`
- **THEN** the failing spec is reported as an error
- **AND** the other spec succeeds
- **AND** exit code is 1
- **AND** summary shows `regenerated metadata for 1/2 specs`

#### Scenario: --all --force skips conflict detection

- **GIVEN** specs with existing `dependsOn` that would otherwise conflict
- **WHEN** `specd spec generate-metadata --all --force` is run
- **THEN** all specs are regenerated without conflict errors

#### Scenario: --all JSON output

- **GIVEN** 2 specs across the project
- **WHEN** `specd spec generate-metadata --all --format json` is run
- **THEN** output is `{ result: "ok", total: 2, succeeded: 2, failed: 0, specs: [...] }`
