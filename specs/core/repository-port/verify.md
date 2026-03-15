# Verification: Repository Base

## Requirements

### Requirement: Immutable accessors

#### Scenario: Accessors return construction-time values

- **GIVEN** a `Repository` subclass constructed with `{ workspace: "billing", ownership: "shared", isExternal: true }`
- **THEN** `workspace()` returns `"billing"`
- **AND** `ownership()` returns `"shared"`
- **AND** `isExternal()` returns `true`

### Requirement: Subclass contract

#### Scenario: Subclass inherits accessors without redeclaring them

- **GIVEN** a `ChangeRepository` subclass that does not override `workspace()`, `ownership()`, or `isExternal()`
- **WHEN** the subclass is constructed with `{ workspace: "default", ownership: "owned", isExternal: false }`
- **THEN** all three accessors return the values from `RepositoryConfig`
