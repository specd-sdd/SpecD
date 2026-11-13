# Verification: cli:plugins-list

## Requirements

### Requirement: Command signature

#### Scenario: List all plugins

- **WHEN** `specd plugins list` is invoked
- **THEN** all declared plugins are listed

### Requirement: Declaration source

#### Scenario: Declarations read from loaded config snapshot

- **GIVEN** plugins are declared in the `plugins` list of `specd.yaml`
- **WHEN** `specd plugins list` is invoked
- **THEN** the command enumerates plugins from the loaded `SpecdConfig.plugins` field
- **AND** it does not call `kernel.project.listPlugins`
- **AND** it does not call `ConfigWriter.listPlugins`

#### Scenario: All declared plugins listed regardless of kind

- **GIVEN** a plugin contributing agents and a plugin contributing checks are both declared
- **WHEN** `specd plugins list` is invoked
- **THEN** both are listed

#### Scenario: Lists with a broken configured plugin

- **GIVEN** a configured plugin whose `init` would throw
- **WHEN** `specd plugins list` is invoked
- **THEN** the host is opened with `plugins: false`
- **AND** the plugin is listed instead of failing the command

### Requirement: Plugin status detection

#### Scenario: Plugin installed and loadable

- **GIVEN** a plugin is in config and the npm package is installed
- **WHEN** `specd plugins list` is invoked
- **THEN** status shows "installed"

#### Scenario: Plugin not found

- **GIVEN** a plugin is in config but npm package is not installed
- **WHEN** `specd plugins list` is invoked
- **THEN** status shows "not_found"
- **AND** `contributions.declared` is empty and `contributions.selected` is the recorded allowlist or empty

#### Scenario: Plugin load error

- **GIVEN** a plugin is in config but fails to load
- **WHEN** `specd plugins list` is invoked
- **THEN** status shows "error" with the error message as detail
- **AND** `contributions.declared` is empty

### Requirement: Output format

#### Scenario: Text output includes plugin details

- **WHEN** `specd plugins list` is invoked
- **THEN** output includes plugin name, contributions with their selection, version, and status

#### Scenario: Version column and fallback

- **GIVEN** one plugin with a known version and one without
- **WHEN** `specd plugins list` is invoked in text format
- **THEN** the first shows its version and the second shows `-`

#### Scenario: Nothing declared

- **GIVEN** no plugins are declared
- **WHEN** `specd plugins list` is invoked
- **THEN** text output is `no plugins declared`
- **AND** JSON output is `{ "plugins": [] }`

#### Scenario: Allowlist shown

- **GIVEN** `@acme/x` declares `a` and `b` and is recorded with `contributions: ['a']`
- **WHEN** `specd plugins list` is invoked
- **THEN** `a` is shown as selected and `b` as available but not selected

#### Scenario: JSON output is machine-parseable

- **WHEN** `specd plugins list --format json` is invoked
- **THEN** output is machine-parseable JSON
