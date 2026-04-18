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

- **GIVEN** a step with hooks `pre: [{ id: "guidance", type: "instruction", text: "Read tasks" }, { id: "lint", type: "run", command: "pnpm lint" }, { id: "test", type: "run", command: "pnpm test" }]`
- **WHEN** `RunStepHooks` collects hooks for the pre phase
- **THEN** the collection contains only `lint` and `test` in that order
- **AND** `guidance` is not in the collection

### Requirement: External hook dispatch

#### Scenario: External hook is dispatched to the runner selected by accepted type

- **GIVEN** a workflow phase includes an explicit external hook whose `external.type` is `docker`
- **AND** one registered external hook runner declares support for `docker`
- **WHEN** `RunStepHooks.execute(...)` collects and runs hooks for that phase
- **THEN** the hook is executed through that external runner
- **AND** the runner receives the hook type, nested opaque config, and template variables for the change

#### Scenario: Unknown external hook type fails clearly

- **GIVEN** a workflow phase includes an explicit external hook whose `external.type` is `docker`
- **AND** no registered external hook runner declares support for `docker`
- **WHEN** `RunStepHooks.execute(...)` runs that phase
- **THEN** it fails with a clear error
- **AND** the hook is not silently skipped

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

### Requirement: HookVariables construction

#### Scenario: Archived post-phase includes archivedName in change namespace

- **GIVEN** the active change is not found in `ChangeRepository`
- **AND** the request is `step: "archiving"` with `phase: "post"`
- **AND** the archived change exists with archived name `20260418-103000-add-auth`
- **WHEN** `RunStepHooks.execute` builds `TemplateVariables` for hook execution
- **THEN** the `change` namespace includes `name`, `workspace`, `path`, and `archivedName`
- **AND** `change.archivedName` equals `20260418-103000-add-auth`

#### Scenario: Active change path may omit archivedName

- **GIVEN** the change is loaded from `ChangeRepository`
- **WHEN** `RunStepHooks.execute` builds `TemplateVariables`
- **THEN** the `change` namespace includes `name`, `workspace`, and `path`
- **AND** `change.archivedName` may be absent

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

### Requirement: Change lookup — archive fallback

#### Scenario: Post-archiving fallback — change found in archive

- **GIVEN** a change named `my-change` does not exist in `ChangeRepository`
- **AND** `ArchiveRepository.get("my-change")` returns an `ArchivedChange`
- **WHEN** `RunStepHooks.execute` is called with `name: "my-change"`, `step: "archiving"`, `phase: "post"`
- **THEN** the use case proceeds normally using the archived change
- **AND** `change.path` template variable resolves to `ArchiveRepository.archivePath(archivedChange)`

#### Scenario: Post-archiving fallback — change not in either repository

- **GIVEN** a change named `nonexistent` does not exist in `ChangeRepository`
- **AND** `ArchiveRepository.get("nonexistent")` returns `null`
- **WHEN** `RunStepHooks.execute` is called with `name: "nonexistent"`, `step: "archiving"`, `phase: "post"`
- **THEN** `ChangeNotFoundError` is thrown

#### Scenario: Active change takes precedence over archived

- **GIVEN** a change named `my-change` exists in both `ChangeRepository` and `ArchiveRepository`
- **WHEN** `RunStepHooks.execute` is called with `name: "my-change"`, `step: "archiving"`, `phase: "post"`
- **THEN** the active change from `ChangeRepository` is used
- **AND** `ArchiveRepository.get()` is not called

#### Scenario: Non-archiving step does not fall back to archive

- **GIVEN** a change named `my-change` does not exist in `ChangeRepository`
- **AND** `ArchiveRepository.get("my-change")` would return an `ArchivedChange`
- **WHEN** `RunStepHooks.execute` is called with `name: "my-change"`, `step: "implementing"`, `phase: "post"`
- **THEN** `ChangeNotFoundError` is thrown immediately
- **AND** `ArchiveRepository.get()` is not called
