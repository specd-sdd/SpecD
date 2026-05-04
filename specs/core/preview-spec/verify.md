# Verification: PreviewSpec

## Requirements

### Requirement: Spec ID validation

#### Scenario: specId not in change throws error

- **GIVEN** a change with `specIds: ["core:core/config"]`
- **WHEN** `PreviewSpec.execute` is called with `specId: "core:core/other"`
- **THEN** the use case throws a `SpecNotInChangeError` (or equivalent)

### Requirement: File discovery via change artifacts

#### Scenario: Delta files discovered from change artifacts

- **GIVEN** a change with a `scope: spec` artifact whose `ArtifactFile.filename` is `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `PreviewSpec.execute` is called for that specId
- **THEN** the delta file is loaded from `ChangeRepository` using that filename

#### Scenario: New spec files discovered from change artifacts

- **GIVEN** a change with a `scope: spec` artifact whose `ArtifactFile.filename` is `specs/core/core/preview-spec/spec.md`
- **WHEN** `PreviewSpec.execute` is called for that specId
- **THEN** the file is loaded directly from `ChangeRepository` as new content with `base: null`

### Requirement: Delta application

#### Scenario: Delta merged into base spec content

- **GIVEN** a valid delta file and a matching base spec
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the entry in `files` has status `merged`
- **AND** `merged` content contains the result of application

#### Scenario: No-op delta records status

- **GIVEN** a delta file containing only a `no-op` entry
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the result contains an entry for that artifact with status `no-op`
- **AND** `merged` contains the original base content

#### Scenario: Missing delta file records status

- **GIVEN** a change with a `scope: spec` artifact whose delta file does not exist on disk
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the result contains an entry for that artifact with status `missing`

#### Scenario: All schema artifacts returned

- **GIVEN** a schema with `spec.md` and `verify.md` artifact types
- **AND** a change that only has a delta for `spec.md`
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the `files` array contains entries for both `spec.md` (status `merged`) and `verify.md` (status `missing`)

### Requirement: Artifact file ordering

#### Scenario: spec.md appears first

- **GIVEN** a change producing `verify.md` and `spec.md` preview entries
- **WHEN** `PreviewSpec.execute` returns
- **THEN** `files[0].filename` is `spec.md` and `files[1].filename` is `verify.md`

#### Scenario: Remaining files sorted alphabetically

- **GIVEN** a change producing `spec.md`, `verify.md`, and `config.yaml` preview entries
- **WHEN** `PreviewSpec.execute` returns
- **THEN** the order is `spec.md`, `config.yaml`, `verify.md`

### Requirement: Result shape

#### Scenario: Base content and status included for delta files

- **GIVEN** a delta applied to an existing spec
- **WHEN** `PreviewSpec.execute` returns
- **THEN** the `PreviewSpecFileEntry` has status `merged`
- **AND** `base` is set to the original content
- **AND** `merged` is set to the result after delta application

#### Scenario: Base is null and status is merged for new specs

- **GIVEN** a new spec file (not a delta)
- **WHEN** `PreviewSpec.execute` returns
- **THEN** the `PreviewSpecFileEntry` has status `merged`
- **AND** `base: null`
- **AND** `merged` is set to the new file content

### Requirement: Error handling

#### Scenario: Delta application failure produces warning and missing status

- **GIVEN** a delta with a selector that does not match any node in the base spec
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the result includes a warning describing the failure
- **AND** the failing file is included in `files` with status `missing`
- **AND** the use case does not throw

#### Scenario: Other files still returned on partial failure

- **GIVEN** a change with two delta files — one valid, one with a bad selector
- **WHEN** `PreviewSpec.execute` is called
- **THEN** both files appear in `files`
- **AND** the valid one has status `merged`
- **AND** the failing one has status `missing`

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws

- **GIVEN** a change with `schemaName: "schema-std"` and a schema whose `name()` is `"other-schema"`
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the use case throws `SchemaMismatchError`
