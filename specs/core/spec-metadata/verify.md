# Verification: Spec Metadata

## Requirements

### Requirement: File location and naming

#### Scenario: Metadata file present

- **GIVEN** a spec at `core:core/config` with a `metadata.json` at `.specd/metadata/core/config/metadata.json`
- **WHEN** `metadata(spec)` is called
- **THEN** the result contains the parsed JSON fields

#### Scenario: Metadata file absent

- **GIVEN** no `metadata.json` exists for the spec
- **WHEN** `metadata(spec)` is called
- **THEN** the result is `null`

#### Scenario: Workspace without prefix stores metadata correctly

- **GIVEN** a workspace `skills` with no prefix configured
- **AND** a spec at `skills:get-skill`
- **WHEN** metadata is saved for that spec
- **THEN** the file is stored at `.specd/metadata/skills/get-skill/metadata.json`

#### Scenario: Workspace with prefix stores metadata correctly

- **GIVEN** a workspace `core` with prefix `core` configured
- **AND** a spec at `core:core/config`
- **WHEN** metadata is saved for that spec
- **THEN** the file is stored at `.specd/metadata/core/core/config/metadata.json`

#### Scenario: Explicit metadataPath in workspace config

- **GIVEN** a workspace config with `specs.fs.metadataPath: .specd/metadata`
- **WHEN** metadata is requested for a spec in that workspace
- **THEN** the adapter reads from the configured path at `<metadataPath>/<workspace>/<specPath>/metadata.json`

#### Scenario: Auto-derived metadataPath from VCS root

- **GIVEN** a workspace config with no explicit `specs.fs.metadataPath`
- **AND** the specs path is inside a VCS repository
- **WHEN** the kernel boots
- **THEN** the composition layer resolves the VCS root of `specs.path` and derives `<vcsRoot>/.specd/metadata/` as the metadata path

#### Scenario: NullVcsAdapter fallback for metadataPath

- **GIVEN** a workspace config with no explicit `specs.fs.metadataPath`
- **AND** the specs path is not inside any VCS (NullVcsAdapter returned)
- **WHEN** the kernel boots
- **THEN** the composition layer falls back to `.specd/metadata/` relative to the specs root parent

### Requirement: File format

#### Scenario: Valid metadata file with all fields

- **GIVEN** a `metadata.json` containing `{"title":"Config","description":"Project configuration","dependsOn":["core:core/storage"],"contentHashes":{"spec.md":"sha256:abc..."},"generatedBy":"core"}`
- **WHEN** it is parsed by the lenient schema
- **THEN** all fields are present in the result

#### Scenario: Title absent — fallback to path

- **WHEN** `metadata.yaml` has no `title` field
- **THEN** tooling displays the spec's path (e.g. `core/change`) instead of a title

#### Scenario: Valid metadata file with only dependsOn

- **WHEN** `metadata.yaml` contains `dependsOn: [core/storage]` and `contentHashes` with entries for each file
- **THEN** specd parses `core/storage` as a dependency and uses the per-file hashes for staleness detection

#### Scenario: Empty dependsOn

- **WHEN** `metadata.yaml` contains `dependsOn: []`
- **THEN** the spec has no declared dependencies — no traversal occurs from this spec

#### Scenario: Cross-workspace dependency

- **WHEN** `dependsOn` contains `billing:payments/invoices`
- **THEN** specd resolves the spec from the `billing` workspace's specs root

#### Scenario: Unqualified path resolves to same workspace

- **WHEN** a spec in the `default` workspace has `dependsOn: [auth/login]`
- **THEN** specd resolves `auth/login` within the `default` workspace

### Requirement: Write-time structural validation

#### Scenario: Valid metadata accepted

- **GIVEN** a YAML string with `title: 'Config'`, `description: 'Handles config'`, `keywords: ['lifecycle']`, `dependsOn: ['core:storage']`, and `contentHashes: { 'spec.md': 'sha256:a3f1...64hex' }`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** the file is written successfully

#### Scenario: Missing title rejected

- **GIVEN** a YAML string with `description: 'Some description'` but no `title`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown
- **AND** the file is not written

#### Scenario: Missing description rejected

- **GIVEN** a YAML string with `title: 'Test'` but no `description`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown
- **AND** the file is not written

#### Scenario: Invalid keywords rejected

- **GIVEN** a YAML string with `keywords: ['Valid', 123]`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown indicating keywords must be lowercase strings
- **AND** the file is not written

#### Scenario: Invalid dependsOn format rejected

- **GIVEN** a YAML string with `dependsOn: ['not a valid id!']`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown indicating the spec ID format is invalid
- **AND** the file is not written

#### Scenario: Invalid contentHashes format rejected

- **GIVEN** a YAML string with `contentHashes: { 'spec.md': 'md5:abc' }`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown indicating the hash format is invalid
- **AND** the file is not written

#### Scenario: Invalid rules structure rejected

- **GIVEN** a YAML string with `rules: [{ requirement: '' }]`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown
- **AND** the file is not written

#### Scenario: Invalid scenarios structure rejected

- **GIVEN** a YAML string with `scenarios: [{ requirement: 'X', name: 'Y' }]` (missing `when` and `then`)
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown
- **AND** the file is not written

#### Scenario: Unknown top-level keys allowed

- **GIVEN** a YAML string with `title: 'Test'`, `description: 'A test'`, and `customField: 'value'`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** the file is written successfully — unknown keys are passed through

#### Scenario: Empty content rejected

- **GIVEN** an empty YAML string (no fields)
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** a `MetadataValidationError` is thrown — content must be a YAML mapping with at least `title` and `description`

#### Scenario: Read path remains lenient

- **GIVEN** a `.specd-metadata.yaml` on disk with `keywords: [123, true]` (invalid types)
- **WHEN** `parseMetadata` reads the file
- **THEN** it returns `{}` without throwing — read path never blocks operations

### Requirement: dependsOn overwrite protection

#### Scenario: dependsOn entries removed — error thrown

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:config']`
- **THEN** a `DependsOnOverwriteError` is thrown with `existingDeps` and `incomingDeps`
- **AND** the file is not written

#### Scenario: dependsOn entries added — error thrown

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:config', 'core:schema-format', 'core:change']`
- **THEN** a `DependsOnOverwriteError` is thrown
- **AND** the file is not written

#### Scenario: dependsOn entries replaced — error thrown

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:change', 'core:schema-format']`
- **THEN** a `DependsOnOverwriteError` is thrown
- **AND** the file is not written

#### Scenario: dependsOn dropped entirely — error thrown

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with content that has no `dependsOn`
- **THEN** a `DependsOnOverwriteError` is thrown
- **AND** the file is not written

#### Scenario: Same dependsOn in different order — allowed

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:schema-format', 'core:config']`
- **THEN** the file is written successfully — order is not significant

#### Scenario: dependsOn change with force — allowed

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with `force: true` and content that has `dependsOn: ['core:change']`
- **THEN** the file is written successfully — force bypasses the check

#### Scenario: No existing metadata — new dependsOn allowed

- **GIVEN** no existing metadata for the spec
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:config']`
- **THEN** the file is written successfully

#### Scenario: Existing metadata without dependsOn — new dependsOn allowed

- **GIVEN** existing metadata has no `dependsOn` field
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:config']`
- **THEN** the file is written successfully — adding dependsOn to a spec that had none is allowed

#### Scenario: Error message includes removed and added entries

- **GIVEN** existing metadata has `dependsOn: ['core:config', 'core:schema-format']`
- **WHEN** `SaveSpecMetadata` is executed with content that has `dependsOn: ['core:change']`
- **THEN** the error message includes the removed entries (`core:config`, `core:schema-format`) and the added entry (`core:change`)
- **AND** the message includes a hint to use `--force`

### Requirement: Deterministic generation at archive time

#### Scenario: Metadata generated after archive

- **GIVEN** a change modifies the spec `core/change`
- **WHEN** `ArchiveChange` completes the delta merge and spec sync
- **THEN** core generates metadata for `core/change` using the schema's `metadataExtraction` engine
- **AND** the file contains `title`, `description`, `dependsOn`, `contentHashes`, and any `rules`, `constraints`, `scenarios` extracted from the spec content

#### Scenario: Manifest dependsOn takes priority over extracted

- **GIVEN** a change has `specDependsOn` entries for a spec
- **WHEN** metadata is generated for that spec
- **THEN** `dependsOn` in the written metadata comes from `change.specDependsOn`, not from the extraction engine

#### Scenario: LLM may improve metadata after generation

- **GIVEN** a spec has deterministically generated metadata
- **WHEN** the LLM calls `SaveSpecMetadata` with an improved `description`
- **THEN** the metadata is overwritten — the LLM is free to improve any field

#### Scenario: Generation failure does not block archive

- **GIVEN** extraction produces no `title` for a spec
- **WHEN** `SaveSpecMetadata` rejects the write
- **THEN** the archive is not aborted — the spec path is reported in `staleMetadataSpecPaths`

### Requirement: Staleness detection

#### Scenario: Content unchanged — no warning

- **WHEN** the current hash of the spec's requiredSpecArtifacts matches `contentHashes` in metadata
- **THEN** no staleness warning is emitted

#### Scenario: Content changed — warning emitted

- **WHEN** a spec's `spec.md` has been modified and its hash no longer matches `contentHashes`
- **THEN** specd emits a warning that the spec metadata may be stale and the agent should regenerate it

#### Scenario: Missing contentHashes — treated as stale

- **WHEN** metadata exists but has no `contentHashes` field
- **THEN** specd emits the same staleness warning

#### Scenario: requiredSpecArtifact missing from contentHashes — treated as stale

- **WHEN** a `requiredSpecArtifacts` file exists but has no corresponding entry in `contentHashes`
- **THEN** specd emits a staleness warning

#### Scenario: Stale metadata does not block operations

- **WHEN** metadata is stale
- **THEN** specd emits a warning but does not block any command — the stale `dependsOn` is still used for context traversal

### Requirement: Use by CompileContext

#### Scenario: dependsOn adds context beyond excludes

- **WHEN** `specd.yaml` has `contextExcludeSpecs: ['core/storage']` and a spec's metadata lists `core/storage` in `dependsOn`
- **THEN** `CompileContext` includes `core/storage` — `dependsOn` overrides project-level excludes

#### Scenario: Transitive traversal

- **WHEN** change has `specIds: ['default:auth/login']` and `auth/login` metadata lists `auth/jwt` in `dependsOn`, and `auth/jwt` metadata lists `crypto/keys`
- **THEN** `CompileContext` includes all three: `auth/login`, `auth/jwt`, and `crypto/keys`

#### Scenario: Missing spec in dependsOn skipped with warning

- **WHEN** `dependsOn` references a spec ID that does not exist on disk
- **THEN** specd emits a warning and skips that entry — context compilation continues

#### Scenario: Cycle in dependsOn broken with warning

- **WHEN** spec A lists spec B in `dependsOn` and spec B lists spec A in `dependsOn`
- **THEN** specd detects the cycle, breaks it, emits a warning, and includes both specs only once

### Requirement: Version control

#### Scenario: Metadata committed with project

- **GIVEN** a project with `.specd/metadata/` tracked in version control
- **WHEN** metadata is generated (as `metadata.json`)
- **THEN** the `.json` files are committed alongside specs
- **AND** consumers read them without regeneration
