# Verification: Error Handling Conventions

## Requirements

### Requirement: Specd Error Contract

#### Scenario: Valid Specd Error

- **GIVEN** an error class inheriting from `Error`
- **AND** it defines `specd: true` and a `code: string`
- **WHEN** the error is instantiated
- **THEN** it fulfills the "Specd Error Contract"
- **AND** it is recognized as a first-class error by delivery mechanisms

### Requirement: core Mandate

#### Scenario: Core error missing SpecdError parent

- **GIVEN** a domain error in `@specd/core`
- **WHEN** the error is defined
- **THEN** it MUST extend the canonical `SpecdError` base class
- **AND** failure to do so is a convention violation

### Requirement: Monorepo Package Mandate

#### Scenario: Monorepo package error hierarchy

- **GIVEN** a package `@specd/cli` that depends on `@specd/core`
- **WHEN** defining its base error class `SpecdCliError`
- **THEN** `SpecdCliError` MUST extend `SpecdError`
- **AND** all CLI errors MUST extend `SpecdCliError`

### Requirement: Error Code Naming

#### Scenario: Non-conforming error code

- **GIVEN** an error with code `ChangeNotFound` or `change-not-found`
- **WHEN** the error is used
- **THEN** it is a convention violation — codes MUST be `UPPER_SNAKE_CASE`

### Requirement: Actionable Messaging

#### Scenario: Opaque error message

- **GIVEN** a validation error with message "Invalid input"
- **WHEN** reported to the user
- **THEN** it is a convention violation — messages MUST be actionable (e.g., "Invalid change name. Use kebab-case slugs.")

### Requirement: Metadata Extraction

#### Scenario: Error includes contextual metadata

- **GIVEN** an error class that includes a `specId` property
- **WHEN** the error is caught by a structured formatter (JSON/TOON)
- **THEN** the `specId` is included in the output metadata
- **AND** it provides additional context for programmatic handling

### Requirement: JSDoc Documentation

#### Scenario: Error class missing JSDoc documentation

- **GIVEN** a new `SpecdError` subclass
- **WHEN** the code is reviewed or indexed
- **THEN** it MUST have a JSDoc comment describing the error and its machine-readable code
- **AND** failure to do so is a convention violation
