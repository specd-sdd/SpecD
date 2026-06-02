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

#### Scenario: Install emits Claude-compatible frontmatter through skills rendering

- **WHEN** `install()` is called
- **THEN** skill-local markdown files are written with Claude-compatible frontmatter already present in the rendered content

#### Scenario: Shared files do not receive Claude frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** `install()` writes those files
- **THEN** shared files are written without Claude skill frontmatter

### Requirement: Install location

#### Scenario: Installs to .claude/skills/ and sharedFolder default location

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install is called with that configuration
- **THEN** non-shared files are written to `{projectRoot}/.claude/skills/<skill-name>/`
- **AND** shared files are written to the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share the resolved `sharedFolder` location
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.claude/skills/specd/` is removed
- **AND** the resolved shared location remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.claude/skills/`
- **WHEN** `uninstall(config)` is executed without `skills`
- **THEN** all specd-managed skill directories are removed
- **AND** the resolved sharedFolder location is removed
- **AND** unrelated user skill directories remain

### Requirement: Domain layer

#### Scenario: Domain layer contains claude-plugin.ts

- **WHEN** the domain layer is inspected
- **THEN** `claude-plugin.ts` exists implementing the `AgentPlugin` interface

#### Scenario: Domain layer contains frontmatter.ts

- **WHEN** the domain layer is inspected
- **THEN** `frontmatter.ts` exists with Frontmatter type definitions

### Requirement: Frontmatter type

#### Scenario: Frontmatter values cover Claude-supported metadata

- **WHEN** Claude frontmatter values are prepared for install
- **THEN** they can represent the Claude-supported metadata fields
- **AND** they are stored as structured values rather than a prebuilt YAML document

#### Scenario: Unsupported Claude metadata stays out of the value collection

- **WHEN** a non-Claude metadata key is proposed
- **THEN** it is excluded from the Claude frontmatter value collection

### Requirement: Application layer

#### Scenario: InstallSkills passes Claude values into skills rendering

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it resolves Claude frontmatter source values per skill
- **AND** it passes only Claude capability identifiers into `@specd/skills`

#### Scenario: Shared files are written to the rendered sharedFolder location

- **GIVEN** a resolved bundle contains files marked as shared
- **WHEN** `InstallSkills` writes those files
- **THEN** they are written to the resolved sharedFolder location under the project root
