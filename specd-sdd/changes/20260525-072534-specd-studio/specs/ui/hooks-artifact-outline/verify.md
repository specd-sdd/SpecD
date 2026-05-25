# Verification: Hooks Artifact Outline

## Requirements

### Requirement: hook selects port method by context

#### Scenario: Change artifact calls outlineChangeArtifact

- **GIVEN** open change artifact `specs/ui/foo/spec.md`
- **WHEN** outline hook loads
- **THEN** `outlineChangeArtifact` is invoked with filename and content buffer

#### Scenario: Workspace spec uses draft POST when content passed

- **GIVEN** workspace spec artifact with buffer
- **WHEN** outline hook loads with content
- **THEN** `outlineSpecDraft` is called with filename and content

### Requirement: hook refetches when buffer length changes on Outline tab

#### Scenario: Typing updates outline request

- **GIVEN** Outline tab active and dirty buffer
- **WHEN** user adds a markdown heading
- **THEN** subsequent outline result can include new section
