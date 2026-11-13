# Verification: cli:plugins-show

## Requirements

### Requirement: Command signature

#### Scenario: Show plugin details

- **WHEN** `specd plugins show @specd/plugin-agent-claude` is invoked
- **THEN** plugin metadata, contributions, configSchema, and capabilities are displayed

#### Scenario: Contributions shown with addresses

- **GIVEN** a plugin `@acme/x` declaring `checks.audit`
- **WHEN** `specd plugins show @acme/x` is invoked
- **THEN** the output lists kind `checks`, id `audit` and address `@acme/x.audit`

### Requirement: Error handling

#### Scenario: Plugin not found

- **WHEN** `specd plugins show nonexistent-plugin` is invoked
- **THEN** an error message is emitted
- **AND** exit code is 1

### Requirement: Output

#### Scenario: Machine-parseable JSON output

- **WHEN** `specd plugins show @specd/plugin-agent-claude --format json` is invoked
- **THEN** output is machine-parseable JSON with plugin name, version, contributions, configSchema, and capabilities

#### Scenario: Configuration schema and default config displayed

- **GIVEN** a plugin whose manifest declares a `configSchema` and a `defaultConfig`
- **WHEN** `specd plugins show @acme/x` is invoked
- **THEN** both are displayed

#### Scenario: Capabilities for a plugin with hooks or agents

- **GIVEN** a plugin that implements `install` and `uninstall` or declares `agents`
- **WHEN** `specd plugins show` is invoked
- **THEN** the capabilities line lists the supported capabilities

#### Scenario: Capabilities omitted for a checks-only plugin

- **GIVEN** a plugin contributing only `checks` and implementing no `install` or `uninstall` hook
- **WHEN** `specd plugins show @acme/x` is invoked in text format
- **THEN** no capabilities line is printed
- **AND** JSON output has no `capabilities` field

#### Scenario: Init is never called

- **WHEN** `specd plugins show @acme/x` is invoked
- **THEN** the plugin's `init` is not called
