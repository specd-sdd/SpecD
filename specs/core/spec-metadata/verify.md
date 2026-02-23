# Verification: Spec Metadata

## Requirements

### Requirement: File location and naming

#### Scenario: Metadata file present

- **WHEN** a spec directory contains a `.specd-metadata.yaml` file
- **THEN** specd reads it to obtain `dependsOn` and `contentHash` for that spec

#### Scenario: Metadata file absent

- **WHEN** a spec directory has no `.specd-metadata.yaml`
- **THEN** specd treats the spec as having no declared dependencies and no content hash — no error is emitted

### Requirement: File format

#### Scenario: Valid metadata file with all fields

- **WHEN** `.specd-metadata.yaml` contains `title`, `description`, `dependsOn`, and `contentHash`
- **THEN** specd parses all four fields; `title` and `description` are available to tooling without reading the spec content

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

### Requirement: LLM authorship

#### Scenario: Agent writes metadata after creating spec

- **WHEN** the LLM agent creates a new spec
- **THEN** it produces a `.specd-metadata.yaml` with the derived `dependsOn` and the current `contentHash` of the spec's requiredSpecArtifacts

#### Scenario: specd does not overwrite metadata

- **WHEN** any specd command runs
- **THEN** specd never rewrites `.specd-metadata.yaml` — only the LLM agent does

### Requirement: Staleness detection

#### Scenario: Content unchanged — no warning

- **WHEN** the current hash of the spec's requiredSpecArtifacts matches `contentHash` in `.specd-metadata.yaml`
- **THEN** no staleness warning is emitted

#### Scenario: Content changed — warning emitted

- **WHEN** a spec's `spec.md` has been modified and its hash no longer matches `contentHash`
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

- **WHEN** `dependsOn` references a spec path that does not exist on disk
- **THEN** specd emits a warning and skips that entry — context compilation continues

#### Scenario: Cycle in dependsOn broken with warning

- **WHEN** spec A lists spec B in `dependsOn` and spec B lists spec A in `dependsOn`
- **THEN** specd detects the cycle, breaks it, emits a warning, and includes both specs only once

### Requirement: Version control

#### Scenario: Metadata committed with spec

- **WHEN** a spec is created or updated and `.specd-metadata.yaml` is written
- **THEN** it appears in `git status` as a tracked file alongside the spec content artifacts
