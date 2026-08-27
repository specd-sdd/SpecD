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

#### Scenario: Obsolete metadata skill is absent

- **WHEN** standard skill templates are discovered
- **THEN** no `specd-metadata` skill template is returned
- **AND** metadata optimization remains available through specialized agent templates

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

### Requirement: Graph search snippet guidance in workflow templates

#### Scenario: Workflow templates do not assume snippet-by-default text output

- **WHEN** workflow skill templates show a `specd graph search` example for ordinary lookup or metadata gathering
- **THEN** the example does not imply that a visible snippet block is returned by default

#### Scenario: Workflow templates add --snippet when preview text is required

- **WHEN** a workflow skill template instructs an agent to inspect preview text from a graph-search result
- **THEN** the command example includes `--snippet`

#### Scenario: Workflow templates describe structured snippet output as opt-in

- **WHEN** a workflow skill template references `json` or `toon` graph-search output
- **THEN** it describes the `snippet` field as omitted unless `--snippet` is passed

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

### Requirement: Metadata self-healing guidance in workflow templates

#### Scenario: Templates do not instruct scanning for metadata-status values

- **WHEN** archive-oriented, commit-oriented, or other metadata-oriented workflow skill templates are inspected
- **THEN** they do not instruct agents to scan for metadata-status values (`stale`, `missing`, `invalid`) as a normal workflow step

#### Scenario: generate-metadata is presented only as an explicit forced-rebuild tool

- **WHEN** a workflow skill template mentions `specd spec generate-metadata`
- **THEN** it presents the command as an explicit forced-rebuild, cache-warming, repair, or diagnostic tool
- **AND** it does not present the command as a required step after a routine spec or lock change

### Requirement: Optimizer agent gating declared in templates

#### Scenario: Optimizer templates use the top-level project status gate

- **WHEN** the `specd-project-context-optimizer` and `specd-spec-context-optimizer` templates are inspected
- **THEN** each runs `specd project status --format toon`
- **AND** each reads the top-level `llmOptimizedContext` field
- **AND** neither uses `specd specs metadata` as a project-configuration gate

#### Scenario: Spec optimizer template uses direct lock-owned options

- **WHEN** the `specd-spec-context-optimizer` template describes how to persist generated spec content
- **THEN** it uses `specd specs optimizations set` with `--optimized-description` or `--optimized-context`
- **AND** it does not combine `--input` with either direct option
- **AND** it does not instruct invoking spec metadata generation after persisting an optimization

#### Scenario: Project optimizer template retains project-scoped persistence

- **WHEN** the `specd-project-context-optimizer` template describes how to persist generated project context
- **THEN** it uses `specd project update-metadata --optimized-context`
- **AND** it does not use `specd specs optimizations set`
- **AND** it does not instruct invoking spec metadata generation

### Requirement: Agent-facing command roles in templates

#### Scenario: Shared guidance selects the read surface by intent

- **WHEN** shared workflow guidance is inspected
- **THEN** it assigns `specd specs show <spec-id>` to exact raw artifact reads
- **AND** it assigns `specd specs context <spec-id>` to semantic agent-ready context
- **AND** it assigns `specd specs metadata <spec-id>` only to normalized projection and materialization diagnostics

#### Scenario: Archive template uses metadata only for diagnostics

- **WHEN** the archive template inspects metadata materialization
- **THEN** it may read `source`, `regenerated`, and warnings from `specd specs metadata`
- **AND** it does not use that command as general working context

#### Scenario: Archive optimizer decision uses the top-level status field

- **WHEN** the archive template decides whether to suggest an optimizer agent
- **THEN** it reads top-level `llmOptimizedContext` from `specd project status --format toon`
- **AND** it does not reference `approvals.llmOptimized`

#### Scenario: Template tests assert exact contracts

- **WHEN** template contract tests verify command roles and optimization gating
- **THEN** they assert the exact commands and output fields
- **AND** keyword-only assertions are insufficient

### Requirement: Fast-track workflow template

#### Scenario: Template renders a resumable fast-track workflow

- **GIVEN** the `specd-fasttrack` template directory and metadata are present
- **WHEN** a frontmatter-capable runtime resolves the skill
- **THEN** the emitted `SKILL.md` contains no static source frontmatter
- **AND** it references the rendered relative shared context
- **AND** it directs the agent to update `.specd-exploration.md` immediately after each decision, code action, link update, test action, and audit finding

#### Scenario: Interrupted work retains journal state

- **GIVEN** fast-track work has been interrupted after an implementation edit
- **WHEN** a subsequent agent reads the journal
- **THEN** it can identify the completed action, rationale, and affected implementation scope without relying on an uncommitted diff
