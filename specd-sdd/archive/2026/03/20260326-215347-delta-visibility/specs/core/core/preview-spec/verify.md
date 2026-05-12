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

- **GIVEN** a base spec with content "# Spec\n\n## Requirements\n\n### Requirement: A\n\nOriginal text."
- **AND** a delta that modifies "Requirement: A" with new content
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the result contains a `PreviewSpecFileEntry` with `merged` reflecting the delta applied to the base

#### Scenario: No-op delta skipped

- **GIVEN** a delta file containing only a `no-op` entry
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the result `files` array does not contain an entry for that artifact

#### Scenario: Missing delta file skipped

- **GIVEN** a change with a `scope: spec` artifact whose delta file does not exist on disk
- **WHEN** `PreviewSpec.execute` is called
- **THEN** that artifact is skipped — no entry in the result and no error

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

#### Scenario: Base content included for delta files

- **GIVEN** a delta applied to an existing spec
- **WHEN** `PreviewSpec.execute` returns
- **THEN** the `PreviewSpecFileEntry` has `base` set to the original content and `merged` set to the result after delta application

#### Scenario: Base is null for new specs

- **GIVEN** a new spec file (not a delta)
- **WHEN** `PreviewSpec.execute` returns
- **THEN** the `PreviewSpecFileEntry` has `base: null` and `merged` set to the new file content

### Requirement: Error handling

#### Scenario: Delta application failure produces warning

- **GIVEN** a delta with a selector that does not match any node in the base spec
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the result includes a warning describing the failure
- **AND** the failing file is not included in `files`
- **AND** the use case does not throw

#### Scenario: Other files still returned on partial failure

- **GIVEN** a change with two delta files — one valid, one with a bad selector
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the valid file appears in `files` with merged content
- **AND** the failing file is absent from `files`
- **AND** a warning is present for the failing file

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws

- **GIVEN** a change with `schemaName: "schema-std"` and a schema whose `name()` is `"other-schema"`
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the use case throws `SchemaMismatchError`
