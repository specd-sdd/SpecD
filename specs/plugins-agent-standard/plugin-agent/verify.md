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

#### Scenario: Frontmatter value model enforces supported field set

- **WHEN** frontmatter values are generated for an installed `SKILL.md`
- **THEN** required fields `name` and `description` are present
- **AND** optional fields `license`, `compatibility`, `metadata`, and `allowed-tools` are represented only when configured
- **AND** unknown fields are not represented

#### Scenario: allowed-tools uses hyphen not underscore

- **WHEN** frontmatter values are generated with pre-approved tools configured
- **THEN** the represented key is `allowed-tools`
- **AND** the value is a space-separated string per the agentskills.io specification

### Requirement: Frontmatter injection

#### Scenario: Install passes Agent Skills capability identifiers and frontmatter source values

- **WHEN** skill markdown files are written during install
- **THEN** the plugin supplies Agent Skills capability identifiers and structured frontmatter values to `@specd/skills`
- **AND** the rendered markdown includes only the Agent Skills standard-supported fields

#### Scenario: Shared files do not receive skill frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** install writes those files
- **THEN** shared files are written without Agent Skills standard frontmatter

### Requirement: Install location

#### Scenario: Skills install into agents directory and sharedFolder default

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install writes skill files
- **THEN** non-shared files are created under `.agents/skills/<skill-name>/`
- **AND** shared files are created under the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Fallback to shared location for agents

- **GIVEN** a request to install an agent
- **WHEN** `install(config, options)` runs
- **THEN** it copies the agent to the same directory as `shared.md` (since `agents` capability is not supported)

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
- **AND** the resolved shared location remains when other installed skills may still reference it

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** a `SpecdConfig` with specd-managed skills and unrelated user skills installed under `.agents/skills/`
- **WHEN** `uninstall(config, optionsWithoutSkills)` is executed
- **THEN** all specd-managed skill directories are removed
- **AND** the resolved sharedFolder location is removed
- **AND** unrelated user skill directories remain

### Requirement: Application layer

#### Scenario: InstallSkills follows required workflow

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it reads skill templates, resolves capability identifiers and frontmatter source values, and passes them into `@specd/skills`
- **AND** shared-marked files are written to the rendered sharedFolder location under the project root
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Agent Skills standard application layer does not prepend YAML after resolution

- **WHEN** the Agent Skills standard install flow is reviewed
- **THEN** the plugin does not assemble a final YAML frontmatter block after bundle resolution

#### Scenario: Standard-agent install does not call repository bundle resolution directly

- **WHEN** the Agent Skills standard install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`
