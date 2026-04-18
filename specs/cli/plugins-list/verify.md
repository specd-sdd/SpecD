# Verification: cli:cli/plugins-list

## Requirements

### Requirement: Command signature

#### Scenario: List all plugins

- **WHEN** `specd plugins list` is invoked
- **THEN** all declared plugins are listed

#### Scenario: Filter by type

- **WHEN** `specd plugins list --type agents` is invoked
- **THEN** only plugins of type "agents" are listed

### Requirement: Plugin status detection

#### Scenario: Plugin installed and loadable

- **GIVEN** a plugin is in config and the npm package is installed
- **WHEN** `specd plugins list` is invoked
- **THEN** status shows "installed"

#### Scenario: Plugin not found

- **GIVEN** a plugin is in config but npm package is not installed
- **WHEN** `specd plugins list` is invoked
- **THEN** status shows "not_found"

#### Scenario: Plugin load error

- **GIVEN** a plugin is in config but fails to load
- **WHEN** `specd plugins list` is invoked
- **THEN** status shows "error" with error message
