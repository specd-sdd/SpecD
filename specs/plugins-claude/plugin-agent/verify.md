# Verification: plugin-agent-claude:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exports create function

- **WHEN** the package is imported
- **THEN** it exports `create(): AgentPlugin`

### Requirement: Frontmatter injection

#### Scenario: Install adds frontmatter

- **WHEN** `install()` is called
- **THEN** YAML frontmatter is prepended to each skill file

### Requirement: Install location

#### Scenario: Installs to .claude/skills/

- **WHEN** install is called with projectRoot
- **THEN** files are written to `{projectRoot}/.claude/skills/`
