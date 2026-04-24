# Verification: skills:skill-templates-source

## Requirements

### Requirement: Template source location

#### Scenario: Templates remain frontmatter-free

- **WHEN** markdown files under `packages/skills/templates/<skill-name>/` are inspected
- **THEN** they do not contain YAML frontmatter blocks

### Requirement: Template migration

#### Scenario: Migrated template tree is complete

- **WHEN** the template source directory is validated
- **THEN** it contains `specd/`, `specd-archive/`, `specd-design/`, `specd-implement/`, `specd-new/`, `specd-metadata/`, `specd-compliance/`, and `specd-verify/`
- **AND** it contains `shared.md`

### Requirement: Graph impact terminology in workflow templates

#### Scenario: Workflow templates use dependents for blast-radius queries

- **WHEN** workflow skill templates instruct an agent to find the blast radius of changing a symbol or file
- **THEN** they describe the query as dependents or use `--direction dependents`
- **AND** they do not call this query downstream impact or downstream dependents

#### Scenario: Workflow templates reserve downstream for dependencies

- **WHEN** workflow skill templates mention `--direction downstream`
- **THEN** they describe it as dependencies: symbols and files the target depends on
- **AND** combined analysis is described as both dependents and dependencies

#### Scenario: Workflow templates prefer CLI direction aliases

- **WHEN** workflow skill templates include concrete `specd graph impact --direction` examples for dependents or dependencies queries
- **THEN** they prefer `--direction dependents` and `--direction dependencies`
- **AND** `--direction upstream` and `--direction downstream` appear only as compatibility wording when needed

### Requirement: Frontmatter source

#### Scenario: Runtime metadata is sourced from canonical contracts

- **WHEN** plugin frontmatter models are reviewed
- **THEN** each model is derived from canonical skill metadata and the corresponding vendor documentation
- **AND** field definitions match the documented runtime contracts

### Requirement: Frontmatter injection

#### Scenario: Injection filters by target runtime support

- **WHEN** an agent plugin installs skills
- **THEN** it prepends frontmatter using only fields supported by that runtime
- **AND** unsupported fields are excluded from emitted markdown files

### Requirement: Agent frontmatter matrix

#### Scenario: Matrix coverage includes all known runtime fields

- **WHEN** frontmatter models are validated across runtimes
- **THEN** Codex coverage includes `name` and `description`
- **AND** Copilot coverage includes `name`, `description`, `license`, `allowed-tools`, `user-invocable`, and `disable-model-invocation`
- **AND** Open Code coverage includes `name`, `description`, `license`, `compatibility`, and `metadata`

### Requirement: Why no frontmatter in skills package

#### Scenario: Runtime-specific metadata stays in plugins

- **WHEN** shared skill templates and installed skill outputs are compared
- **THEN** templates remain runtime-agnostic without frontmatter
- **AND** runtime-specific frontmatter is injected by the target agent plugin during install
