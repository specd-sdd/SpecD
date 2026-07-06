# Verification: Documentation Conventions

## Requirements

### Requirement: Directory structure

#### Scenario: Doc placed outside docs/

- **WHEN** a documentation file is created outside `docs/` (excluding `README.md`, `AGENTS.md`, `CLAUDE.md`)
- **THEN** it must be moved to the appropriate subdirectory under `docs/`

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
