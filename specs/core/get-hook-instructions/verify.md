# Verification: GetHookInstructions

## Requirements

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws SchemaMismatchError

- **GIVEN** a change created with schema `spec-driven`
- **AND** the active schema in `specd.yaml` is `custom-schema`
- **WHEN** `GetHookInstructions.execute` is called
- **THEN** `SchemaMismatchError` is thrown

### Requirement: Step resolution

#### Scenario: Invalid step name throws StepNotValidError

- **GIVEN** a valid schema
- **WHEN** `GetHookInstructions.execute` is called with `step: "reviewing"`
- **THEN** `StepNotValidError` is thrown because `reviewing` is not a valid `ChangeState`

#### Scenario: Archiving step is accepted as a valid ChangeState

- **GIVEN** a schema with workflow steps `[designing, implementing, verifying, archiving]`
- **WHEN** `GetHookInstructions.execute` is called with `step: "archiving"`
- **THEN** no error is thrown
- **AND** the step is resolved normally via `schema.workflowStep("archiving")`

#### Scenario: Valid state without workflow entry returns empty

- **GIVEN** a schema with workflow steps `[designing, implementing, verifying, archiving]`
- **WHEN** `GetHookInstructions.execute` is called with `step: "ready"` and `phase: "pre"`
- **THEN** the result is `{ phase: "pre", instructions: [] }`

### Requirement: Instruction collection

#### Scenario: Only instruction hooks are collected

- **GIVEN** a step with `hooks.pre: [{ id: "guidance", instruction: "Read tasks" }, { id: "lint", run: "pnpm lint" }, { id: "review", instruction: "Review changes" }]`
- **WHEN** `GetHookInstructions` collects hooks for the pre phase
- **THEN** the result contains `[{ id: "guidance", text: "Read tasks" }, { id: "review", text: "Review changes" }]`
- **AND** `lint` is not included

#### Scenario: Schema hooks precede project hooks

- **GIVEN** schema pre instruction hooks `[{ id: "s-read", instruction: "Schema instruction" }]`
- **AND** project pre instruction hooks `[{ id: "p-read", instruction: "Project instruction" }]`
- **WHEN** `GetHookInstructions` collects hooks for the pre phase
- **THEN** the result is `[s-read, p-read]` in that order

### Requirement: Hook filtering with --only

#### Scenario: Single instruction hook returned by ID

- **GIVEN** pre hooks `[{ id: "guidance", instruction: "Read tasks" }, { id: "review", instruction: "Review changes" }]`
- **WHEN** `GetHookInstructions.execute` is called with `only: "review"`
- **THEN** the result contains only `{ id: "review", text: "Review changes" }`

#### Scenario: Filtering by run hook ID throws error

- **GIVEN** pre hooks `[{ id: "lint", run: "pnpm lint" }]`
- **WHEN** `GetHookInstructions.execute` is called with `only: "lint"`
- **THEN** a domain error is thrown — `run:` hooks are not queryable via this use case

#### Scenario: Unknown hook ID throws error

- **GIVEN** pre hooks `[{ id: "guidance", instruction: "Read tasks" }]`
- **WHEN** `GetHookInstructions.execute` is called with `only: "nonexistent"`
- **THEN** a domain error is thrown

### Requirement: Result shape

#### Scenario: No instruction hooks returns empty array

- **GIVEN** a step with only `run:` hooks in the pre phase
- **WHEN** `GetHookInstructions.execute` is called with `phase: "pre"`
- **THEN** the result is `{ phase: "pre", instructions: [] }`
