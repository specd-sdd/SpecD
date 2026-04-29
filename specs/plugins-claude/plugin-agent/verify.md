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
- **THEN** YAML frontmatter is prepended to each skill-local markdown file

#### Scenario: Install does not prepend skill frontmatter to shared files

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** `install()` writes those files
- **THEN** shared files are written without Claude skill frontmatter

### Requirement: Install location

#### Scenario: Installs to .claude/skills/

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install is called with that configuration
- **THEN** non-shared files are written to `{projectRoot}/.claude/skills/<skill-name>/`
- **AND** shared files are written to `{projectRoot}/.claude/skills/_specd-shared/`

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install creates `.claude/skills/_specd-shared/`
- **THEN** the directory does not contain a `SKILL.md` file

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share `.claude/skills/_specd-shared/`
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.claude/skills/specd/` is removed
- **AND** `.claude/skills/_specd-shared/` remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.claude/skills/`
- **WHEN** `uninstall(config)` is executed without `skills`
- **THEN** all specd-managed skill directories are removed
- **AND** `.claude/skills/_specd-shared/` is removed
- **AND** unrelated user skill directories remain
