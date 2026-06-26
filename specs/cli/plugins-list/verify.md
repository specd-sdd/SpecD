# Verification: cli:plugins-list

## Requirements

### Requirement: Command signature

#### Scenario: List all plugins

- **WHEN** `specd plugins list` is invoked
- **THEN** all declared plugins are listed

#### Scenario: Filter by type

- **WHEN** `specd plugins list --type agents` is invoked
- **THEN** only plugins of type "agents" are listed

### Requirement: Declaration source

#### Scenario: Declarations read from loaded config snapshot

- **GIVEN** plugins are declared in `specd.yaml` under `plugins.agents`
- **WHEN** `specd plugins list` is invoked
- **THEN** the command enumerates plugins from the loaded `SpecdConfig.plugins` field
- **AND** it does not call `kernel.project.listPlugins`
- **AND** it does not call `ConfigWriter.listPlugins`

#### Scenario: Default type is agents when --type omitted

- **GIVEN** `plugins.agents` and `plugins.other` are both declared
- **WHEN** `specd plugins list` is invoked without `--type`
- **THEN** only plugins under `plugins.agents` are considered

#### Scenario: Unknown type yields empty declaration list

- **GIVEN** `specd.yaml` has no `plugins.missing` entries
- **WHEN** `specd plugins list --type missing` is invoked
- **THEN** no plugins are enumerated for that type
- **AND** the command completes without error

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

### Requirement: Output format

#### Scenario: Text output includes plugin details

- **WHEN** `specd plugins list` is invoked
- **THEN** output includes plugin name, type, version, and status

#### Scenario: JSON output is machine-parseable

- **WHEN** `specd plugins list --format json` is invoked
- **THEN** output is machine-parseable JSON
