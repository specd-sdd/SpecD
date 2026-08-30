# Verification: Standard Schema

## Requirements

### Requirement: Canonical Schema Definition

#### Scenario: Schema root properties are parsed correctly

- **GIVEN** the `@specd/schema-std` package root
- **WHEN** loading `schema.yaml`
- **THEN** it contains `name: schema-std`, an integer `version`, an `artifacts` array, and a `workflow` array

### Requirement: Artifact Dependency Graph (DAG) Invariants

#### Scenario: Artifact DAG enforces full prerequisite chain

- **GIVEN** the parsed `artifacts` array from `schema.yaml`
- **WHEN** inspecting artifact dependencies
- **THEN** `proposal` has no prerequisites
- **AND** `specs` requires `proposal`
- **AND** `verify` requires `specs`
- **AND** `design` requires `proposal`, `specs`, and `verify`
- **AND** `tasks` requires `specs`, `verify`, and `design` with `hasTasks: true`

#### Scenario: No cycles exist in the artifact DAG

- **GIVEN** the parsed artifact dependency graph
- **WHEN** checking for cycles via topological sorting
- **THEN** the graph resolves without cyclic dependency errors

### Requirement: Proposal Artifact Contract and Instructions

#### Scenario: Proposal definition enforces problem scoping sections and post-rules

- **GIVEN** the `proposal` artifact entry in `schema.yaml`
- **WHEN** evaluating its `instruction` and `rules.post`
- **THEN** instructions require Motivation, Current behaviour, Proposed solution, Specs affected, Impact, Technical context, and Open questions
- **AND** post-rules enforce resolution of open questions and registration of spec dependencies

### Requirement: Specs Artifact Contract, Instructions, and Deltas

#### Scenario: Specs definition configures requirements structure, validations, and deltas

- **GIVEN** the `specs` artifact entry in `schema.yaml`
- **WHEN** evaluating its definition and rules
- **THEN** `validations` enforces a `Requirements` section containing `### Requirement:` blocks
- **AND** `delta: true` and `deltaInstruction` are configured for AST-level delta editing
- **AND** a post-rule verifies coverage for all specs listed in the proposal

### Requirement: Verify Artifact Contract, Instructions, and Deltas

#### Scenario: Verify definition configures scenario structure and delta validations

- **GIVEN** the `verify` artifact entry in `schema.yaml`
- **WHEN** evaluating its definition and rules
- **THEN** `validations` requires Gherkin-style `#### Scenario:` subheadings under matching requirement headings
- **AND** `deltaValidations` enforces scenario presence in added/modified requirement deltas
- **AND** a post-rule verifies requirement-to-scenario parity

### Requirement: Design Artifact Contract and Instructions

#### Scenario: Design definition enforces complete implementation blueprint

- **GIVEN** the `design` artifact entry in `schema.yaml`
- **WHEN** evaluating its `instruction` and `rules.post`
- **THEN** instructions demand a self-contained contract covering affected areas, new constructs, data contracts, flow, error handling, decisions, trade-offs, spec impact, dependency map, testing, and open questions
- **AND** post-rules check complete design and testing coverage for all requirements and scenarios

### Requirement: Tasks Artifact Contract, Instructions, and Tracking

#### Scenario: Tasks definition configures checklist breakdown and progress tracking

- **GIVEN** the `tasks` artifact entry in `schema.yaml`
- **WHEN** evaluating its definition
- **THEN** `hasTasks` is `true`
- **AND** `preHashCleanup` normalizes checkboxes
- **AND** `taskCompletionCheck` configures regex tracking for incomplete and complete items
- **AND** instructions require minimal task breakdown with target file/symbol, approach, and requirement mapping

### Requirement: Cross-Artifact Validations and Parity Rules

#### Scenario: Schema declares spec-verify requirement parity

- **GIVEN** `crossArtifactValidations` in `schema.yaml`
- **WHEN** inspecting declared rules
- **THEN** rule `specs-verify-requirement-parity` enforces exact equality between `specs` and `verify` requirement labels

### Requirement: Metadata Extraction Rules

#### Scenario: Schema extracts normalized spec and scenario metadata

- **GIVEN** `metadataExtraction` in `schema.yaml`
- **WHEN** inspecting declared extractors
- **THEN** extractors are configured for title, description, dependsOn, rules, constraints, scenarios, and context

### Requirement: Lifecycle Steps and State Transitions

#### Scenario: Standard lifecycle steps and transitions are defined

- **GIVEN** the `workflow` section in `schema.yaml`
- **WHEN** querying supported change workflow steps
- **THEN** steps `drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `pending-signoff`, `signed-off`, and `archiving` are present with explicit valid transitions

### Requirement: Schema Package Distribution

#### Scenario: Schema files are accessible as pure ESM package

- **GIVEN** consumer packages `@specd/core` or `@specd/cli` resolving `@specd/schema-std`
- **WHEN** accessing `schema.yaml` and `templates/`
- **THEN** assets are resolved directly from package root without requiring a build compilation step
