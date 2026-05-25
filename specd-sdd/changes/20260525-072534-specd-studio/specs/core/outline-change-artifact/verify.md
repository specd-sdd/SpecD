# Verification: Outline Change Artifact

## Requirements

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

### Requirement: change must exist

#### Scenario: Unknown change throws

- **WHEN** change name does not exist
- **THEN** `ChangeNotFoundError` throws
