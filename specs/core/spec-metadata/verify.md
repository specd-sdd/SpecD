# Verification: Spec Metadata

## Requirements

### Requirement: File location and naming

#### Scenario: Metadata file present

- **GIVEN** a spec at `core:config` with a `metadata.json` at `.specd/metadata/core/config/metadata.json`
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
- **AND** a spec at `core:config`
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

- **GIVEN** a `metadata.json` containing `{"title":"Config","description":"Project configuration","dependsOn":["core:storage"],"contentHashes":{"spec.md":"sha256:abc..."},"generatedBy":"core"}`
- **WHEN** it is parsed by the lenient schema
- **THEN** all fields are present in the result

#### Scenario: Title absent — fallback to path

- **WHEN** `metadata.json` has no `title` field
- **THEN** tooling displays the spec's path (e.g. `core/change`) instead of a title

#### Scenario: Valid metadata file with only dependsOn

- **WHEN** `metadata.json` contains `"dependsOn": ["core:storage"]` and `contentHashes` with entries for each file
- **THEN** specd parses `core:storage` as a dependency and uses the per-file hashes for staleness detection

#### Scenario: Empty dependsOn

- **WHEN** `metadata.json` contains `"dependsOn": []`
- **THEN** the spec has no declared dependencies — no traversal occurs from this spec

#### Scenario: Cross-workspace dependency

- **WHEN** `dependsOn` contains `billing:payments/invoices`
- **THEN** specd resolves the spec from the `billing` workspace's specs root

#### Scenario: Unqualified path resolves to same workspace

- **WHEN** a spec in the `default` workspace has `"dependsOn": ["auth/login"]`
- **THEN** specd resolves `auth/login` within the `default` workspace

#### Scenario: Generated metadata includes provenance

- **WHEN** metadata is generated for a spec
- **THEN** the document includes a `provenance` object describing the source artifact hashes, `persistedStateHash`, schema identity, `projectionVersion`, and `projectionFingerprint` used to produce it

#### Scenario: optimizedDescription is omitted when its lock baseline is stale

- **GIVEN** the spec-lock optimization baseline for `optimizedDescription` is stale against current artifacts or schema identity
- **WHEN** metadata is generated
- **THEN** `optimizedDescription` is omitted from the generated document rather than fabricated

#### Scenario: generatedBy is always core for newly generated documents

- **WHEN** metadata is generated
- **THEN** `generatedBy` is always `"core"`
- **AND** a legacy document with `generatedBy: "agent"` may still be read leniently for migration

### Requirement: Source provenance

#### Scenario: Provenance records per-artifact hash and diagnostic lastModified

- **WHEN** metadata is generated
- **THEN** `provenance.artifacts` records, for each artifact filename, its content `hash` and a diagnostic `lastModified` stamp

#### Scenario: Provenance records persistedStateHash or null when lock absent

- **GIVEN** a spec with no persisted lock state
- **WHEN** metadata is generated
- **THEN** `provenance.persistedStateHash` is `null`

#### Scenario: Provenance records schema identity, projection version, and projection fingerprint

- **WHEN** metadata is generated
- **THEN** `provenance.schema` records the `PersistedSchemaIdentity` in effect at generation time
- **AND** `provenance.projectionVersion` and `provenance.projectionFingerprint` record the generation/projection contract used

#### Scenario: contentHashes remains derivable from provenance.artifacts

- **WHEN** metadata is generated
- **THEN** the simpler `contentHashes` convenience field does not diverge from `provenance.artifacts`

#### Scenario: lastModified alone is diagnostic, not a freshness input

- **GIVEN** an artifact whose `lastModified` differs but whose content hash is unchanged
- **WHEN** freshness is compared using `provenance`
- **THEN** the comparison relies on `hash`, `persistedStateHash`, `schema`, `projectionVersion`, and `projectionFingerprint` — never `lastModified` alone

### Requirement: Structural validation before persistence

#### Scenario: Valid metadata accepted

- **GIVEN** a JSON object with `title: 'Config'`, `description: 'Handles config'`, `keywords: ['lifecycle']`, `dependsOn: ['core:storage']`, and `contentHashes: { 'spec.md': 'sha256:a3f1...64hex' }`
- **WHEN** `PersistSpecMetadata` validates that content before writing
- **THEN** the file is written successfully

#### Scenario: Missing title rejected

- **GIVEN** a JSON object with `description: 'Some description'` but no `title`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown
- **AND** the file is not written

#### Scenario: Missing description rejected

- **GIVEN** a JSON object with `title: 'Test'` but no `description`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown
- **AND** the file is not written

#### Scenario: Invalid keywords rejected

- **GIVEN** a JSON object with `keywords: ['Valid', 123]`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown indicating keywords must be lowercase strings
- **AND** the file is not written

#### Scenario: Invalid dependsOn format rejected

- **GIVEN** a JSON object with `dependsOn: ['not a valid id!']`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown indicating the spec ID format is invalid
- **AND** the file is not written

#### Scenario: Invalid contentHashes format rejected

- **GIVEN** a JSON object with `contentHashes: { 'spec.md': 'md5:abc' }`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown indicating the hash format is invalid
- **AND** the file is not written

#### Scenario: Invalid rules structure rejected

- **GIVEN** a JSON object with `rules: [{ requirement: '' }]`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown
- **AND** the file is not written

#### Scenario: Invalid scenarios structure rejected

- **GIVEN** a JSON object with `scenarios: [{ requirement: 'X', name: 'Y' }]` (missing `when` and `then`)
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown
- **AND** the file is not written

#### Scenario: Unknown top-level keys allowed

- **GIVEN** a JSON object with `title: 'Test'`, `description: 'A test'`, and `customField: 'value'`
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** the file is written successfully — unknown keys are passed through

#### Scenario: Empty content rejected

- **GIVEN** an empty JSON object (no fields)
- **WHEN** `PersistSpecMetadata` validates that content
- **THEN** a typed validation error is thrown — content must be a JSON object with at least `title` and `description`

#### Scenario: Read path remains lenient

- **GIVEN** a `metadata.json` on disk with `keywords: [123, true]` (invalid types)
- **WHEN** `parseMetadata` reads the file
- **THEN** it returns `{}` without throwing — read path never blocks operations

#### Scenario: Schema supports optimized fields and provenance

- **GIVEN** a metadata object with `optimizedDescription`, `optimizedContext`, and a well-formed `provenance` object
- **WHEN** validated against `strictSpecMetadataSchema`
- **THEN** validation passes

### Requirement: Deterministic generation at archive time

#### Scenario: Metadata generated after archive

- **GIVEN** a change modifies the spec `core:change`
- **WHEN** `ArchiveChange` completes the delta merge and spec sync
- **THEN** core generates metadata for `core:change` using the schema's metadata extraction engine
- **AND** the file contains title, description, `dependsOn`, `contentHashes`, and any rules, constraints, scenarios extracted from the spec content

#### Scenario: Manifest dependsOn takes priority over extracted

- **GIVEN** a change has `specDependsOn` entries for a spec
- **WHEN** metadata is generated for that spec
- **THEN** `dependsOn` in the written metadata comes from `change.specDependsOn`, not from the extraction engine

#### Scenario: Pre-publication extraction checks final persisted dependsOn during full-batch preflight

- **GIVEN** archive has prepared the merged canonical content for a modified spec
- **WHEN** archive determines the final persisted `dependsOn` set for that spec
- **THEN** it runs `extractMetadata()` against the prepared content during the full archive-batch preflight
- **AND** that check completes before canonical publication begins for any spec in the batch

#### Scenario: Metadata-related failure in one spec blocks publication of earlier specs

- **GIVEN** a multi-spec archive batch where one spec has already passed metadata-related checks
- **AND** a later spec in the same batch will fail metadata-related archive validation
- **WHEN** `ArchiveChange.execute` completes metadata-related preflight for the batch
- **THEN** the later failure aborts the archive before canonical publication begins for the earlier spec

#### Scenario: Omitted extraction falls back to the final persisted dependency set

- **GIVEN** a persisted spec is being archived
- **AND** the schema omits `metadataExtraction.dependsOn` for that spec
- **WHEN** archive regenerates metadata
- **THEN** `metadata.json.dependsOn` is written from the final persisted dependency set

#### Scenario: Legacy spec may still derive metadata dependsOn from extraction

- **GIVEN** a persisted legacy spec has no `spec-lock.json`
- **AND** extraction yields `dependsOn`
- **WHEN** a non-archive metadata flow regenerates metadata before opportunistic backfill succeeds
- **THEN** `metadata.json.dependsOn` may still be derived from extraction until sidecar backfill succeeds

#### Scenario: Mismatched extracted dependsOn blocks archive before any batch publication starts

- **GIVEN** archive is sealing the final persisted dependency state for a modified spec
- **AND** the spec may or may not already have a canonical `spec-lock.json`
- **AND** extraction yields a different `dependsOn` value
- **WHEN** archive performs the pre-publication consistency check
- **THEN** archive fails for that spec before canonical publication begins for any spec in the batch

#### Scenario: Generation failure does not block archive

- **GIVEN** extraction produces no title for a spec
- **WHEN** `SaveSpecMetadata` rejects the write
- **THEN** the archive is not aborted
- **AND** the spec path is reported in `staleMetadataSpecPaths`

### Requirement: Sidecar separation

#### Scenario: Metadata and sidecar live in different storage locations

- **GIVEN** a persisted spec has both `metadata.json` and `spec-lock.json`
- **WHEN** their storage locations are inspected
- **THEN** `metadata.json` lives under the configured metadata root
- **AND** `spec-lock.json` lives alongside the canonical persisted `scope: spec` artifacts

#### Scenario: Legacy spec may have metadata without sidecar

- **GIVEN** a legacy persisted spec predates `spec-lock.json`
- **WHEN** tooling reads its metadata state
- **THEN** missing `spec-lock.json` is tolerated until opportunistic backfill creates it

### Requirement: Spec.generatedMetadataStamp is a stamp only

#### Scenario: get stamp does not replace metadata()

- **GIVEN** a spec with generated `metadata.json` on disk
- **WHEN** a caller uses `Spec.generatedMetadataStamp` from `get()`
- **THEN** only `present` and `lastModified` are available
- **AND** parsed metadata content is obtained only via `metadata()`

#### Scenario: Stamp absence does not imply empty metadata document

- **GIVEN** a spec with no generated metadata file
- **WHEN** `get()` returns `generatedMetadataStamp.present === false`
- **THEN** callers MUST treat that as absence of the sidecar
- **AND** MUST NOT interpret it as an empty parsed metadata document

### Requirement: Implementation projection

#### Scenario: Metadata projects archived implementation links from spec-lock

- **GIVEN** a persisted `spec-lock.json` with file-level and symbol-level implementation links
- **WHEN** metadata is generated for that spec
- **THEN** `metadata.json` includes an `implementation` projection derived from the sidecar
- **AND** the sidecar remains the authoritative source

### Requirement: Freshness assessment is application-owned

#### Scenario: Content hash mismatch marks metadata stale

- **GIVEN** persisted metadata's `provenance.artifacts` hash for a file differs from that file's current content hash
- **WHEN** `assessMetadataFreshness` compares persisted and current source state
- **THEN** the result is stale

#### Scenario: persistedStateHash transition to or from absence marks metadata stale

- **GIVEN** persisted metadata's `provenance.persistedStateHash` differs from the spec's current `persistedStateHash(spec)`, including a transition to or from lock absence
- **WHEN** `assessMetadataFreshness` runs
- **THEN** the result is stale

#### Scenario: Schema identity change marks metadata stale

- **GIVEN** persisted metadata's `provenance.schema` differs from the spec's current persisted schema identity
- **WHEN** `assessMetadataFreshness` runs
- **THEN** the result is stale

#### Scenario: Projection version or fingerprint change marks metadata stale

- **GIVEN** persisted metadata's `provenance.projectionVersion` or `provenance.projectionFingerprint` differs from the generator's current values
- **WHEN** `assessMetadataFreshness` runs
- **THEN** the result is stale

#### Scenario: lastModified alone does not cause staleness

- **GIVEN** a persisted artifact's `lastModified` value differs from its current value but its content hash is unchanged
- **WHEN** `assessMetadataFreshness` runs
- **THEN** the metadata is not treated as stale solely because of `lastModified`

#### Scenario: Repository never classifies freshness

- **WHEN** `SpecRepository.readMetadataSnapshot(spec)` is called
- **THEN** the returned `kind` is one of `missing`, `invalid`, or `present`
- **AND** the repository does not compute or return `fresh`/`stale`

#### Scenario: Freshness comparison is used only by MaterializeSpecMetadata

- **WHEN** a repository adapter or ordinary consumer needs a freshness decision
- **THEN** it does not reimplement `assessMetadataFreshness` independently
- **AND** `MaterializeSpecMetadata` is the internal caller that uses the comparison to decide reuse versus regeneration

### Requirement: Use by CompileContext

#### Scenario: dependsOn adds context beyond excludes

- **WHEN** `specd.yaml` has `contextExcludeSpecs: ['core/storage']` and a spec's metadata lists `core/storage` in `dependsOn`
- **THEN** `CompileContext` includes `core/storage` — `dependsOn` overrides project-level excludes

#### Scenario: Transitive traversal

- **WHEN** change has `specIds: ['default:auth/login']` and `auth/login` metadata lists `auth/jwt` in `dependsOn`, and `auth/jwt` metadata lists `crypto/keys`
- **THEN** `CompileContext` includes all three: `auth/login`, `auth/jwt`, and `crypto/keys`

#### Scenario: Canonical metadata dependency projection works without extraction

- **GIVEN** a persisted spec has `metadata.json.dependsOn: ['core:storage']`
- **AND** its schema omits `metadataExtraction.dependsOn`
- **WHEN** a context consumer traverses dependencies
- **THEN** `core:storage` is still discovered from metadata
- **AND** no direct sidecar artifact read is required

#### Scenario: Materialization returns a confirmed-fresh or just-regenerated value

- **GIVEN** a spec whose persisted metadata may be missing, invalid, or stale
- **WHEN** a consumer requests its metadata through `GetSpecMetadata` / `MaterializeSpecMetadata`
- **THEN** the consumer receives a value that is either confirmed fresh or was just regenerated from current source state
- **AND** the consumer does not implement its own missing/stale fallback logic

#### Scenario: readMetadataSnapshot is not used by ordinary consumers for freshness decisions

- **WHEN** `CompileContext` or another context-oriented consumer needs the canonical normalized representation of a persisted spec
- **THEN** it obtains it through Core metadata materialization
- **AND** it does not call `SpecRepository.readMetadataSnapshot()` directly to make a freshness decision

#### Scenario: Missing spec in dependsOn skipped with warning

- **WHEN** `dependsOn` references a spec ID that does not exist on disk
- **THEN** specd emits a warning and skips that entry — context compilation continues

#### Scenario: Cycle in dependsOn broken with warning

- **WHEN** spec A lists spec B in `dependsOn` and spec B lists spec A in `dependsOn`
- **THEN** specd detects the cycle, breaks it, emits a warning, and includes both specs only once

### Requirement: Version control

#### Scenario: New project gitignores the metadata cache directory

- **GIVEN** a newly initialized project
- **WHEN** the metadata cache directory is initialized
- **THEN** a rooted `/.specd/metadata/` entry is added to the project-root `.gitignore`

#### Scenario: Rooted ignore entry does not affect similarly named nested directories

- **GIVEN** a nested directory elsewhere in the repo that happens to be named `.specd/metadata`
- **WHEN** the root `.gitignore` entry `/.specd/metadata/` is evaluated
- **THEN** only the project-root metadata cache directory is ignored

#### Scenario: Existing tracked metadata is not automatically untracked

- **GIVEN** a project that already tracks generated metadata files in Git
- **WHEN** the gitignore entry is added
- **THEN** previously tracked metadata files remain tracked until an explicit one-time migration removes them

#### Scenario: Custom metadataPath is the operator's responsibility

- **GIVEN** a project configures a custom filesystem `metadataPath` outside the default location
- **WHEN** that path is used for generated metadata
- **THEN** runtime does not rewrite `.gitignore` for that custom path
- **AND** keeping it out of version control is the operator's responsibility

#### Scenario: Implementation files projected into metadata

- **GIVEN** a spec with file-level implementation links in the semantic repository
- **WHEN** spec metadata is generated
- **THEN** the `implementation.files` array contains the linked file paths

#### Scenario: Implementation symbols projected into metadata

- **GIVEN** a spec with symbol-level implementation links in the semantic repository
- **WHEN** spec metadata is generated
- **THEN** the `implementation.symbols` array contains the linked symbol identities

#### Scenario: Semantic repository source prioritized

- **GIVEN** a spec with implementation links in the semantic repository
- **WHEN** metadata is generated
- **THEN** the implementation links are sourced from the repository semantic operations, NOT by parsing sidecar files
