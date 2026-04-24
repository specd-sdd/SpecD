# Verification: plugin-agent-claude:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exports create function

- **WHEN** the package is imported
- **THEN** it exports `create(): AgentPlugin`

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-claude"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-claude"` and `version === "1.0.0"`

#### Scenario: Type is hardcoded

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type === 'agent'`

### Requirement: Frontmatter injection

#### Scenario: Install adds frontmatter

- **WHEN** `install()` is called
- **THEN** YAML frontmatter is prepended to each skill file

### Requirement: Install location

#### Scenario: Installs to .claude/skills/

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install is called with that configuration
- **THEN** files are written to `{projectRoot}/.claude/skills/`
