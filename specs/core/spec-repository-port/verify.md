# Verification: SpecRepository Port

## Requirements

### Requirement: Workspace scoping

#### Scenario: Operations are limited to the bound workspace

- **GIVEN** a `SpecRepository` bound to workspace `billing`
- **WHEN** `list()` is called
- **THEN** only specs within the `billing` workspace are returned

### Requirement: get returns a Spec or null

#### Scenario: Spec exists

- **WHEN** `get(SpecPath.parse("auth/oauth"))` is called and the spec exists in this workspace
- **THEN** a `Spec` is returned with workspace, name, and filenames populated
- **AND** no artifact content is loaded

#### Scenario: Spec does not exist

- **WHEN** `get(SpecPath.parse("nonexistent/spec"))` is called and no such spec exists
- **THEN** `null` is returned

### Requirement: list returns spec metadata with optional prefix filter

#### Scenario: List all specs

- **GIVEN** a workspace with specs `auth/login`, `auth/oauth`, and `billing/invoices`
- **WHEN** `list()` is called without a prefix
- **THEN** all three specs are returned

#### Scenario: List with prefix filter

- **GIVEN** a workspace with specs `auth/login`, `auth/oauth`, and `billing/invoices`
- **WHEN** `list(SpecPath.parse("auth"))` is called
- **THEN** only `auth/login` and `auth/oauth` are returned

#### Scenario: Empty workspace

- **WHEN** `list()` is called on an empty workspace
- **THEN** an empty array is returned

### Requirement: artifact loads a single artifact file

#### Scenario: Artifact exists

- **GIVEN** a spec with artifact file `spec.md` on disk
- **WHEN** `artifact(spec, "spec.md")` is called
- **THEN** a `SpecArtifact` is returned with the file content and `originalHash` set

#### Scenario: Artifact does not exist

- **WHEN** `artifact(spec, "nonexistent.md")` is called
- **THEN** `null` is returned

### Requirement: save persists a single artifact with conflict detection

#### Scenario: First write creates spec directory

- **GIVEN** a spec whose directory does not yet exist
- **WHEN** `save(spec, artifact)` is called
- **THEN** the directory is created and the artifact file is written

#### Scenario: Conflict detected on save

- **GIVEN** an artifact loaded with `originalHash` and the file on disk was modified by another process
- **WHEN** `save(spec, artifact)` is called without `force`
- **THEN** `ArtifactConflictError` is thrown

#### Scenario: Force save bypasses conflict detection

- **GIVEN** an artifact whose `originalHash` does not match the current file on disk
- **WHEN** `save(spec, artifact, { force: true })` is called
- **THEN** the file is overwritten without error

### Requirement: delete removes the entire spec directory

#### Scenario: Spec directory is fully removed

- **GIVEN** a spec with multiple artifact files
- **WHEN** `delete(spec)` is called
- **THEN** the entire spec directory and all its files are removed

### Requirement: resolveFromPath resolves storage paths to spec identity

#### Scenario: Absolute path resolves within workspace

- **GIVEN** an absolute path pointing to a spec in this workspace
- **WHEN** `resolveFromPath(absolutePath)` is called
- **THEN** `{ specPath, specId }` is returned

#### Scenario: Relative path resolves within workspace

- **GIVEN** a relative spec link `../storage/spec.md` and a reference spec
- **WHEN** `resolveFromPath("../storage/spec.md", fromSpecPath)` is called
- **THEN** `{ specPath, specId }` is returned if the resolved path is within this workspace

#### Scenario: Relative path escapes workspace

- **GIVEN** a relative spec link that escapes the current workspace boundary
- **WHEN** `resolveFromPath("../../other-workspace/auth/spec.md", fromSpecPath)` is called
- **THEN** `{ crossWorkspaceHint }` is returned with hint segments for the caller

#### Scenario: Invalid spec link

- **WHEN** `resolveFromPath("not-a-spec-link")` is called and the path does not resolve to any spec
- **THEN** `null` is returned
