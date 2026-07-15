# Change Run Hooks

## Purpose

Agent-driven workflow steps declare `run:` hooks that must be executed at step boundaries, but agents interact with specd through CLI commands — they cannot call use cases directly. `specd change run-hooks` is the CLI command that lets agents execute `run:` hooks for a given step and phase, with clear exit codes that signal whether to proceed or stop. It delegates to the `RunStepHooks` use case and formats the results for agent or human consumption.

For long-running hooks, the command must also make in-flight execution visible instead of appearing silent until process exit.

## Requirements

### Requirement: Command signature

```
specd change run-hooks <name> <step> --phase pre|post [--only <hook-id>] [--format text|json|toon]
```

- `<name>` — required positional; the change name
- `<step>` — required positional; the workflow step name (e.g. `implementing`, `verifying`, `archiving`)
- `--phase pre|post` — required flag; which hook phase to execute
- `--only <hook-id>` — optional flag; execute only the hook with this ID (useful for retrying a single failed hook)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Delegates to RunStepHooks

The command MUST delegate all hook resolution and execution to the `RunStepHooks` use case. It MUST NOT resolve schemas, collect hooks, or call `HookRunner` directly.

### Requirement: Exit code 0 on success

When all hooks execute successfully (or no hooks match), the command exits with code 0.

When no `run:` hooks exist for the given step+phase:

- `text` prints `no hooks to run` to stdout
- `json` and `toon` emit a terminal stdout `stream: "run-hooks"` record with `event.type: "complete"` and `result: { result: "ok", hooks: [] }`

When hooks do run successfully:

- `text` leaves progress on stderr and emits a final human-readable summary on stdout
- `json` and `toon` emit a terminal stdout `stream: "run-hooks"` `complete` record carrying the successful hook results

### Requirement: Exit code 2 on hook failure

When any `run:` hook exits with a non-zero code, the command exits with code 2 (per the entrypoint spec's hook failure convention).

In `text`, in-flight progress and failed-hook context are rendered to stderr, and stdout still carries the final human-readable summary.

In `json` and `toon`, stdout emits a terminal `stream: "run-hooks"` `complete` record whose result identifies `code: "HOOK_FAILED"`, the executed hooks, and `failedHooks`.

### Requirement: Exit code 1 on domain errors

The command exits with code 1 for:

- Change not found (`ChangeNotFoundError`)
- Step is not a valid lifecycle state (`StepNotValidError`)
- Unknown hook ID when `--only` is specified (`HookNotFoundError` with reason `'not-found'`)
- Hook ID refers to an `instruction:` hook instead of a `run:` hook (`HookNotFoundError` with reason `'wrong-type'`)
- Schema mismatch (`SchemaMismatchError`)

### Requirement: Text output format

When `--format` is `text` (default), the command MUST render append-only progress that keeps previously executed hooks visible.

For a running hook, the text output MUST show:

- the hook status, which MAY include a lightweight spinner such as `[⠋ running]`
- the hook ID
- the command being executed
- recent observable output while the hook remains active

When a hook completes successfully, the command MUST leave a visible historical record for that hook instead of erasing it while the next hook starts.

When a hook fails, the command MUST show the full output for the failed hook rather than only a short summary line.

When all hooks succeed, the rendered history MUST remain understandable without requiring the user to infer what happened from a single final line.

### Requirement: Long-running hook observability

The command MUST NOT remain silent for the full duration of a long-running hook when progress information is available from the hook execution pipeline.

If a hook stays active without emitting new stdout/stderr, the command MUST surface liveness through progress output rather than forcing the caller to wait for final process exit to learn that the hook is still running.

### Requirement: Shared hook progress presentation

The command MUST use the same hook progress presentation model as `specd change transition` for equivalent hook events.

The CLI implementation MUST centralize that presentation logic in a shared helper so the two commands do not drift in:

- running-status labels
- recent-output tail rendering
- liveness signalling
- failed-hook full-output rendering

### Requirement: JSON output format

When `--format` is `json` or `toon`, all machine-readable output MUST be emitted on stdout as a newline-delimited structured stream.

Hook lifecycle updates MUST be emitted as `stream: "hook-progress"` records so consumers can observe:

- hook start
- hook output activity
- liveness signals for long-running hooks without new output
- hook completion

After execution completes, the command MUST emit one terminal `stream: "run-hooks"` record whose event type is `complete`.

That terminal record MUST contain the final hook results with `id`, `command`, `exitCode`, and `success`, plus any captured output required by the error contract.

The terminal `complete` record MUST expose `failedHooks` so consumers can identify every failed hook result without re-deriving that subset from raw output.

### Requirement: Works for any step including archiving

The command MUST accept any step name defined in the schema, including `archiving`. While `specd change archive` handles hooks internally during the full archive operation, `specd change run-hooks <name> archiving --phase pre` can be used to run pre-archive checks independently — for example, to verify hooks pass before committing to the archive.

## Constraints

- `--phase` is required — the command does not execute both phases at once
- The command does not perform state transitions — it only executes hooks
- The command does not validate step availability — the agent is responsible for calling it at the appropriate time
- Exit code 2 is used exclusively for hook failures, consistent with the entrypoint spec
- In `text`, progress is rendered to stderr and the final human-readable summary is rendered to stdout
- In `json` and `toon`, machine-readable progress and the final `complete` record are emitted on stdout; stderr is reserved for non-structured diagnostics

## Examples

```bash
# Execute pre-hooks for the implementing step
specd change run-hooks add-auth implementing --phase pre

# Execute post-hooks with JSON output
specd change run-hooks add-auth implementing --phase post --format json

# Retry a single failed hook
specd change run-hooks add-auth implementing --phase pre --only run-tests

# Run pre-archive checks without archiving
specd change run-hooks add-auth archiving --phase pre
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes (0, 1, 2), output conventions, `--format` flag
- [`core:run-step-hooks`](../../core/run-step-hooks/spec.md) — `RunStepHooks` use case, result shape
- [`core:hook-execution-model`](../../core/hook-execution-model/spec.md) — hook types, failure semantics, agent-driven execution mode
