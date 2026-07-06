# Verification: RunStepHooks

## Requirements

### Requirement: Ports and constructor

#### Scenario: Constructor receives required dependencies

- **WHEN** `RunStepHooks` is instantiated
- **THEN** it receives `ChangeRepository`, `ArchiveRepository`, `HookRunner`, and `SchemaProvider`
- **AND** they are stored as instance properties for use during `execute`

### Requirement: Input

#### Scenario: execute receives name, step, phase, and optional only

- **WHEN** `RunStepHooks.execute` is invoked
- **THEN** it receives `name: string`, `step: string`, `phase: 'pre' | 'post'`, and optionally `only: string`
- **AND** these parameters control which change, workflow step, and hooks are processed

### Requirement: Progress callback

#### Scenario: Progress callback receives hook start and done events

- **GIVEN** `onProgress` callback is provided to `execute`
- **WHEN** hooks are executed
- **THEN** the callback receives `{ type: 'hook-start', hookId, command }` before each hook
- **AND** receives `{ type: 'hook-done', hookId, success, exitCode }` after each hook

### Requirement: Change lookup

#### Scenario: Change not found throws ChangeNotFoundError (non-archiving)

- **GIVEN** `ChangeRepository.get(name)` returns `null`
- **AND** the requested step is NOT `'archiving'` with phase `'post'`
- **WHEN** `execute` is called
- **THEN** `ChangeNotFoundError` is thrown immediately

#### Scenario: Archiving post-phase falls back to archive

- **GIVEN** `ChangeRepository.get(name)` returns `null`
- **AND** the requested step is `'archiving'` with phase `'post'`
- **WHEN** `execute` is called
- **THEN** it falls back to `ArchiveRepository.get(name)`
- **AND** if found, uses the archived change for template variables

#### Scenario: Change not found in archive throws error

- **GIVEN** `ChangeRepository.get(name)` returns `null`
- **AND** the requested step is `'archiving'` with phase `'post'`
- **AND** `ArchiveRepository.get(name)` also returns `null`
- **WHEN** `execute` is called
- **THEN** `ChangeNotFoundError` is thrown

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

### Requirement: Config-based factory delegates through resolveRunStepHooksDeps

#### Scenario: createRunStepHooks config form derives RunStepHooksDeps through resolveRunStepHooksDeps

- **WHEN** `createRunStepHooks(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `RunStepHooksDeps` through `resolveRunStepHooksDeps(resolver)`
- **AND** `resolveRunStepHooksDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `archive: ArchiveRepository`
- `hooks: HookRunner`
- `externalHookRunners: ReadonlyMap<string, ExternalHookRunner>`
- `schemaProvider: SchemaProvider`
- **AND** the factory delegates to canonical `createRunStepHooks(deps)`
