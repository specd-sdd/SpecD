# Verification: GetActiveSchema

## Requirements

### Requirement: Accepts no input

#### Scenario: Execute called without arguments

- **WHEN** `execute()` is called with no arguments
- **THEN** the call succeeds and uses the `ResolveSchema` instance provided at construction

### Requirement: Delegates to ResolveSchema

#### Scenario: ResolveSchema receives construction-time parameters

- **GIVEN** the use case was constructed with a `ResolveSchema` instance configured for `"@specd/schema-std"`
- **WHEN** `execute()` is called
- **THEN** `resolveSchema.execute()` is called

### Requirement: Returns the resolved Schema on success

#### Scenario: Schema resolved with extends and plugins

- **GIVEN** `ResolveSchema.execute()` returns a valid `Schema` object (after resolving extends, plugins, and overrides)
- **WHEN** `execute()` is called
- **THEN** the returned promise resolves to that `Schema` object

#### Scenario: Schema not found

- **GIVEN** `ResolveSchema.execute()` throws `SchemaNotFoundError`
- **WHEN** `execute()` is called
- **THEN** the `SchemaNotFoundError` propagates to the caller

#### Scenario: Schema validation failure

- **GIVEN** `ResolveSchema.execute()` throws `SchemaValidationError` (e.g. extends cycle, plugin kind mismatch)
- **WHEN** `execute()` is called
- **THEN** the `SchemaValidationError` propagates to the caller

### Requirement: Construction dependencies

#### Scenario: Multiple executions resolve the same reference

- **GIVEN** the use case was constructed with a `ResolveSchema` instance
- **WHEN** `execute()` is called twice
- **THEN** `resolveSchema.execute()` is called twice
