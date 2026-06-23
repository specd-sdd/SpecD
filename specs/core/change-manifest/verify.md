# Verification: Change Manifest

## Requirements

### Requirement: Manifest structure

#### Scenario: Manifest stores artifact and file state explicitly

- **WHEN** a change manifest is written
- **THEN** each persisted artifact entry includes `state`
- **AND** each persisted file entry includes `state`

#### Scenario: Missing state defaults to missing on load

- **GIVEN** a manifest entry without a `state` field
- **WHEN** the manifest is loaded
- **THEN** the missing state is treated as `missing`

#### Scenario: specDependsOn is seeded when an existing spec enters the change

- **GIVEN** an existing persisted spec is added to a change
- **AND** the spec has a canonical `spec-lock.json`
- **WHEN** the manifest is persisted after scope entry
- **THEN** `specDependsOn` contains that spec's seeded dependency snapshot

#### Scenario: Legacy metadata seeds specDependsOn when sidecar is absent

- **GIVEN** an existing persisted spec has no `spec-lock.json`
- **AND** legacy `metadata.json.dependsOn` exists for that spec
- **WHEN** the spec first enters the change scope
- **THEN** the manifest seeds `specDependsOn` from `metadata.json.dependsOn`

#### Scenario: Invalidated event stores message and affectedArtifacts

- **WHEN** a change is invalidated because validated files drifted
- **THEN** the invalidated event includes `cause`
- **AND** it includes a human-readable message
- **AND** it includes `affectedArtifacts` with artifact types and file keys

#### Scenario: Manifest persists invalidationPolicy and hasDrift per file

- **WHEN** a change with `invalidationPolicy: 'surgical'` and one drift-visible file is saved
- **THEN** the serialized manifest includes `invalidationPolicy`
- **AND** the file entry includes `hasDrift`

#### Scenario: Validated hash is not treated as proof of current presence

- **GIVEN** a file entry with a non-null `validatedHash`
- **AND** canonical file state `missing`
- **WHEN** the manifest is loaded
- **THEN** the file remains `missing`
- **AND** `validatedHash` is interpreted only as the last validated baseline

#### Scenario: Manifest stores tracked implementation files with explicit state

- **WHEN** a change manifest is written
- **THEN** tracked implementation files are persisted with raw project-relative `file` values
- **AND** each tracked entry includes an explicit `state` (one of `open`, `resolved`, `ignored`, or `removed`)

#### Scenario: Manifest stores confirmed links with fileLinkExplicit semantics

- **WHEN** confirmed implementation links are persisted
- **THEN** each link stores `specId`, raw project-relative `file`, and `fileLinkExplicit`
- **AND** `symbols` is omitted for file-level-only links
- **AND** `fileLinkExplicit: false` is only valid when `symbols` is present and non-empty

### Requirement: Archive outcome history events

#### Scenario: Failed archive attempt appends archive-failed event

- **GIVEN** an archive attempt starts for an active change
- **AND** execution fails before successful archive commit completes
- **WHEN** the manifest is persisted after that failure
- **THEN** `history` includes an `archive-failed` event with `step`, `message`, and `commitStarted`

#### Scenario: Successful archive completion is not appended to active history

- **GIVEN** a change archives successfully
- **WHEN** the active change manifest is considered complete
- **THEN** no additional active-history success event is appended
- **AND** success remains traceable through archived manifest metadata

### Requirement: Artifact filenames use expected paths

#### Scenario: Existing delta-capable spec is persisted as a delta filename

- **GIVEN** `core:config` already exists
- **AND** the active schema artifact `specs` declares `delta: true` and output `spec.md`
- **WHEN** a change is created for `core:config`
- **THEN** the manifest file entry for `specs:core:config` stores `filename: "deltas/core/core/config/spec.md.delta.yaml"`
- **AND** it does not first store `specs/core/core/config/spec.md`

#### Scenario: New spec is persisted as a direct specs filename

- **GIVEN** `core:new-capability` does not exist
- **WHEN** a change is created for `core:new-capability`
- **THEN** the manifest file entry for `specs:core:new-capability` stores `filename: "specs/core/core/new-capability/spec.md"`

#### Scenario: Legacy stale filename can be normalized on load

- **GIVEN** an older manifest stores `specs/core/core/config/spec.md` for an existing delta-capable spec
- **WHEN** the change repository loads or syncs that change
- **THEN** the artifact filename may be normalized to `deltas/core/core/config/spec.md.delta.yaml`
- **AND** the file state and `validatedHash` semantics are preserved

### Requirement: Filename normalization preserves tracked intent

#### Scenario: Partial spec materialization does not flip tracked direct file into delta

- **GIVEN** a manifest tracks `verify.md` for a new capability as `specs/core/core/new-capability/verify.md`
- **AND** a failed archive attempt has already materialized some permanent files for that capability
- **WHEN** the change is reloaded
- **THEN** filename normalization preserves the tracked `specs/.../verify.md` filename
- **AND** it does not silently rewrite it to `deltas/.../verify.md.delta.yaml`

#### Scenario: Representation-changing normalization is rejected

- **GIVEN** a normalization step would change a tracked artifact from direct to delta representation or vice versa
- **WHEN** exact semantic equivalence for that artifact file has not been proven
- **THEN** the normalization is rejected

#### Scenario: Null validated hash does not trigger normalization flip

- **GIVEN** a manifest tracks `specs/core/core/new-spec/spec.md`
- **AND** the file has `validatedHash: null`
- **AND** the spec now exists in the workspace (making it delta-capable)
- **WHEN** the change is reloaded
- **THEN** normalization preserves the direct `specs/...` filename
- **AND** it does not flip the representation to `deltas/...` solely because the hash is null

### Requirement: Schema version

#### Scenario: Schema unchanged

- **WHEN** a change is loaded and its manifest schema matches the active schema name and version
- **THEN** no warning is emitted

#### Scenario: Schema version bumped

- **WHEN** a change is loaded and the active schema has a higher version than recorded in the manifest
- **THEN** specd emits a warning indicating the schema has changed since the change was created and the user should review whether the change artifacts are still compatible

#### Scenario: Schema name changed

- **WHEN** a change is loaded and the active schema name differs from the one recorded in the manifest
- **THEN** loading fails with `SchemaMismatchError`

#### Scenario: Archiving with schema version mismatch remains allowed

- **WHEN** archive is attempted on a change with a schema version mismatch
- **THEN** the mismatch warning is surfaced
- **AND** archiving is not blocked solely because of that version mismatch

### Requirement: Atomic writes

#### Scenario: History events appended atomically

- **WHEN** a state transition occurs
- **THEN** the new `transitioned` event is appended to `history` and the entire manifest is written atomically (temp file + rename); no partial writes are visible
