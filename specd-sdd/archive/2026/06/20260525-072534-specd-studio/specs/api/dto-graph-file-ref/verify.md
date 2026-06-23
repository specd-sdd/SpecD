# Verification: Dto Graph File Ref

## Requirements

### Requirement: graph file refs expose canonical id and resolved path context

#### Scenario: File ref includes resolved path fields

- **WHEN** an API graph route returns a file reference
- **THEN** the JSON object includes `id`, `workspace`, `workspaceRelativePath`, and
  `projectRelativePath`
- **AND** the client does not need to parse `workspace:path` to render file labels

#### Scenario: Canonical id remains stable

- **WHEN** the same graph file is returned by multiple graph endpoints
- **THEN** `id` uses the same canonical `workspace:path` identifier everywhere
- **AND** resolved path fields are additive rather than replacing the canonical id

### Requirement: graph file refs use stable camelCase field names

#### Scenario: OpenAPI lists camelCase properties

- **WHEN** schema is generated for this DTO
- **THEN** property names are camelCase
- **AND** no snake_case aliases are emitted

### Requirement: api computes project-relative file context

#### Scenario: API derives project-relative path from workspace config

- **GIVEN** workspace `codeRoot` and project root are both known to the API
- **WHEN** a graph file ref is serialized
- **THEN** `projectRelativePath` is derived by the API presenter layer
- **AND** `@specd/code-graph` does not need project-root presentation logic
