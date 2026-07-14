# Verification: Dto Project Status

## Requirements

### Requirement: client DTO matches API wire shape

#### Scenario: Client type fields match API DTO

- **WHEN** TypeScript compiles client against paired `api:dto-*`
- **THEN** property names match
- **AND** required/optional semantics match

#### Scenario: Sample API JSON parses without renaming

- **GIVEN** fixture JSON from API presenter
- **WHEN** client deserializes response
- **THEN** no custom field aliases in adapter
- **AND** hooks read properties directly

#### Scenario: Drift fails client compile or test

- **WHEN** API DTO adds required field without client update
- **THEN** build or contract test fails
- **AND** prevents silent UI breakage

### Requirement: client project status graph includes warnings

#### Scenario: Project status graph warnings deserialize on client

- **WHEN** API returns `graph.warnings` on project status
- **THEN** client `ProjectStatusDto.graph.warnings` preserves entries

### Requirement: types are shared or generated from API schemas

#### Scenario: Structural input maps all canonical status fields

- **GIVEN** structural input containing counts, graph diagnostics, approvals, and auth
- **WHEN** the client mapper is called
- **THEN** it returns the canonical `ProjectStatusDto` without renaming or dropping fields
- **AND** optional fields are omitted only when their source values are absent

#### Scenario: Client mapper has no core or SDK dependency

- **WHEN** the client package dependency graph and public mapper signature are inspected
- **THEN** neither imports `@specd/core` nor `@specd/sdk`
- **AND** the mapper accepts serializable structural data rather than domain entities

#### Scenario: HTTP and IPC use one mapper implementation

- **WHEN** API and desktop project-status presenters are inspected
- **THEN** both import the mapper from `@specd/client`
- **AND** neither defines a parallel `ProjectStatusDto` mapping
