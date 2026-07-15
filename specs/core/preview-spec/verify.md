# Verification: PreviewSpec

## Requirements

### Requirement: Ports and constructor

#### Scenario: Constructor receives required dependencies

- **WHEN** `PreviewSpec` is instantiated
- **THEN** it receives `ChangeRepository`, a `ReadonlyMap<string, SpecRepository>`, `SchemaProvider`, `ArtifactParserRegistry`, and `DiffGenerator`
- **AND** they are stored as instance properties for use during `execute`

### Requirement: Input

#### Scenario: execute receives change name and specId

- **WHEN** `PreviewSpec.execute` is invoked
- **THEN** it receives `name: string` (the change name) and `specId: string` (the fully-qualified spec ID)
- **AND** `specId` must be one of the change's `specIds`

#### Scenario: includeDiff is opt-in

- **WHEN** `PreviewSpec.execute` is invoked without `includeDiff`
- **THEN** preview execution succeeds without requiring diff output
- **AND** the use case does not attempt to generate unified diffs

#### Scenario: includeDiff enables diff generation

- **WHEN** `PreviewSpec.execute` is invoked with `includeDiff: true`
- **THEN** preview execution requests unified diff output for `merged` entries

### Requirement: Spec ID validation

#### Scenario: specId not in change throws error

- **GIVEN** a change with `specIds: ["core:config"]`
- **WHEN** `PreviewSpec.execute` is called with `specId: "core:other"`
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

### Requirement: Diff generation

#### Scenario: Merged entry includes generated diff

- **GIVEN** a preview entry with status `merged`, `filename`, `base`, and `merged` content
- **WHEN** `PreviewSpec.execute` is called with `includeDiff: true`
- **THEN** `DiffGenerator` is invoked for that file
- **AND** the returned diff string is included on the preview entry

#### Scenario: New spec entry uses empty base for diff generation

- **GIVEN** a new spec artifact whose preview entry has `base: null` and status `merged`
- **WHEN** `PreviewSpec.execute` is called with `includeDiff: true`
- **THEN** `DiffGenerator` receives an empty string for the base side
- **AND** the preview entry still includes the generated diff output

#### Scenario: no-op and missing entries omit diff output

- **GIVEN** preview entries with status `no-op` and `missing`
- **WHEN** `PreviewSpec.execute` is called with `includeDiff: true`
- **THEN** those entries do not include generated diff output
- **AND** `DiffGenerator` is not invoked for them

#### Scenario: DiffGenerationError produces warning without downgrading merged entry

- **GIVEN** a preview entry with status `merged`
- **AND** `DiffGenerator` raises `DiffGenerationError` while generating its diff
- **WHEN** `PreviewSpec.execute` is called with `includeDiff: true`
- **THEN** the result includes a warning describing the diff-generation failure
- **AND** the entry keeps status `merged`
- **AND** the entry still returns its `base` and `merged` content
- **AND** the entry omits the `diff` field

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

#### Scenario: diff field is omitted when diff generation is disabled

- **GIVEN** a merged preview result produced without `includeDiff`
- **WHEN** the file entries are inspected
- **THEN** they do not include a `diff` field

#### Scenario: diff field is present for merged entries when enabled

- **GIVEN** a merged preview result produced with `includeDiff: true`
- **WHEN** a `merged` file entry is inspected
- **THEN** it includes a plain unified diff string in `diff`

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

#### Scenario: DiffGenerationError remains a warning-only partial result

- **GIVEN** one merged preview entry generates successfully and another raises `DiffGenerationError`
- **WHEN** `PreviewSpec.execute` is called with `includeDiff: true`
- **THEN** the use case does not throw
- **AND** both preview entries remain present in `files`
- **AND** only the failing diff entry omits `diff`
- **AND** warnings record the diff-generation failure separately from merge failures

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws

- **GIVEN** a change with `schemaName: "schema-std"` and a schema whose `name()` is `"other-schema"`
- **WHEN** `PreviewSpec.execute` is called
- **THEN** the use case throws `SchemaMismatchError`

### Requirement: Config-based factory delegates through resolvePreviewSpecDeps

#### Scenario: createPreviewSpec config form derives PreviewSpecDeps through resolvePreviewSpecDeps

- **WHEN** `createPreviewSpec(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `PreviewSpecDeps` through `resolvePreviewSpecDeps(resolver)`
- **AND** `resolvePreviewSpecDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `specs: ReadonlyMap<string, SpecRepository>`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `diffGenerator: DiffGenerator`
- **AND** the factory delegates to canonical `createPreviewSpec(deps)`
