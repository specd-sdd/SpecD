# Verification: plugin-agent-codex:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes plugin factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available and returns an `AgentPlugin`

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-codex"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-codex"` and `version === "1.0.0"`

#### Scenario: Type is hardcoded

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type === 'agent'`

### Requirement: Plugin runtime contract

#### Scenario: Created plugin satisfies runtime contract

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type: 'agent'` (hardcoded)
- **AND** the returned plugin has `name` and `version` sourced from `specd-plugin.json`
- **AND** the returned plugin exposes `install(config, options)` and `uninstall(config, options)` functions using `SpecdConfig`

### Requirement: Skill installation and frontmatter injection

#### Scenario: Install injects frontmatter and reports outcome

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `install(projectRoot, options)` runs with a selected skill set
- **THEN** installed markdown skill files include Codex-compatible frontmatter prepended before content
- **AND** the install result reports installed and skipped entries

### Requirement: Frontmatter field contract

#### Scenario: Codex emitter limits fields to supported keys

- **WHEN** frontmatter is generated for a skill file
- **THEN** only `name` and `description` are emitted
- **AND** unsupported keys are excluded

### Requirement: Install location

#### Scenario: Skills are written under Codex directory

- **WHEN** install writes skill files
- **THEN** files are created only under `.codex/skills/` within the target project root
