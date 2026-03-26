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

### Requirement: ReadOnlyWorkspaceError

#### Scenario: Error extends DomainError

- **WHEN** a `ReadOnlyWorkspaceError` is constructed
- **THEN** it is an instance of `DomainError`
- **AND** it is an instance of `Error`

#### Scenario: Error preserves message

- **GIVEN** a message `'Cannot write to spec "platform:auth/tokens" — workspace "platform" is readOnly.'`
- **WHEN** `ReadOnlyWorkspaceError` is constructed with that message
- **THEN** `error.message` equals the provided message
