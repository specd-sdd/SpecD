# Verification: plugin-agent-standard:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes named create factory

- **WHEN** plugin package exports are loaded
- **THEN** a named `create()` export is available
- **AND** calling `create()` returns an `AgentPlugin`

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-standard"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-standard"` and `version === "1.0.0"`

#### Scenario: Type is hardcoded

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type === 'agent'`

### Requirement: Domain layer

#### Scenario: Domain contract defines runtime and frontmatter types

- **WHEN** domain types are inspected
- **THEN** a plugin runtime type implementing `AgentPlugin` is defined, receiving `name` and `version` via constructor
- **AND** an Agent Skills standard frontmatter type is defined with supported keys
- **AND** a per-skill frontmatter map keyed by skill name is defined

### Requirement: Frontmatter type contract

#### Scenario: Frontmatter model enforces supported field set

- **WHEN** frontmatter is generated for an installed `SKILL.md`
- **THEN** required fields `name` and `description` are present
- **AND** optional fields `license`, `compatibility`, `metadata`, and `allowed-tools` are emitted only when configured
- **AND** unknown fields are not emitted

#### Scenario: allowed-tools uses hyphen not underscore

- **WHEN** frontmatter is generated with pre-approved tools configured
- **THEN** the emitted key is `allowed-tools` (with hyphen)
- **AND** the value is a space-separated string per the agentskills.io specification

### Requirement: Frontmatter injection

#### Scenario: Install prepends only Agent Skills standard fields

- **WHEN** skill markdown files are written during install
- **THEN** YAML frontmatter is prepended before markdown content
- **AND** emitted fields are limited to the Agent Skills standard-supported keys

#### Scenario: Shared files do not receive skill frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** install writes those files
- **THEN** shared files are written without Agent Skills standard frontmatter

### Requirement: Install location

#### Scenario: Skills install into agents directory

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install writes skill files
- **THEN** non-shared files are created under `.agents/skills/<skill-name>/`
- **AND** shared files are created under `.agents/skills/_specd-shared/`

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install creates `.agents/skills/_specd-shared/`
- **THEN** the directory does not contain a `SKILL.md` file

### Requirement: allowed-tools configuration

#### Scenario: Each skill has appropriate tool declarations

- **WHEN** the per-skill frontmatter map is inspected
- **THEN** every skill entry that requires file or command operations has a non-empty `allowed-tools` string
- **AND** tool strings include at minimum `Read` and `Bash(node *)` where applicable

### Requirement: Project init wizard integration

#### Scenario: Wizard exposes Agent Skills standard plugin option

- **WHEN** interactive `specd project init` renders plugin choices
- **THEN** `@specd/plugin-agent-standard` appears in the known agent plugin options

### Requirement: Meta package inclusion

#### Scenario: Meta package depends on Agent Skills standard plugin

- **WHEN** `packages/specd/package.json` dependencies are inspected
- **THEN** `@specd/plugin-agent-standard` is declared as a `workspace:*` dependency

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skills when filter is provided

- **GIVEN** a `SpecdConfig` and multiple skills installed under `.agents/skills/`
- **WHEN** `uninstall(config, { skills: ['specd-design'] })` is executed
- **THEN** only the selected specd-managed skill directories are removed
- **AND** `.agents/skills/_specd-shared/` remains when other installed skills may still reference it

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** a `SpecdConfig` with specd-managed skills and unrelated user skills installed under `.agents/skills/`
- **WHEN** `uninstall(config, optionsWithoutSkills)` is executed
- **THEN** all specd-managed skill directories are removed
- **AND** `.agents/skills/_specd-shared/` is removed
- **AND** unrelated user skill directories remain

### Requirement: Application layer

#### Scenario: InstallSkills follows required workflow

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it reads skill templates, resolves per-skill frontmatter, prepends Agent Skills standard YAML frontmatter only to skill-local markdown files, and writes installed skill files
- **AND** shared-marked files are written under the Agent Skills standard shared skills resource directory
