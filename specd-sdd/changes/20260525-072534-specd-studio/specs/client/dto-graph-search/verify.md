# Verification: Dto Graph Search

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

### Requirement: types are shared or generated from API schemas

#### Scenario: Types imported from shared package

- **WHEN** client and api packages build
- **THEN** DTO definitions have single source
- **AND** no duplicated interface copies

#### Scenario: OpenAPI generation feeds both sides

- **GIVEN** OpenAPI schema generated from Zod
- **WHEN** client types generated or re-exported
- **THEN** schemas align with `api:dto-*` spec
- **AND** Studio release notes document changes

#### Scenario: Manual duplicate DTO is rejected in review

- **WHEN** contributor adds parallel interface in client
- **THEN** lint or architectural test fails
- **AND** must use shared/generated types
