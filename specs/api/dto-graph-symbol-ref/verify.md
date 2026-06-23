# Verification: Dto Graph Symbol Ref

## Requirements

### Requirement: graph symbol refs expose canonical id, source location, and resolved paths

#### Scenario: Symbol ref includes navigation-ready source fields

- **WHEN** an API graph route returns a symbol reference
- **THEN** the JSON object includes `id`, `workspace`, `workspaceRelativePath`,
  `projectRelativePath`, `name`, `kind`, `line`, and `column`
- **AND** Studio can open the symbol location without parsing the symbol id

#### Scenario: Canonical symbol id remains unchanged

- **WHEN** a symbol ref is serialized by the API
- **THEN** `id` matches the canonical graph-provider symbol id exactly
- **AND** path fields are additive presentation data

### Requirement: graph symbol refs use stable camelCase field names

#### Scenario: OpenAPI lists camelCase properties

- **WHEN** schema is generated for this DTO
- **THEN** property names are camelCase
- **AND** no snake_case aliases are emitted

### Requirement: api computes path context while preserving graph-domain ids

#### Scenario: Presenter adds resolved path context without mutating ids

- **GIVEN** a graph symbol with canonical id and file path
- **WHEN** the API presenter serializes it
- **THEN** the presenter derives `workspaceRelativePath` and `projectRelativePath`
- **AND** the underlying symbol id is preserved unchanged
