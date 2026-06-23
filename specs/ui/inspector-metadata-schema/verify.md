# Verification: Inspector Metadata & Outline

## Requirements

### Requirement: inspector mode selects preview delta or read-only canonical

#### Scenario: Preview mode shows merged delta

- **GIVEN** change artifact has pending delta
- **WHEN** user selects preview in inspector
- **THEN** inspector shows merged preview
- **AND** editor is read-only in preview

#### Scenario: Canonical workspace spec is read-only

- **GIVEN** workspace canonical `spec.md` is open
- **WHEN** user attempts to edit in inspector
- **THEN** save is disabled
- **AND** content is display-only

#### Scenario: Delta edit mode enables save hook

- **GIVEN** editable change artifact is open
- **WHEN** user edits and saves
- **THEN** `hooks-inspector-save` runs
- **AND** hash conflict surfaces 409 UI

#### Scenario: Metadata mode shows file info panel

- **WHEN** user selects Metadata in inspector
- **THEN** UI shows artifact metadata fields
- **AND** does not enable save for workspace canonical specs

#### Scenario: Outline mode loads outline for change artifact

- **GIVEN** change artifact `specs/ui/foo/spec.md` open
- **WHEN** user selects Outline in inspector
- **THEN** UI calls `outlineChangeArtifact` with current buffer
- **AND** renders outline JSON or empty state

#### Scenario: Preview with dirty buffer uses draft preview

- **GIVEN** dirty delta in editor
- **WHEN** user selects Preview
- **THEN** UI calls `previewChangeDraft` with artifact override
- **AND** merged output matches unsaved edit

#### Scenario: Unsaved indicator and close guard

- **GIVEN** dirty change artifact
- **WHEN** user attempts to close inspector
- **THEN** unsaved dialog is shown per `ui:inspector-unsaved-draft`

### Requirement: metadata mode shows artifact file metadata

#### Scenario: metadata mode shows artifact file metadata — primary path

- **WHEN** Metadata mode MUST render artifact file metadata (path,
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: metadata mode shows artifact file metadata — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: outline mode uses draft-aware endpoints

#### Scenario: outline mode uses draft-aware endpoints — primary path

- **WHEN** Outline mode MUST load navigable structure for the
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: outline mode uses draft-aware endpoints — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: preview and diff honor unsaved editor buffer

#### Scenario: preview and diff honor unsaved editor buffer — primary path

- **WHEN** For spec-scoped change artifacts, Preview and Diff MUST
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: preview and diff honor unsaved editor buffer — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: unsaved changes are visible and guarded

#### Scenario: unsaved changes are visible and guarded — primary path

- **WHEN** When editor buffer differs from last loaded originalHash
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: unsaved changes are visible and guarded — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`
- **AND** components call `client:port-*` hooks

#### Scenario: Hook delegates to configured adapter

- **WHEN** component mounts and requests change data
- **THEN** calls go through `SpecdDataPort`
- **AND** no direct repository or kernel import

#### Scenario: Adding a core import fails the boundary

- **WHEN** author introduces `import` from `@specd/core` under `@specd/ui`
- **THEN** lint or build fails
- **AND** data must flow through the port surface

### Requirement: view surfaces loading and error states

#### Scenario: Hook exposes loading while port call is in flight

- **WHEN** port method is invoked from the component
- **THEN** consumers observe loading state until the promise settles

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** port returns a network or HTTP error
- **WHEN** hook promise rejects
- **THEN** consumers receive an error object
- **AND** UI renders the message instead of stale data

#### Scenario: Save conflict shows HTTP 409 to the user

- **GIVEN** save returns 409 problem+json
- **WHEN** inspector save hook completes with error
- **THEN** UI shows the conflict message
- **AND** editor buffer is not silently replaced
