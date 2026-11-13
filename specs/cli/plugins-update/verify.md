# Verification: cli:plugins-update

## Requirements

### Requirement: Command signature

#### Scenario: Update all plugins

- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all declared plugins are updated

#### Scenario: Update specific plugins

- **WHEN** `specd plugins update @specd/plugin-agent-claude` is invoked
- **THEN** only the specified plugin is updated

### Requirement: Declaration source

#### Scenario: Update-all uses config.plugins

- **GIVEN** multiple plugins are declared in the `plugins` list of the loaded config
- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all plugins from `config.plugins` are selected for update
- **AND** the command does not call `kernel.project.listPlugins`

#### Scenario: Declaration read does not use ConfigWriter.listPlugins

- **GIVEN** a loaded `SpecdConfig` snapshot is available
- **WHEN** `specd plugins update` resolves the declared plugin set
- **THEN** it reads `config.plugins` in memory
- **AND** it does not call `ConfigWriter.listPlugins`

### Requirement: Exit code

#### Scenario: Update failure

- **GIVEN** `specd plugins update @acme/x @acme/y` where `UpdatePlugin` throws for `@acme/x`
- **WHEN** the command runs
- **THEN** `@acme/y` is still updated
- **AND** the command exits with code 1

### Requirement: Update behavior

#### Scenario: Update all plugins when no arguments provided

- **WHEN** `specd plugins update` is invoked with no arguments
- **THEN** all declared plugins in `specd.yaml` are updated

#### Scenario: Update behavior is idempotent

- **GIVEN** `specd plugins update @specd/plugin-agent-claude` has been run successfully
- **WHEN** `specd plugins update @specd/plugin-agent-claude` is run again
- **THEN** the command succeeds and does not produce an error
- **AND** no `ConfigWriter` method is called, so `specd.yaml` is not modified

#### Scenario: Recorded selection is preserved

- **GIVEN** `@acme/x` declared with `contributions: ['audit']` and the new version adds a contribution `extra`
- **WHEN** `specd plugins update @acme/x` is invoked
- **THEN** `UpdatePlugin` is called with `contributions: ['audit']`
- **AND** `extra` is not activated and `specd.yaml` is unchanged

#### Scenario: Undeclared plugin

- **WHEN** `specd plugins update @acme/unknown` is invoked and it is not in `config.plugins`
- **THEN** an error is reported for that name
- **AND** `UpdatePlugin` is not called for it and the command exits with code 1

### Requirement: Host bootstrap without plugins

#### Scenario: Update works with a broken configured plugin

- **GIVEN** a configured plugin whose `init` would throw
- **WHEN** `specd plugins update` is invoked
- **THEN** the host is opened with `plugins: false` and the update proceeds
- **AND** `resolveCliContext` receives `plugins: false`

### Requirement: Output

#### Scenario: Machine-parseable JSON output

- **WHEN** `specd plugins update --format json` is invoked
- **THEN** output is machine-parseable JSON of the shape `{ plugins: [{ name, status, detail? }], hasErrors }`
- **AND** `status` is `updated` or `error`

#### Scenario: Text output

- **GIVEN** two declared plugins, one updated and one failing
- **WHEN** `specd plugins update` is invoked in text format
- **THEN** each plugin is printed with its name and status

#### Scenario: Nothing declared

- **GIVEN** no plugins are declared
- **WHEN** `specd plugins update` is invoked in text format
- **THEN** the output is `no plugins to update`
