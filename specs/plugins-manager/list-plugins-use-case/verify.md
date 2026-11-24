# Verification: plugin-manager:list-plugins-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes plugin names array

- **WHEN** ListPlugins is executed
- **THEN** the input includes `pluginNames` array

### Requirement: Output

#### Scenario: Returns plugin statuses

- **WHEN** ListPlugins is executed with plugin names
- **THEN** it returns array with name, status, and optional plugin/manifest/contributions/error

#### Scenario: Loaded plugin reports contributions

- **GIVEN** a plugin declaring contributions `a` and `b`
- **WHEN** ListPlugins is executed
- **THEN** its entry has `contributions` equal to `['a', 'b']`

### Requirement: Behavior

#### Scenario: Not found status when package cannot be resolved

- **GIVEN** an npm package that cannot be resolved
- **WHEN** ListPlugins is executed with that plugin name
- **THEN** status is `'not_found'`

#### Scenario: Error status when load fails

- **GIVEN** a plugin that exists but fails to load
- **WHEN** ListPlugins is executed with that plugin name
- **THEN** status is `'error'` with error message

#### Scenario: Output preserves input order

- **WHEN** ListPlugins is executed with names `b`, `a`
- **THEN** the entries are returned in the order `b`, `a`

#### Scenario: Invalid manifest is an error entry

- **GIVEN** a plugin whose manifest has an unscoped name
- **WHEN** ListPlugins is executed
- **THEN** status is `'error'` and other plugins are still listed
