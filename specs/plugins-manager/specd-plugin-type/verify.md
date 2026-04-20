# Verification: plugin-manager:specd-plugin-type

## Requirements

### Requirement: SpecdPlugin interface

#### Scenario: Has required properties

- **WHEN** a SpecdPlugin is created
- **THEN** it has `name`, `type`, `version`, `configSchema`, `init()`, and `destroy()`

### Requirement: isSpecdPlugin type guard

#### Scenario: Rejects unknown plugin type

- **GIVEN** a value with all SpecdPlugin properties but `type` is `'unknown-type'`
- **WHEN** `isSpecdPlugin` is called
- **THEN** it returns `false`

#### Scenario: Accepts known plugin type

- **GIVEN** a value with all SpecdPlugin properties and `type` is `'agent'`
- **WHEN** `isSpecdPlugin` is called
- **THEN** it returns `true`
