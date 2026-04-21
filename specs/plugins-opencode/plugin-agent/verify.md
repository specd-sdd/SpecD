# Verification: plugin-agent-opencode:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes named create factory

- **WHEN** plugin package exports are loaded
- **THEN** a named `create()` export is available
- **AND** calling `create()` returns an `AgentPlugin`

### Requirement: Domain layer

#### Scenario: Domain contract defines runtime and frontmatter types

- **WHEN** domain types are inspected
- **THEN** a plugin runtime type implementing `AgentPlugin` is defined
- **AND** an Open Code frontmatter type is defined with supported keys
- **AND** a per-skill frontmatter map keyed by skill name is defined

### Requirement: Frontmatter type contract

#### Scenario: Frontmatter model enforces supported field set

- **WHEN** frontmatter is generated for an installed `SKILL.md`
- **THEN** required fields `name` and `description` are present
- **AND** optional fields `license`, `compatibility`, and `metadata` are emitted only when configured
- **AND** unknown fields are not emitted

### Requirement: Application layer

#### Scenario: InstallSkills follows required workflow

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it reads skill templates, resolves per-skill frontmatter, prepends Open Code YAML frontmatter, and writes installed skill files

### Requirement: Frontmatter injection

#### Scenario: Install prepends only Open Code-compatible fields

- **WHEN** skill markdown files are written during install
- **THEN** YAML frontmatter is prepended before markdown content
- **AND** emitted fields are limited to the configured Open Code-supported keys

### Requirement: Install location

#### Scenario: Skills install into Open Code directory

- **WHEN** install writes skill files
- **THEN** files are created under `.opencode/skills/` within the provided `projectRoot`

### Requirement: Project init wizard integration

#### Scenario: Wizard exposes Open Code plugin option

- **WHEN** interactive `specd project init` renders plugin choices
- **THEN** `@specd/plugin-agent-opencode` appears in the known agent plugin options

### Requirement: Meta package inclusion

#### Scenario: Meta package depends on Open Code plugin

- **WHEN** `packages/specd/package.json` dependencies are inspected
- **THEN** `@specd/plugin-agent-opencode` is declared as a `workspace:*` dependency

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skills when filter is provided

- **GIVEN** multiple skills are installed under `.opencode/skills/`
- **WHEN** `uninstall(projectRoot, { skills: ['specd-design'] })` is executed
- **THEN** only the selected skill directories are removed

#### Scenario: Uninstall removes all skills when no filter is provided

- **GIVEN** skills are installed under `.opencode/skills/`
- **WHEN** `uninstall(projectRoot, optionsWithoutSkills)` is executed
- **THEN** the full `.opencode/skills/` tree is removed
