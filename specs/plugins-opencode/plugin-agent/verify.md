# Verification: plugin-agent-opencode:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes named create factory

- **WHEN** plugin package exports are loaded
- **THEN** a named `create()` export is available
- **AND** calling `create()` returns an `AgentPlugin`

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-opencode"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-opencode"` and `version === "1.0.0"`

#### Scenario: Type is hardcoded

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type === 'agent'`

### Requirement: Domain layer

#### Scenario: Domain contract defines runtime and frontmatter types

- **WHEN** domain types are inspected
- **THEN** a plugin runtime type implementing `AgentPlugin` is defined, receiving `name` and `version` via constructor
- **AND** an Open Code frontmatter type is defined with supported keys
- **AND** a per-skill frontmatter map keyed by skill name is defined

### Requirement: Frontmatter type contract

#### Scenario: Frontmatter value model enforces supported field set

- **WHEN** frontmatter values are generated for an installed `SKILL.md`
- **THEN** required fields `name` and `description` are present
- **AND** optional fields `license`, `compatibility`, and `metadata` are represented only when configured
- **AND** unknown fields are not represented

#### Scenario: Unsupported Open Code metadata keys stay out of the value collection

- **WHEN** unsupported metadata is proposed for Open Code frontmatter
- **THEN** it is not represented in the Open Code frontmatter value collection

### Requirement: Frontmatter injection

#### Scenario: Install passes Open Code capability identifiers and frontmatter source values

- **WHEN** skill markdown files are written during install
- **THEN** the plugin supplies Open Code capability identifiers and structured frontmatter values to `@specd/skills`
- **AND** the rendered markdown includes only the configured Open Code-supported fields

#### Scenario: Shared files do not receive skill frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** install writes those files
- **THEN** shared files are written without Open Code skill frontmatter

### Requirement: Install location

#### Scenario: Skills install into Open Code directory and sharedFolder default

- **GIVEN** a `SpecdConfig` with `projectRoot`
- **WHEN** install writes skill files
- **THEN** non-shared files are created under `.opencode/skills/<skill-name>/`
- **AND** shared files are created under the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

#### Scenario: Installs agents to categorized directory

- **GIVEN** a request to install an agent
- **WHEN** `install(config, options)` runs
- **THEN** it installs the agent files to `.opencode/agents/`
- **AND** the YAML frontmatter contains `mode: subagent`
- **AND** the YAML frontmatter contains `permissions` mapped from `allowedTools`

#### Scenario: Fallback to shared location when agents capability is missing

- **GIVEN** a runtime that does not support `agents`
- **WHEN** an agent is installed
- **THEN** it is copied to the same directory as `shared.md`

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

- **GIVEN** a `SpecdConfig` and multiple skills installed under `.opencode/skills/`
- **WHEN** `uninstall(config, { skills: ['specd-design'] })` is executed
- **THEN** only the selected specd-managed skill directories are removed
- **AND** the resolved shared location remains when other installed skills may still reference it

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** a `SpecdConfig` with specd-managed skills and unrelated user skills installed under `.opencode/skills/`
- **WHEN** `uninstall(config, optionsWithoutSkills)` is executed
- **THEN** all specd-managed skill directories are removed
- **AND** the resolved sharedFolder location is removed
- **AND** unrelated user skill directories remain

#### Scenario: Uninstall removes selected agent files

- **GIVEN** multiple agents are installed
- **WHEN** `uninstall(config, { agents: ['specd-project-context-optimizer'] })` is executed
- **THEN** only `.opencode/agents/specd-project-context-optimizer.md` is removed

#### Scenario: Uninstall without filter removes all specd-managed agents

- **GIVEN** specd-managed agents and unrelated user agents are installed under `.opencode/agents/`
- **WHEN** `uninstall(config)` is executed without filters
- **THEN** all specd-managed agent files are removed
- **AND** unrelated user agent files remain

### Requirement: Application layer

#### Scenario: InstallSkills follows required workflow

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `InstallSkills` runs
- **THEN** it reads skill templates, resolves capability identifiers and frontmatter source values, and passes them into `@specd/skills`
- **AND** shared-marked files are written to the rendered sharedFolder location under the project root
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Open Code application layer does not prepend YAML after resolution

- **WHEN** the Open Code install flow is reviewed
- **THEN** the plugin does not assemble a final YAML frontmatter block after bundle resolution

#### Scenario: Open Code install does not call repository bundle resolution directly

- **WHEN** the Open Code install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`
