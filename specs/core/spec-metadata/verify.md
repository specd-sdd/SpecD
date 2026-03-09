# Verification: Spec Metadata

## Requirements

### Requirement: File location and naming

#### Scenario: Metadata file present

- **WHEN** a spec directory contains a `.specd-metadata.yaml` file
- **THEN** specd reads it to obtain `dependsOn` and `contentHashes` for that spec

#### Scenario: Metadata file absent

- **WHEN** a spec directory has no `.specd-metadata.yaml`
- **THEN** specd treats the spec as having no declared dependencies and no content hash — no error is emitted

### Requirement: File format

#### Scenario: Valid metadata file with all fields

- **WHEN** `.specd-metadata.yaml` contains `title`, `description`, `keywords`, `dependsOn`, `contentHashes`, `rules`, `constraints`, and `scenarios`
- **THEN** specd parses all fields; `title`, `description`, and `keywords` are available to tooling without reading the spec content

#### Scenario: Title absent — fallback to path

- **WHEN** `.specd-metadata.yaml` has no `title` field
- **THEN** tooling displays the spec's path (e.g. `core/change`) instead of a title

#### Scenario: Valid metadata file with only dependsOn

- **WHEN** `.specd-metadata.yaml` contains `dependsOn: [core/storage]` and `contentHashes` with entries for each file
- **THEN** specd parses `core/storage` as a dependency and uses the per-file hashes for staleness detection

#### Scenario: Empty dependsOn

- **WHEN** `.specd-metadata.yaml` contains `dependsOn: []`
- **THEN** the spec has no declared dependencies — no traversal occurs from this spec

#### Scenario: Cross-workspace dependency

- **WHEN** `dependsOn` contains `billing:payments/invoices`
- **THEN** specd resolves the spec from the `billing` workspace's specs root

#### Scenario: Unqualified path resolves to same workspace

- **WHEN** a spec in the `default` workspace has `dependsOn: [auth/login]`
- **THEN** specd resolves `auth/login` within the `default` workspace

### Requirement: Write-time structural validation

#### Scenario: Valid metadata accepted

- **GIVEN** a YAML string with `title: 'Config'`, `keywords: ['lifecycle']`, `dependsOn: ['core:storage']`, and `contentHashes: { 'spec.md': 'sha256:a3f1...64hex' }`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** the file is written successfully

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

- **GIVEN** a YAML string with `title: 'Test'` and `customField: 'value'`
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** the file is written successfully — unknown keys are passed through

#### Scenario: Empty file accepted

- **GIVEN** an empty YAML string (no fields)
- **WHEN** `SaveSpecMetadata` is executed with that content
- **THEN** the file is written successfully — all fields are optional

#### Scenario: Read path remains lenient

- **GIVEN** a `.specd-metadata.yaml` on disk with `keywords: [123, true]` (invalid types)
- **WHEN** `parseMetadata` reads the file
- **THEN** it returns `{}` without throwing — read path never blocks operations

### Requirement: LLM authorship

#### Scenario: Agent writes metadata after creating spec

- **WHEN** the LLM agent creates a new spec
- **THEN** it produces a `.specd-metadata.yaml` with `title`, `description`, `keywords`, `dependsOn`, `contentHashes`, `rules`, `constraints` (if any), and `scenarios` (if any) derived from the spec content

#### Scenario: specd does not overwrite metadata

- **WHEN** any specd command runs
- **THEN** specd never rewrites `.specd-metadata.yaml` — only the LLM agent does

### Requirement: Staleness detection

#### Scenario: Content unchanged — no warning

- **WHEN** the current hash of the spec's requiredSpecArtifacts matches `contentHashes` in `.specd-metadata.yaml`
- **THEN** no staleness warning is emitted

#### Scenario: Content changed — warning emitted

- **WHEN** a spec's `spec.md` has been modified and its hash no longer matches `contentHashes`
- **THEN** specd emits a warning that the spec metadata may be stale and the agent should regenerate it

#### Scenario: Missing contentHashes — treated as stale

- **WHEN** `.specd-metadata.yaml` exists but has no `contentHashes` field
- **THEN** specd emits the same staleness warning

#### Scenario: requiredSpecArtifact missing from contentHashes — treated as stale

- **WHEN** a `requiredSpecArtifacts` file exists but has no corresponding entry in `contentHashes`
- **THEN** specd emits a staleness warning

#### Scenario: Stale metadata does not block operations

- **WHEN** `.specd-metadata.yaml` is stale
- **THEN** specd emits a warning but does not block any command — the stale `dependsOn` is still used for context traversal

### Requirement: Use by CompileContext

#### Scenario: dependsOn adds context beyond excludes

- **WHEN** `specd.yaml` has `contextExcludeSpecs: ['core/storage']` and a spec's `.specd-metadata.yaml` lists `core/storage` in `dependsOn`
- **THEN** `CompileContext` includes `core/storage` — `dependsOn` overrides project-level excludes

#### Scenario: Transitive traversal

- **WHEN** change has `contextSpecIds: [auth/login]` and `auth/login/.specd-metadata.yaml` lists `auth/jwt` in `dependsOn`, and `auth/jwt/.specd-metadata.yaml` lists `crypto/keys`
- **THEN** `CompileContext` includes all three: `auth/login`, `auth/jwt`, and `crypto/keys`

#### Scenario: Missing spec in dependsOn skipped with warning

- **WHEN** `dependsOn` references a spec ID that does not exist on disk
- **THEN** specd emits a warning and skips that entry — context compilation continues

#### Scenario: Cycle in dependsOn broken with warning

- **WHEN** spec A lists spec B in `dependsOn` and spec B lists spec A in `dependsOn`
- **THEN** specd detects the cycle, breaks it, emits a warning, and includes both specs only once

### Requirement: Version control

#### Scenario: Metadata committed with spec

- **WHEN** a spec is created or updated and `.specd-metadata.yaml` is written
- **THEN** it appears in `git status` as a tracked file alongside the spec content artifacts
