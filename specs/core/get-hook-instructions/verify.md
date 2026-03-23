# Verification: GetHookInstructions

## Requirements

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws SchemaMismatchError

- **GIVEN** a change created with schema `spec-driven`
- **AND** `SchemaProvider.get()` returns a schema named `custom-schema`
- **WHEN** `execute` is called
- **THEN** `SchemaMismatchError` is thrown
- **AND** no hooks are executed

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

- **GIVEN** a step with `hooks.pre: [{ id: "guidance", type: "instruction", text: "Read tasks" }, { id: "lint", type: "run", command: "pnpm lint" }, { id: "review", type: "instruction", text: "Review changes" }]`
- **WHEN** `GetHookInstructions` collects hooks for the pre phase
- **THEN** the result contains `[{ id: "guidance", text: "Read tasks" }, { id: "review", text: "Review changes" }]`
- **AND** `lint` is not included

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

### Requirement: Change lookup — archive fallback

#### Scenario: Post-archiving fallback — change found in archive

- **GIVEN** a change named `my-change` does not exist in `ChangeRepository`
- **AND** `ArchiveRepository.get("my-change")` returns an `ArchivedChange`
- **WHEN** `GetHookInstructions.execute` is called with `name: "my-change"`, `step: "archiving"`, `phase: "post"`
- **THEN** the use case proceeds normally using the archived change
- **AND** `change.path` template variable resolves to `ArchiveRepository.archivePath(archivedChange)`

#### Scenario: Post-archiving fallback — change not in either repository

- **GIVEN** a change named `nonexistent` does not exist in `ChangeRepository`
- **AND** `ArchiveRepository.get("nonexistent")` returns `null`
- **WHEN** `GetHookInstructions.execute` is called with `name: "nonexistent"`, `step: "archiving"`, `phase: "post"`
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Active change takes precedence over archived

- **GIVEN** a change named `my-change` exists in both `ChangeRepository` and `ArchiveRepository`
- **WHEN** `GetHookInstructions.execute` is called with `name: "my-change"`, `step: "archiving"`, `phase: "post"`
- **THEN** the active change from `ChangeRepository` is used
- **AND** `ArchiveRepository.get()` is not called

#### Scenario: Non-archiving step does not fall back to archive

- **GIVEN** a change named `my-change` does not exist in `ChangeRepository`
- **AND** `ArchiveRepository.get("my-change")` would return an `ArchivedChange`
- **WHEN** `GetHookInstructions.execute` is called with `name: "my-change"`, `step: "implementing"`, `phase: "post"`
- **THEN** `ChangeNotFoundError` is thrown immediately
- **AND** `ArchiveRepository.get()` is not called
