# Verification: skills:skill-templates-source

## Requirements

### Requirement: Template source location

#### Scenario: Templates use markdown template extension

- **WHEN** files under `packages/skills/templates/<skill-name>/` are inspected
- **THEN** template source files end with `.md.tpl`
- **AND** they do not use plain `.md` as the source template extension

#### Scenario: Skill directories declare metadata

- **WHEN** a skill template directory is inspected
- **THEN** it contains `skill.meta.json`

#### Scenario: Rendered install files drop the template suffix

- **GIVEN** a skill template source file named `SKILL.md.tpl`
- **WHEN** `@specd/skills` resolves the install bundle
- **THEN** the emitted bundle filename is `SKILL.md`

### Requirement: Template migration

#### Scenario: Migrated template tree is complete

- **WHEN** the template source directory is validated
- **THEN** it contains `skills/` (using `SKILL.md.tpl` and `skill.meta.json`)
- **AND** it contains `agents/` (using `SPECD-AGENT.md.tpl` and `specd-agent.meta.json`)
- **AND** it contains `shared/` for shared template source files

#### Scenario: Shared consumer index is no longer authoritative

- **WHEN** shared template ownership is reviewed
- **THEN** `shared.meta.json` is not the source of truth for which skills require shared templates

### Requirement: Template metadata contract (skills and agents)

#### Scenario: Metadata files declare kind and requirements

- **WHEN** a `skill.meta.json` or `specd-agent.meta.json` file is inspected
- **THEN** it declares `kind` (`skill` or `agent`)
- **AND** it declares `supportedCapabilities`, `requiredCapabilities`, and `requiredSharedTemplates`

#### Scenario: Initial capability catalogue is declared by the contract

- **WHEN** the template metadata contract is reviewed
- **THEN** the initial required capability identifiers are `mcp`, `agents`, and `frontmatter`

### Requirement: Capability-aware install-time rendering

#### Scenario: Templates branch on provided capability identifiers

- **GIVEN** install-time render context includes capability identifiers for a target runtime
- **WHEN** a skill template uses a conditional block based on those capabilities
- **THEN** `@specd/skills` renders the branch that matches the provided capability identifiers

#### Scenario: Shared references use sharedFolder variable syntax

- **WHEN** a template references a shared template path
- **THEN** it uses the form `@{{sharedFolder}}/shared.md`

#### Scenario: Templates do not render absolute shared paths

- **WHEN** installed markdown is reviewed
- **THEN** shared template references remain relative to the project root
- **AND** they do not contain absolute filesystem paths

#### Scenario: Frontmatter capability controls frontmatter insertion

- **GIVEN** a template contains a frontmatter insertion point
- **AND** `variables.frontmatter` is present
- **WHEN** install-time rendering runs with `frontmatter` enabled
- **THEN** the final frontmatter block is inserted

### Requirement: Graph impact terminology in workflow templates

#### Scenario: Workflow templates use dependents for blast-radius queries

- **WHEN** workflow skill templates instruct an agent to find the blast radius of changing a symbol or file
- **THEN** they describe the query as dependents or use `--direction dependents`
- **AND** they do not call this query downstream impact or downstream dependents

#### Scenario: Workflow templates reserve downstream for dependencies

- **WHEN** workflow skill templates mention `--direction downstream`
- **THEN** they describe it as dependencies: symbols and files the target depends on
- **AND** combined analysis is described as both dependents and dependencies

#### Scenario: Workflow templates use --file instead of --changes

- **WHEN** workflow skill templates include a concrete file-impact command example
- **THEN** they use `specd graph impact --file ...`
- **AND** they do not reference `specd graph impact --changes`

#### Scenario: Workflow templates prefer workspace-aware file selectors

- **WHEN** workflow skill templates show file selector examples for configured projects
- **THEN** they prefer canonical workspace-prefixed paths or config-relative paths
- **AND** they do not rely on implicit `default:` resolution

### Requirement: Frontmatter source

#### Scenario: Runtime metadata is sourced from canonical contracts

- **WHEN** plugin frontmatter models are reviewed
- **THEN** each model is derived from canonical skill metadata and the corresponding vendor documentation
- **AND** field definitions match the documented runtime contracts

#### Scenario: Plugins provide structured values instead of prebuilt YAML

- **WHEN** an agent plugin prepares install-time frontmatter input for `@specd/skills`
- **THEN** it passes a structured value collection
- **AND** it does not pass a prebuilt YAML frontmatter document

### Requirement: Frontmatter injection

#### Scenario: Injection filters by target runtime support

- **WHEN** an agent plugin installs skills
- **THEN** the final rendered markdown includes only fields supported by that runtime
- **AND** unsupported fields are excluded from emitted markdown files

#### Scenario: Shared files do not receive runtime frontmatter

- **GIVEN** a resolved bundle includes files marked as shared
- **WHEN** `@specd/skills` renders the install output
- **THEN** shared files are emitted without runtime skill frontmatter

### Requirement: Agent frontmatter matrix

#### Scenario: Matrix coverage includes all known runtime fields

- **WHEN** frontmatter models are validated across runtimes
- **THEN** Codex coverage includes `name` and `description`
- **AND** Copilot coverage includes `name`, `description`, `license`, `allowed-tools`, `user-invocable`, and `disable-model-invocation`
- **AND** Open Code coverage includes `name`, `description`, `license`, `compatibility`, and `metadata`

### Requirement: Why no frontmatter in skills package

#### Scenario: Runtime-specific metadata stays value-driven

- **WHEN** shared skill templates and installed skill outputs are compared
- **THEN** templates remain free of static runtime-specific frontmatter blocks
- **AND** runtime-specific values come from the target agent plugin
- **AND** the final frontmatter block is composed during skills rendering

### Requirement: Implementation tracking instructions in templates

#### Scenario: Templates mention add plus review-state resolution before archive

- **WHEN** implementation-oriented and archive-oriented workflow templates are inspected
- **THEN** they mention `specd changes implementation add`
- **AND** they mention resolving or ignoring tracked implementation files before archive
