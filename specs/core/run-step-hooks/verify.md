# Verification: RunStepHooks

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
- **WHEN** `RunStepHooks.execute` is called with `step: "reviewing"`
- **THEN** `StepNotValidError` is thrown because `reviewing` is not a valid `ChangeState`

#### Scenario: Archiving step is accepted as a valid ChangeState

- **GIVEN** a schema with workflow steps `[designing, implementing, verifying, archiving]`
- **WHEN** `RunStepHooks.execute` is called with `step: "archiving"`
- **THEN** no error is thrown
- **AND** the step is resolved normally via `schema.workflowStep("archiving")`

#### Scenario: Valid state without workflow entry returns empty

- **GIVEN** a schema with workflow steps `[designing, implementing, verifying, archiving]`
- **WHEN** `RunStepHooks.execute` is called with `step: "ready"` and `phase: "pre"`
- **THEN** the result is `{ hooks: [], success: true, failedHook: null }`

### Requirement: Hook collection

#### Scenario: instruction hooks are excluded from collection

- **GIVEN** a step with hooks `pre: [{ id: "guidance", instruction: "Read tasks" }, { id: "lint", run: "pnpm lint" }, { id: "test", run: "pnpm test" }]`
- **WHEN** `RunStepHooks` collects hooks for the pre phase
- **THEN** the collection contains only `lint` and `test` in that order
- **AND** `guidance` is not in the collection

#### Scenario: Schema hooks precede project hooks

- **GIVEN** schema pre-hooks `[{ id: "s-test", run: "pnpm test" }]`
- **AND** project pre-hooks `[{ id: "p-lint", run: "pnpm lint" }]`
- **WHEN** `RunStepHooks` collects hooks for the pre phase
- **THEN** the collection is `[s-test, p-lint]` in that order

### Requirement: Hook filtering with --only

#### Scenario: Single hook selected by ID

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **WHEN** `RunStepHooks.execute` is called with `only: "lint"`
- **THEN** only the `lint` hook is executed
- **AND** `test` is not executed

#### Scenario: Unknown hook ID throws HookNotFoundError

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **WHEN** `RunStepHooks.execute` is called with `only: "unknown-hook"`
- **THEN** `HookNotFoundError` is thrown with reason `'not-found'`

#### Scenario: Instruction hook ID throws HookNotFoundError

- **GIVEN** pre-hooks `[{ id: "guidance", instruction: "Read tasks" }, { id: "test", run: "pnpm test" }]`
- **WHEN** `RunStepHooks.execute` is called with `only: "guidance"`
- **THEN** `HookNotFoundError` is thrown with reason `'wrong-type'`

### Requirement: Pre-phase execution (fail-fast)

#### Scenario: First hook failure stops execution

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **WHEN** `RunStepHooks.execute` is called with `phase: "pre"`
- **THEN** the result contains one hook result (for `test`) with `success: false`
- **AND** `lint` was never executed
- **AND** `result.success` is `false`
- **AND** `result.failedHook` identifies the `test` hook

#### Scenario: All pre-hooks succeed

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** both exit with code 0
- **WHEN** `RunStepHooks.execute` is called with `phase: "pre"`
- **THEN** the result contains two hook results, both with `success: true`
- **AND** `result.success` is `true`
- **AND** `result.failedHook` is `null`

### Requirement: Post-phase execution (fail-soft)

#### Scenario: Failed post-hook does not stop subsequent hooks

- **GIVEN** post-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **AND** `pnpm lint` exits with code 0
- **WHEN** `RunStepHooks.execute` is called with `phase: "post"`
- **THEN** both hooks are executed
- **AND** the result contains two hook results
- **AND** `result.success` is `false`
- **AND** `result.failedHook` is `null` (fail-soft, no single failed hook)

### Requirement: Result shape

#### Scenario: No hooks to run

- **GIVEN** a step with no `run:` hooks in the pre phase (only `instruction:` hooks or no hooks at all)
- **WHEN** `RunStepHooks.execute` is called with `phase: "pre"`
- **THEN** the result is `{ hooks: [], success: true, failedHook: null }`

### Requirement: Works for any step

#### Scenario: RunStepHooks targets archiving step

- **GIVEN** the archiving step with pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **WHEN** `RunStepHooks.execute` is called with `step: "archiving"`, `phase: "pre"`
- **THEN** `pnpm test` is executed via `HookRunner`
- **AND** the result includes the hook outcome
