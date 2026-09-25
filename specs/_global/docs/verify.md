# Verification: Documentation Conventions

## Requirements

### Requirement: Directory structure

#### Scenario: Doc placed outside docs/

- **WHEN** a documentation file is created outside `docs/` (excluding `README.md`, `AGENTS.md`, `CLAUDE.md`)
- **THEN** it must be moved to the appropriate subdirectory under `docs/`

### Requirement: User guide documentation and frontmatter

#### Scenario: User guide contains valid frontmatter

- **WHEN** a user guide is added or updated under `docs/guide/`
- **THEN** it must contain YAML frontmatter with non-empty `title`, `description`, and positive integer `sidebar_position`
- **AND** it must not contain developer-internal package implementation details

#### Scenario: User guide missing required frontmatter fails validation

- **WHEN** a guide in `docs/guide/` is missing `title`, `description`, or `sidebar_position`
- **THEN** validation and bundler compilation reject the file as malformed

#### Scenario: Developer-internal doc placed in docs/guide/ is rejected

- **WHEN** internal runtime mechanics (e.g. skills template compilation internals) are placed in `docs/guide/`
- **THEN** the review rejects the placement and requires it to live in `docs/skills/`, `docs/core/`, or `docs/code-graph/`

#### Scenario: Configuration and workflow guide parameters match core implementation

- **WHEN** reviewing `docs/guide/configuration.md`, `docs/guide/workspaces.md`, `docs/guide/schemas.md`, and `docs/guide/workflow.md`
- **THEN** all supported archive pattern variables (`{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`) MUST be accurately documented without mentioning unsupported variables
- **AND** hook and artifact template substitution MUST be accurately documented, including verbatim `run:` values, host quote translation, and non-Windows execution via absolute `SHELL` or `/bin/sh`
- **AND** workspace adapter options (`metadataPath`), graph settings, and reserved workspace names (`root`) MUST be documented without contradictions

#### Scenario: Project update command and plugin asset orchestration are documented

- **WHEN** reviewing `docs/guide/configuration.md`, `docs/guide/cli.md`, and `docs/guide/installation.md`
- **THEN** `specd project update` MUST be documented as orchestrating declared agent plugins and synthesizing project-managed assets (`AGENTS.md`, `CLAUDE.md`, skills)
- **AND** the documentation MUST clearly specify that `specd project update` is required when manually editing `plugins.agents` in `specd.yaml` or upgrading SpecD packages, whereas standard configuration settings are resolved dynamically at runtime

#### Scenario: Code Graph capabilities and intelligence workflows are prominently documented

- **WHEN** reviewing `docs/guide/code-graph.md`, `docs/guide/index.md`, `docs/guide/philosophy.md`, `docs/guide/skills.md`, and `docs/guide/cli.md`
- **THEN** `docs/guide/code-graph.md` MUST exhaustively document document search (`--documents`), source file search (`--files`), spec content search (`--specs`), spec impact (`--spec`), public export analysis (`--export`), multi-file blast radius, traversal directions and depth, and coverage diagnostics
- **AND** the Code Graph MUST be presented as a core platform pillar across `index.md`, `philosophy.md`, `skills.md`, and `cli.md`

#### Scenario: The guide and public docs open on What is SpecD

- **WHEN** reviewing `docs/guide/what-is-specd.md`, `docs/guide/index.md`, and the public docs entry in `apps/public-web`
- **THEN** `docs/guide/what-is-specd.md` MUST explain what SpecD is and what a reader can do with it
- **AND** that page MUST present the Code Graph as a core capability, including search, blast radius, and spec-to-code traceability, and MUST link to `docs/guide/code-graph.md`
- **AND** that page MUST be the first guide in sidebar order and the public docs entry target
- **AND** `docs/guide/index.md` MUST remain the topic map and MUST link to the opening page

### Requirement: Skills guide documentation

#### Scenario: Skills guide exists with complete catalog

- **WHEN** reviewing `docs/guide/skills.md`
- **THEN** the file exists and contains valid Docusaurus frontmatter (`title`, `description`, `sidebar_position`)
- **AND** it describes what skills are and how they interact with the SpecD CLI
- **AND** it catalogs all built-in skills: `/specd`, `/specd-new`, `/specd-design`, `/specd-implement`, `/specd-verify`, `/specd-archive`, `/specd-compliance`, `/specd-fasttrack`
- **AND** each skill entry includes a description and guidance on when to use it

#### Scenario: Skills guide accessible via specd guide command

- **WHEN** running `specd guide skills`
- **THEN** the guide content is returned without error
- **AND** the guide appears in the catalog returned by `specd guide`

### Requirement: ADR format

#### Scenario: ADR missing required section

- **WHEN** an ADR file is missing `## Context and Problem Statement`, `## Decision Outcome`, or `## More Information` with a `### Spec` sub-section
- **THEN** the review must reject it as malformed

#### Scenario: ADR missing Confirmation

- **WHEN** an ADR's `## Decision Outcome` section has no `### Confirmation` sub-section
- **THEN** the review must reject it as malformed

#### Scenario: ADR with real alternatives omits Considered Options

- **WHEN** an ADR describes a decision where multiple options were genuinely evaluated
- **THEN** it must include `## Considered Options` and at least one entry per option evaluated

#### Scenario: ADR missing frontmatter

- **WHEN** an ADR file has no YAML frontmatter block with `status` and `date` fields before the title
- **THEN** the review must reject it as malformed

### Requirement: ADR numbering

#### Scenario: Duplicate ADR number

- **WHEN** a new ADR is created with a number already used by an existing ADR
- **THEN** it must be renumbered to the next available number

#### Scenario: Superseded ADR

- **WHEN** a decision is reversed or replaced by a new ADR
- **THEN** the old ADR updates its status to `Superseded by [ADR-NNNN]` and keeps its number

### Requirement: ADR creation

#### Scenario: Significant decision without ADR

- **WHEN** a decision affects multiple packages or constrains future development
- **THEN** an ADR must be created before or alongside the implementing code

### Requirement: CLI documentation

#### Scenario: New command without docs

- **WHEN** a new `specd` command is added to `@specd/cli`
- **THEN** a corresponding `docs/cli/<command>.md` file must be created in the same change

#### Scenario: Output contract changes without doc update

- **WHEN** an existing `specd` command changes its output semantics, caching behavior, or other documented response contract
- **THEN** the corresponding `docs/cli/` reference must be updated in the same change

#### Scenario: docs/cli/index.md serves as complete CLI directory

- **WHEN** inspecting `docs/cli/`
- **THEN** `docs/cli/index.md` exists and indexes every available CLI command and subcommand group
- **AND** every CLI command has a dedicated reference file in `docs/cli/`

#### Scenario: User-facing CLI recipes and workflows maintained in docs/guide/cli.md

- **WHEN** reviewing CLI user documentation
- **THEN** `docs/guide/cli.md` provides scenario-based usage recipes, flags, and examples for end users and AI agents

### Requirement: MCP documentation

#### Scenario: New MCP tool without docs

- **WHEN** a new tool is added to `@specd/mcp`
- **THEN** a corresponding entry in `docs/mcp/` must be created in the same change

### Requirement: Core documentation

#### Scenario: New public port without docs

- **WHEN** a new port interface is added to `@specd/core/application/ports/`
- **THEN** a corresponding entry in `docs/core/` must be created in the same change

### Requirement: SDK documentation

#### Scenario: docs/sdk is the only integrator entry point

- **WHEN** the Docusaurus sidebar is inspected
- **THEN** **SDK** appears as the integrator category
- **AND** `docs/sdk/` contains the canonical host guide
- **AND** `docs/core/` and `docs/code-graph/` are labeled or positioned as package reference, not peer integrator entry points

#### Scenario: package-reference indexes redirect hosts to SDK

- **WHEN** `docs/core/index.md` or `docs/code-graph/index.md` is read
- **THEN** a callout directs hosts to `docs/sdk/` and `@specd/sdk` imports
- **AND** the page does not instruct hosts to mix `@specd/core` and `@specd/code-graph` imports

#### Scenario: sdk docs forbid mixed host imports

- **WHEN** `docs/sdk/` is read
- **THEN** it states hosts import from `@specd/sdk` only
- **AND** it does not present `@specd/core` + `@specd/code-graph` as a combined host pattern

#### Scenario: core use-cases label core-only audience

- **WHEN** `docs/core/use-cases.md` shows `@specd/core` imports
- **THEN** examples are labeled for plugin / core-only consumers
- **AND** host integrators are directed to `docs/sdk/` for `@specd/sdk` examples

### Requirement: JSDoc on all symbols

#### Scenario: Exported function without JSDoc

- **WHEN** an exported function in `@specd/core` has no JSDoc block comment
- **THEN** the linter must report an error

#### Scenario: Internal helper without JSDoc

- **WHEN** a non-exported helper function has no JSDoc
- **THEN** the linter must not report an error

### Requirement: Public composition-surface documentation stays aligned

#### Scenario: Composition API change updates docs

- **WHEN** the public composition contracts of `@specd/core` are refactored
- **THEN** the corresponding documentation in `docs/` is updated to reflect the new factory and kernel composition model

### Requirement: Documentation stays aligned with removed/renamed template variables and list/summary contracts

#### Scenario: Removed template variable token requires doc updates in the same change

- **GIVEN** a change removes the `{{change.workspace}}` template variable token from `core:template-variables`
- **AND** `docs/config/config-reference.md`, `docs/guide/workspaces.md`, `docs/guide/workflow.md`, and `docs/adr/0013-workspaces-not-scopes.md` all document or illustrate that token
- **WHEN** the change is reviewed for documentation alignment
- **THEN** every one of those files is updated in the same change to drop or replace the stale token references
- **AND** none of them is left documenting `{{change.workspace}}` as a supported token

#### Scenario: Changed listing/summary use case contract requires doc updates in the same change

- **GIVEN** a change alters a listing or summary use case's return shape or dependency-resolution contract (for example `GetProjectSummary` or `ListSpecs`)
- **AND** `docs/core/use-cases.md` documents the old shape or dependency list
- **WHEN** the change is reviewed for documentation alignment
- **THEN** `docs/core/use-cases.md` is updated in the same change to reflect the new contract

#### Scenario: CLI output contract change requires cli-reference update in the same change

- **GIVEN** a change alters a CLI command's flags, JSON/toon output shape, or pagination behavior
- **AND** `docs/cli/cli-reference.md` documents the old flags or output shape for that command
- **WHEN** the change is reviewed for documentation alignment
- **THEN** `docs/cli/cli-reference.md` is updated in the same change

#### Scenario: Configuration cascade docs must remain aligned without contradiction

- **GIVEN** documentation covering configuration cascade layering (`specd.yaml`, `specd.*.yaml`, `specd.local.yaml`)
- **WHEN** `docs/guide/configuration.md` and `docs/guide/configuration-examples.md` are reviewed
- **THEN** both accurately document the layered cascade merge behavior
- **AND** neither file asserts that `specd.local.yaml` is not merged or layered

#### Scenario: Illustrative doc list is not exhaustive

- **GIVEN** a doc file not among `docs/guide/configuration.md`, `docs/guide/configuration-examples.md`, `docs/guide/workspaces.md`, `docs/guide/workflow.md`, `docs/guide/schemas.md`, `docs/schemas/schema-format.md`, `docs/adr/0013-workspaces-not-scopes.md`, `docs/core/use-cases.md`, `docs/cli/cli-reference.md`
- **AND** that file documents the same removed/renamed token or stale contract shape
- **WHEN** the change is reviewed for documentation alignment
- **THEN** that file is equally in scope and must be updated in the same change

#### Scenario: Follow-up-only documentation fix is rejected

- **GIVEN** a change removes a public template variable token or changes a listing/summary use case's public contract
- **AND** the author proposes updating the affected `docs/` files as separate follow-up work
- **WHEN** the change is reviewed for documentation alignment
- **THEN** the review rejects deferring those doc updates — they MUST land in the same change
