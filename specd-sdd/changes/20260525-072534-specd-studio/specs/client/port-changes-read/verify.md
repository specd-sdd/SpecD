# Verification: Port Changes Read

## Requirements

### Requirement: port exposes Changes Read operations

#### Scenario: Port methods mirror routes contract

- **WHEN** adapter implements this port group
- **THEN** each method maps to documented `/v1` route
- **AND** types match DTO specs

#### Scenario: IPC adapter exposes same method names

- **WHEN** desktop IPC adapter handles port call
- **THEN** method name and arity match interface
- **AND** return shape matches HTTP path

### Requirement: port signatures are identical for HTTP and IPC adapters

#### Scenario: Remote and IPC adapters share types

- **WHEN** TypeScript compiles both adapters against port interface
- **THEN** parameters match
- **AND** return types match

### Requirement: port exposes draft preview and outline methods

#### Scenario: previewChangeDraft mirrors POST preview

- **WHEN** adapter implements `previewChangeDraft`
- **THEN** HTTP POST `/changes/{name}/preview` is used with JSON body
- **AND** return type matches `PreviewResultDto`

#### Scenario: outlineChangeArtifact mirrors POST outline

- **WHEN** adapter implements `outlineChangeArtifact` with content
- **THEN** HTTP POST `/changes/{name}/artifacts/{filename}/outline` sends `{ content }`
- **AND** returns outline JSON array
