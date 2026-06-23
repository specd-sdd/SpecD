# Verification: Dto Graph File Ref

## Requirements

### Requirement: client DTO matches API wire shape

#### Scenario: Client type fields match API DTO

- **WHEN** TypeScript compiles client against paired `api:dto-*`
- **THEN** property names match
- **AND** required/optional semantics match

#### Scenario: Client reads resolved path fields directly

- **GIVEN** API JSON with `workspaceRelativePath` and `projectRelativePath`
- **WHEN** the client deserializes a graph file ref
- **THEN** adapters and UI read those fields directly
- **AND** no local `workspace:path` splitting helper is required

### Requirement: types are shared or generated from API schemas

#### Scenario: Types imported from shared package

- **WHEN** client and api packages build
- **THEN** DTO definitions have single source
- **AND** no duplicated interface copies
