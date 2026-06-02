# Verification: plugin-agent-copilot:plugin-agent

## Requirements

### Requirement: Factory export

#### Scenario: Exposes plugin factory

- **WHEN** plugin package exports are loaded
- **THEN** `create()` is available and returns an `AgentPlugin`

#### Scenario: Factory reads manifest for name and version

- **GIVEN** `specd-plugin.json` contains `name: "@specd/plugin-agent-copilot"` and `version: "1.0.0"`
- **WHEN** `create()` is called
- **THEN** the returned plugin has `name === "@specd/plugin-agent-copilot"` and `version === "1.0.0"`

#### Scenario: Type is hardcoded

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type === 'agent'`

### Requirement: Plugin runtime contract

#### Scenario: Created plugin satisfies runtime contract

- **WHEN** `create()` is called
- **THEN** the returned plugin has `type: 'agent'`
- **AND** it exposes `install(config, options)` and `uninstall(config, options)`
- **AND** it declares only Copilot-supported capability identifiers during install

#### Scenario: Copilot runtime does not pass capability objects

- **WHEN** the plugin prepares install-time rendering data
- **THEN** it passes capability identifiers rather than pre-normalized capability objects

### Requirement: Skill installation and frontmatter injection

#### Scenario: Install passes Copilot capability identifiers and frontmatter source values

- **GIVEN** skills are available from `@specd/skills`
- **WHEN** `install(config, options)` runs
- **THEN** the plugin passes Copilot capability identifiers and frontmatter source values into `@specd/skills`
- **AND** it resolves install bundles through `ResolveBundle`

#### Scenario: Install routes shared files to the rendered sharedFolder location

- **GIVEN** a resolved bundle contains files marked as shared and non-shared
- **WHEN** `install(config, options)` writes files
- **THEN** shared files are written to the rendered sharedFolder location under the project root
- **AND** non-shared files are written under the Copilot skill install directory
- **AND** shared files do not receive frontmatter

#### Scenario: Copilot install does not call repository bundle resolution directly

- **WHEN** the Copilot install flow is reviewed
- **THEN** bundle resolution goes through `ResolveBundle`
- **AND** the plugin does not call `SkillRepository.getBundle(...)` directly from `InstallSkills`

### Requirement: Frontmatter field contract

#### Scenario: Copilot value model supports full declared field set

- **WHEN** frontmatter values are generated for a skill file
- **THEN** `name` and `description` are always representable
- **AND** `license`, `allowed-tools`, `user-invocable`, and `disable-model-invocation` are represented only when configured
- **AND** unsupported keys are excluded

#### Scenario: Unsupported Copilot keys are absent from represented values

- **WHEN** a field outside the Copilot-supported set is considered
- **THEN** it is not included in the Copilot frontmatter value collection

### Requirement: Install location

#### Scenario: Skills are written under GitHub skills directory and sharedFolder default

- **WHEN** install writes skill files
- **THEN** files are created only under `.github/skills/` within the target project root
- **AND** shared files are written to the resolved `sharedFolder` location under the project root

#### Scenario: Shared directory is not discovered as a skill

- **WHEN** install writes shared files to the resolved shared location
- **THEN** that location does not contain a `SKILL.md` file

### Requirement: Uninstall behavior

#### Scenario: Uninstall removes selected skill directories and keeps shared resources

- **GIVEN** multiple skills are installed and share the resolved `sharedFolder` location
- **WHEN** `uninstall(config, { skills: ['specd'] })` is executed
- **THEN** only `.github/skills/specd/` is removed
- **AND** the resolved shared location remains

#### Scenario: Uninstall without filter removes only specd-managed skills and shared resources

- **GIVEN** specd-managed skills and unrelated user skills are installed under `.github/skills/`
- **WHEN** `uninstall(config)` is executed without `skills`
- **THEN** all specd-managed skill directories are removed
- **AND** the resolved sharedFolder location is removed
- **AND** unrelated user skill directories remain
