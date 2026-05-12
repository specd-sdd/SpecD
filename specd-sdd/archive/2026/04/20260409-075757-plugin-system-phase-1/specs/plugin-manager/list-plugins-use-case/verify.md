# Verification: plugin-manager:list-plugins-use-case

## Requirements

### Requirement: Output

#### Scenario: Returns plugin statuses

- **WHEN** ListPlugins is executed with plugin names
- **THEN** it returns array with name, status, and optional plugin/error
