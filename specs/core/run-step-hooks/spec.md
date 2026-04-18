# RunStepHooks

## Purpose

Agent-driven workflow steps declare `run:` hooks that need to be executed at step boundaries, but the agent cannot call `HookRunner` directly — it interacts with specd through CLI commands. `RunStepHooks` is the use case that bridges this gap: given a change name, step name, and phase, it resolves the relevant `run:` hooks from the schema and project configuration, executes them via `HookRunner` with the correct failure semantics, and returns per-hook results for the CLI to report. It also serves as a shared hook execution engine for other use cases (`TransitionChange`, `ArchiveChange`) that need to run workflow hooks.

## Requirements

### Requirement: Ports and constructor

`RunStepHooks` receives at construction time: `ChangeRepository`, `ArchiveRepository`, `HookRunner`, and `SchemaProvider`.

```typescript
class RunStepHooks {
  constructor(
    changes: ChangeRepository,
    archive: ArchiveRepository,
    hooks: HookRunner,
    schemaProvider: SchemaProvider,
  )
}
```

`HookRunner` uses `TemplateExpander.expandForShell()` internally — `RunStepHooks` does not call the expander directly. It builds the `TemplateVariables` map and passes it to `HookRunner.run()`.

`SchemaProvider` returns the fully-resolved schema with plugins and overrides applied — all workflow hooks (including those added via `schemaOverrides`) are already present in the schema's workflow steps. All dependencies are injected at kernel composition time, not passed per invocation.

### Requirement: Input

`RunStepHooks.execute` receives:

- `name` (string, required) — the change name
- `step` (string, required) — the workflow step name (e.g. `implementing`, `verifying`, `archiving`)
- `phase` (`'pre'` | `'post'`, required) — which hook phase to execute
- `only` (string, optional) — when provided, filters to a single hook by its `id`; all other hooks in the phase are skipped

### Requirement: Progress callback

`RunStepHooks.execute` SHALL accept an optional second parameter `onProgress?: OnHookProgress`. Progress events are:

- `{ type: 'hook-start', hookId: string, command: string }` — emitted before each hook execution
- `{ type: 'hook-done', hookId: string, success: boolean, exitCode: number }` — emitted after each hook execution

### Requirement: Change lookup

`RunStepHooks` loads the change by name via `ChangeRepository`. If no change exists with the given name **and** the requested step is `'archiving'` with phase `'post'`, it MUST fall back to `ArchiveRepository.get(name)`. If the change is found in the archive, it MUST be used for template variable construction (using `ArchivedChange.name`, `ArchivedChange.workspace`, and `ArchiveRepository.archivePath(archivedChange)` for the `change.path` variable). If the change is not found in the archive either, it MUST throw `ChangeNotFoundError`.

For all other step/phase combinations, if `ChangeRepository.get(name)` returns null, `RunStepHooks` MUST throw `ChangeNotFoundError` immediately — the archive fallback does not apply.

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `RunStepHooks` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`. This MUST happen before any hook resolution or execution.

### Requirement: Step resolution

`RunStepHooks` validates that `step` is a valid `ChangeState` (a lifecycle state defined by the domain, which includes `archiving`). If it is not, it MUST throw `StepNotValidError`.

If the step is a valid lifecycle state, `RunStepHooks` looks up the workflow step entry via `schema.workflowStep(step)`. If no matching entry exists (the schema does not declare hooks for this step), the use case returns `{ hooks: [], success: true, failedHook: null }` — no error is thrown.

### Requirement: Hook collection

For the matched step and phase, `RunStepHooks` MUST collect `run:` hooks from `workflow[step].hooks[phase]` — only entries with `type: 'run'`, in declaration order.

`instruction:` entries (type `'instruction'`) MUST be skipped — they are not executable.

All hooks — whether from the base schema, plugins, or overrides — are already merged into the schema's workflow steps by `ResolveSchema`. There is no separate project-level hook collection.

### Requirement: External hook dispatch

`RunStepHooks` SHALL support explicit external hook entries in addition to shell `run:` hooks.

For an external hook entry, `RunStepHooks` MUST:

- read the hook's `external.type` and `external.config`
- resolve a registered external hook runner whose accepted-type declaration includes that type
- dispatch execution through that external runner

If no registered external runner accepts the hook's `external.type`, `RunStepHooks` MUST fail with a clear error.

### Requirement: Hook filtering with --only

When `only` is provided, `RunStepHooks` MUST filter the collected hook list to the single hook whose `id` matches the value. If no hook matches the ID, it MUST throw `HookNotFoundError` with reason `'not-found'`. If the ID matches an `instruction:` hook instead of a `run:` hook, it MUST throw `HookNotFoundError` with reason `'wrong-type'`.

### Requirement: HookVariables construction

`RunStepHooks` MUST build the contextual `TemplateVariables` from the resolved change and the appropriate repository path:

- `change.name` — the change name (from `Change.name` or `ArchivedChange.name`)
- `change.workspace` — the primary workspace (from `Change.workspaces[0]` or `ArchivedChange.workspace`)
- `change.path` — the absolute path to the change directory (via `ChangeRepository.changePath()` for active changes, or `ArchiveRepository.archivePath()` for archived changes)
- `change.archivedName` — the archived directory basename (`YYYYMMDD-HHmmss-<name>`) when the archived fallback path is used (archiving post phase)

For active changes (non-archived lookup path), `change.archivedName` may be absent.

Built-in variables (e.g. `project.root`) are already present in the `TemplateExpander` — the use case only builds the contextual `change` namespace.

### Requirement: Pre-phase execution (fail-fast)

When `phase` is `'pre'`, `RunStepHooks` MUST execute hooks sequentially in collection order. If any hook returns a non-zero exit code, execution MUST stop immediately — subsequent hooks are not run. The result includes all hooks that were executed (including the failed one) and identifies the failed hook.

### Requirement: Post-phase execution (fail-soft)

When `phase` is `'post'`, `RunStepHooks` MUST execute all hooks sequentially in collection order regardless of individual failures. Every hook runs even if earlier hooks fail. The result includes all hooks and identifies any that failed.

### Requirement: Result shape

`RunStepHooks.execute` MUST return a result object containing:

- `hooks` — array of per-hook results, each with:
  - `id` (string) — the hook's `id` from the schema or project config
  - `command` (string) — the expanded command string (after template variable substitution)
  - `exitCode` (number) — the process exit code
  - `stdout` (string) — captured stdout
  - `stderr` (string) — captured stderr
  - `success` (boolean) — `true` when exit code is 0
- `success` (boolean) — `true` when all executed hooks succeeded
- `failedHook` (object | null) — if a pre-hook failed (fail-fast), the failed hook result; `null` otherwise

When no hooks match (empty `run:` hook list for the step+phase, or the step has no hooks), the result is `{ hooks: [], success: true, failedHook: null }`.

### Requirement: Works for any step

`RunStepHooks` MUST work for any valid `ChangeState`, including `archiving`. While `ArchiveChange` delegates hook execution to `RunStepHooks`, `RunStepHooks` can also be called independently — for example, to run a pre-archive check without performing the full archive, or to retry a failed post-archive hook.

## Constraints

- `RunStepHooks` MUST NOT perform any state transition on the Change entity — it only executes hooks
- `RunStepHooks` MUST NOT execute `instruction:` hooks — only `run:` hooks
- Schema-level hooks always precede project-level hooks within the same phase
- Pre-phase uses fail-fast; post-phase uses fail-soft — this is not configurable
- Contextual `TemplateVariables` are built internally from the resolved change, not passed by the caller
- The use case does not validate whether the step is currently available — the agent is responsible for calling it at the appropriate time

## Spec Dependencies

- [`core:core/hook-execution-model`](../hook-execution-model/spec.md) — hook types, execution modes, failure semantics, ordering
- [`core:core/hook-runner-port`](../hook-runner-port/spec.md) — `HookRunner` interface, `HookResult`, `HookVariables`
- [`core:core/external-hook-runner-port`](../external-hook-runner-port/spec.md) — external hook runner contract and accepted-type dispatch
- [`core:core/schema-format`](../schema-format/spec.md) — `workflow[].hooks` structure, `run:`, `instruction:`, and explicit external entries
- [`core:core/config`](../config/spec.md) — project-level workflow hooks from `specd.yaml`
- [`core:core/change`](../change/spec.md) — Change entity, `schemaName`, `workspaces`
- [`core:core/template-variables`](../template-variables/spec.md) — `TemplateVariables` map, variable namespaces
- [`core:core/archive-repository-port`](../archive-repository-port/spec.md) — `ArchiveRepository` port, `get()`, `archivePath()`, `ArchivedChange`
