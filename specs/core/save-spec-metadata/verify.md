# Verification: SaveSpecMetadata

## Requirements

### Requirement: Input contract

#### Scenario: execute accepts SaveSpecMetadataInput

- **WHEN** `SaveSpecMetadata.execute` is called
- **THEN** it accepts `SaveSpecMetadataInput` with `workspace` (string, required), `specPath` (SpecPath, required), `content` (string, required), `force` (optional)

### Requirement: Output contract

#### Scenario: Successful write returns spec label

- **GIVEN** valid content, existing workspace, and existing spec
- **WHEN** `execute()` succeeds
- **THEN** the result is `SaveSpecMetadataResult` containing `spec` (qualified spec label)

### Requirement: Content validation before write

#### Scenario: Non-object JSON is rejected

- **GIVEN** a valid spec exists
- **WHEN** `SaveSpecMetadata` is called with `content: '"just a string"'`
- **THEN** it throws `MetadataValidationError` with message containing `content must be a JSON object`

#### Scenario: Invalid JSON content is rejected

- **GIVEN** a valid spec exists
- **WHEN** `SaveSpecMetadata` is called with `content: "not json at all"`
- **THEN** it throws `MetadataValidationError` with message containing `content must be a JSON object`

#### Scenario: Missing required fields rejected by strict schema

- **GIVEN** valid JSON object content that omits `title`
- **WHEN** `execute()` is called
- **THEN** `MetadataValidationError` is thrown with a message referencing the missing field

#### Scenario: Invalid field types rejected by strict schema

- **GIVEN** JSON content where `keywords` is a string instead of an array
- **WHEN** `execute()` is called
- **THEN** `MetadataValidationError` is thrown with a message referencing the field and type mismatch

#### Scenario: Unknown top-level keys are allowed

- **GIVEN** valid JSON content with all required fields plus an extra key `customField: value`
- **WHEN** `execute()` is called
- **THEN** the write succeeds and the extra key is preserved

### Requirement: Workspace resolution

#### Scenario: Unknown workspace

- **WHEN** `execute()` is called with `workspace: 'nonexistent'`
- **THEN** `WorkspaceNotFoundError` is thrown

### Requirement: Spec existence check

#### Scenario: Spec does not exist in workspace

- **GIVEN** the workspace exists but `specPath` does not match any spec
- **WHEN** `execute()` is called
- **THEN** `SpecNotFoundError` is thrown with the qualified identifier (e.g. `'default:auth/oauth'`)

### Requirement: Conflict detection via originalHash

#### Scenario: Existing metadata hash is captured for conflict detection

- **GIVEN** a spec with existing metadata on disk
- **WHEN** `execute()` is called without `force`
- **THEN** the existing metadata's `originalHash` is captured via `SpecRepository.metadata()`
- **AND** if the repository detects a hash mismatch, `ArtifactConflictError` propagates to the caller

#### Scenario: Force skips existing metadata loading

- **WHEN** `execute()` is called with `force: true`
- **THEN** existing metadata is not loaded
- **AND** `SpecRepository.saveMetadata()` is called with `{ force: true }`

#### Scenario: No existing metadata on disk

- **GIVEN** a spec with no existing metadata
- **WHEN** `execute()` is called without `force`
- **THEN** `originalHash` is `undefined`
- **AND** the write proceeds normally

### Requirement: dependsOn overwrite protection

#### Scenario: Existing dependsOn would be changed

- **GIVEN** existing metadata has `dependsOn: ['core:storage', 'core:config']`
- **AND** incoming content has `dependsOn: ['core:storage']`
- **WHEN** `execute()` is called without `force`
- **THEN** `DependsOnOverwriteError` is thrown

#### Scenario: Same dependsOn in different order is allowed

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:storage']`
- **AND** incoming content has `dependsOn: ['core:storage', 'core:config']`
- **WHEN** `execute()` is called without `force`
- **THEN** the write succeeds

#### Scenario: No existing dependsOn allows any incoming

- **GIVEN** existing metadata has no `dependsOn` field
- **AND** incoming content has `dependsOn: ['core:storage']`
- **WHEN** `execute()` is called without `force`
- **THEN** the write succeeds

#### Scenario: Empty existing dependsOn allows any incoming

- **GIVEN** existing metadata has `dependsOn: []`
- **AND** incoming content has `dependsOn: ['core:storage']`
- **WHEN** `execute()` is called without `force`
- **THEN** the write succeeds

#### Scenario: Force bypasses dependsOn check

- **GIVEN** existing metadata has `dependsOn: ['core:storage']`
- **AND** incoming content has `dependsOn: ['core:other']`
- **WHEN** `execute()` is called with `force: true`
- **THEN** the write succeeds

### Requirement: Sidecar ownership boundary

#### Scenario: SaveSpecMetadata writes metadata without touching sidecar

- **GIVEN** a persisted spec already has `spec-lock.json`
- **WHEN** `SaveSpecMetadata.execute` succeeds
- **THEN** `metadata.json` is written
- **AND** `spec-lock.json` is not created, modified, or deleted by `SaveSpecMetadata`

#### Scenario: Sidecar mismatch handling remains an archive concern

- **GIVEN** a caller provides `metadata.json.dependsOn`
- **AND** archive-time sidecar consistency would need to be checked
- **WHEN** `SaveSpecMetadata.execute` runs outside archive
- **THEN** the use case performs its normal validation and overwrite checks only
- **AND** sidecar consistency is not enforced there

### Requirement: Artifact persistence

#### Scenario: Metadata is saved via saveMetadata

- **WHEN** `execute()` succeeds
- **THEN** `SpecRepository.saveMetadata()` is called with the raw JSON content

### Requirement: Constructor dependencies

#### Scenario: Use case receives dependencies via constructor

- **GIVEN** a `ReadonlyMap<string, SpecRepository>` of spec repositories
- **WHEN** `SaveSpecMetadata` is constructed
- **THEN** it accepts the spec repositories map as its only dependency

#### Scenario: Existing stale metadata hash is still captured for conflict detection

- **GIVEN** a spec with existing persisted metadata on disk
- **AND** `SpecRepository.metadata()` marks that metadata `stale`
- **WHEN** `execute()` is called without `force`
- **THEN** the existing metadata's `originalHash` is still captured via `SpecRepository.metadata()`
- **AND** that hash is passed to `SpecRepository.saveMetadata()` for optimistic concurrency

#### Scenario: Existing stale dependsOn would still be changed

- **GIVEN** existing persisted metadata has `dependsOn: ['core:storage', 'core:config']`
- **AND** that metadata file is marked stale
- **AND** incoming content has `dependsOn: ['core:storage']`
- **WHEN** `execute()` is called without `force`
- **THEN** `DependsOnOverwriteError` is thrown

#### Scenario: Force still bypasses stale overwrite protection

- **GIVEN** existing persisted metadata has `dependsOn: ['core:storage']`
- **AND** that metadata file is marked stale
- **AND** incoming content has `dependsOn: ['core:other']`
- **WHEN** `execute()` is called with `force: true`
- **THEN** the write succeeds
