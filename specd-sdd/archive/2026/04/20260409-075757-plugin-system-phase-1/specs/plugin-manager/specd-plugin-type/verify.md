# Verification: plugin-manager:specd-plugin-type

## Requirements

### Requirement: SpecdPlugin interface

#### Scenario: Has required properties

- **WHEN** a SpecdPlugin is created
- **THEN** it has `name`, `type`, `version`, `configSchema`, `init()`, and `destroy()`
