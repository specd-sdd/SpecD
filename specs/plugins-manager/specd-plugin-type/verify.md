# Verification: plugin-manager:specd-plugin-type

## Requirements

### Requirement: SpecdPlugin interface

#### Scenario: Has required properties

- **WHEN** a SpecdPlugin is created
- **THEN** it has `name`, `type`, `version`, `configSchema`, `init()`, and `destroy()`

#### Scenario: Name and version sourced from manifest

- **GIVEN** a plugin factory reads `specd-plugin.json` with `name: "my-plugin"` and `version: "1.2.3"`
- **WHEN** the factory creates the plugin
- **THEN** `plugin.name` is `"my-plugin"` and `plugin.version` is `"1.2.3"`

#### Scenario: Type remains hardcoded

- **GIVEN** a plugin factory creates an AgentPlugin
- **WHEN** `plugin.type` is accessed
- **THEN** it returns `'agent'` regardless of manifest content

### Requirement: isSpecdPlugin type guard

#### Scenario: Rejects unknown plugin type

- **GIVEN** a value with all SpecdPlugin properties but `type` is `'unknown-type'`
- **WHEN** `isSpecdPlugin` is called
- **THEN** it returns `false`

#### Scenario: Accepts known plugin type

- **GIVEN** a value with all SpecdPlugin properties and `type` is `'agent'`
- **WHEN** `isSpecdPlugin` is called
- **THEN** it returns `true`
