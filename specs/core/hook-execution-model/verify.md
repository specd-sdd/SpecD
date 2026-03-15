# Verification: Hook Execution Model

## Requirements

### Requirement: Two hook types

#### Scenario: instruction hook is not executed by RunStepHooks

- **GIVEN** a workflow step with hooks `pre: [{ id: "guidance", instruction: "Read the tasks" }, { id: "lint", run: "pnpm lint" }]`
- **WHEN** `RunStepHooks` executes pre-hooks for this step
- **THEN** only the `lint` hook is executed via `HookRunner`
- **AND** the `guidance` instruction hook is skipped entirely

### Requirement: instruction hooks are passive text

#### Scenario: CompileContext does not include instruction hooks

- **GIVEN** a workflow step with `hooks.pre: [{ id: "read-tasks", instruction: "Read pending tasks" }]`
- **WHEN** `CompileContext` compiles context for this step
- **THEN** the instruction text does NOT appear in the instruction block
- **AND** instruction hooks are only available via `GetHookInstructions`

#### Scenario: ArchiveChange skips instruction hooks

- **GIVEN** the archiving step with `hooks.pre: [{ id: "review", instruction: "Review deltas" }, { id: "test", run: "pnpm test" }]`
- **WHEN** `ArchiveChange` executes pre-archive hooks
- **THEN** only `pnpm test` is executed
- **AND** the `review` instruction hook is skipped

#### Scenario: Individual instruction query by hook ID

- **GIVEN** a workflow step with `hooks.pre: [{ id: "read-tasks", instruction: "Read pending tasks" }, { id: "lint", run: "pnpm lint" }]`
- **WHEN** `GetHookInstructions` is called with `step`, `phase: "pre"`, and `only: "read-tasks"`
- **THEN** only the text `"Read pending tasks"` is returned
- **AND** the `lint` run hook is not included

#### Scenario: All instructions returned when no filter

- **GIVEN** a step with `hooks.pre: [{ id: "a", instruction: "First" }, { id: "b", run: "cmd" }, { id: "c", instruction: "Second" }]`
- **WHEN** `GetHookInstructions` is called with `phase: "pre"` and no `only` filter
- **THEN** both instruction hooks are returned in order: `a` then `c`
- **AND** the `run:` hook `b` is not included

### Requirement: Two execution modes for run hooks

#### Scenario: Archiving hooks executed by ArchiveChange directly

- **GIVEN** the archiving step with `run:` pre-hooks
- **WHEN** the agent runs `specd change archive`
- **THEN** `ArchiveChange` calls `HookRunner.run()` directly for each `run:` hook
- **AND** the agent does not need to call `specd change run-hooks`

#### Scenario: Implementing hooks executed by agent via CLI

- **GIVEN** the implementing step with `run:` pre-hooks
- **WHEN** the agent enters the implementing step
- **THEN** the agent must call `specd change run-hooks <name> implementing --phase pre`
- **AND** hook execution is handled by the `RunStepHooks` use case

### Requirement: Pre-hook failure semantics

#### Scenario: Deterministic pre-hook failure aborts archive

- **GIVEN** the archiving step with pre-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **WHEN** `ArchiveChange` executes pre-hooks
- **THEN** `HookFailedError` is thrown with command `pnpm test`, exit code 1, and stderr
- **AND** `pnpm lint` is never executed
- **AND** no files are modified

#### Scenario: Agent-driven pre-hook failure exits code 2

- **GIVEN** the implementing step with pre-hooks `[{ id: "check", run: "pnpm typecheck" }]`
- **AND** `pnpm typecheck` exits with code 1
- **WHEN** the agent runs `specd change run-hooks <name> implementing --phase pre`
- **THEN** the CLI exits with code 2
- **AND** the result includes the failed hook details

### Requirement: Post-hook failure semantics

#### Scenario: Deterministic post-hook failure does not rollback

- **GIVEN** the archiving step with post-hooks `[{ id: "branch", run: "git checkout -b x" }, { id: "notify", run: "curl webhook" }]`
- **AND** `git checkout -b x` exits with code 1
- **WHEN** `ArchiveChange` executes post-hooks
- **THEN** `curl webhook` is still executed
- **AND** both results are collected
- **AND** `postHookFailures` includes the `branch` hook failure
- **AND** the archive is NOT rolled back

#### Scenario: Agent-driven post-hook failure continues execution

- **GIVEN** the implementing step with post-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **WHEN** the agent runs `specd change run-hooks <name> implementing --phase post`
- **THEN** `pnpm lint` is still executed
- **AND** the CLI exits with code 2 (at least one hook failed)
- **AND** results for both hooks are returned

### Requirement: Hook ordering

#### Scenario: Schema hooks execute before project hooks

- **GIVEN** schema-level pre-hooks `[{ id: "schema-lint", run: "pnpm lint" }]`
- **AND** project-level pre-hooks `[{ id: "project-check", run: "pnpm typecheck" }]`
- **WHEN** hooks are executed for this step's pre phase
- **THEN** `pnpm lint` executes first
- **AND** `pnpm typecheck` executes second

### Requirement: change transition does not execute hooks

#### Scenario: Transition with hooks defined does not run them

- **GIVEN** the implementing step has `run:` pre-hooks defined
- **WHEN** the agent runs `specd change transition <name> implementing`
- **THEN** the transition succeeds
- **AND** no hooks are executed
- **AND** the change state is updated to `implementing`
