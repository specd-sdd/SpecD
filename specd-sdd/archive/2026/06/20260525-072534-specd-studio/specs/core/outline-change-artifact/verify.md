# Verification: Outline Change Artifact

## Requirements

### Requirement: input names change and filename

#### Scenario: input names change and filename — primary path

- **WHEN** execute MUST accept name (change), filename (change-relative path),
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: input names change and filename — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: draft content skips repository read

#### Scenario: Draft outlines in-progress new spec file

- **GIVEN** change tracks `specs/ui/demo/spec.md` not present in workspace
- **WHEN** `execute` is called with `content` set to markdown body
- **THEN** outline is returned
- **AND** `ChangeRepository.artifact` is not invoked

#### Scenario: Saved file read from change directory

- **GIVEN** artifact exists on disk under change path
- **WHEN** `content` is omitted
- **THEN** repository load supplies bytes
- **AND** outline matches file content

### Requirement: saved content loads via GetChangeArtifact path

#### Scenario: saved content loads via GetChangeArtifact path — primary path

- **WHEN** When content is omitted, the use case MUST
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: saved content loads via GetChangeArtifact path — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: change must exist

#### Scenario: Unknown change throws

- **WHEN** change name does not exist
- **THEN** `ChangeNotFoundError` throws
