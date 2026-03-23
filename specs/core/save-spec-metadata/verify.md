# Verification: SaveSpecMetadata

## Requirements

### Requirement: Content validation before write

#### Scenario: Non-mapping YAML is rejected

- **WHEN** `execute()` is called with `content` that parses to a scalar (e.g. `"hello"`)
- **THEN** `MetadataValidationError` is thrown with a message indicating content must be a YAML mapping
- **AND** nothing is written to disk

#### Scenario: Null YAML content is rejected

- **WHEN** `execute()` is called with `content` that parses to `null` (e.g. an empty string or `"~"`)
- **THEN** `MetadataValidationError` is thrown

#### Scenario: Missing required fields rejected by strict schema

- **GIVEN** valid YAML mapping content that omits `title`
- **WHEN** `execute()` is called
- **THEN** `MetadataValidationError` is thrown with a message referencing the missing field

#### Scenario: Invalid field types rejected by strict schema

- **GIVEN** YAML content where `keywords` is a string instead of an array
- **WHEN** `execute()` is called
- **THEN** `MetadataValidationError` is thrown with a message referencing the field and type mismatch

#### Scenario: Unknown top-level keys are allowed

- **GIVEN** valid YAML content with all required fields plus an extra key `customField: value`
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

### Requirement: Artifact persistence

#### Scenario: Successful write returns spec label

- **GIVEN** valid content, existing workspace, and existing spec with name `auth/oauth` in workspace `default`
- **WHEN** `execute()` is called
- **THEN** the result is `{ spec: 'default:auth/oauth' }`

#### Scenario: Metadata is saved via saveMetadata

- **WHEN** `execute()` succeeds
- **THEN** `SpecRepository.saveMetadata()` is called with the raw YAML content

### Requirement: Constructor dependencies

#### Scenario: Use case receives dependencies via constructor

- **WHEN** `SaveSpecMetadata` is constructed
- **THEN** it receives a `ReadonlyMap<string, SpecRepository>` and a `YamlSerializer`
- **AND** it does not construct any infrastructure adapters internally
