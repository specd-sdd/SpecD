# Change Run Hooks

## Purpose

Agent-driven workflow steps declare `run:` hooks that must be executed at step boundaries, but agents interact with specd through CLI commands — they cannot call use cases directly. `specd change run-hooks` is the CLI command that lets agents execute `run:` hooks for a given step and phase, with clear exit codes that signal whether to proceed or stop. It delegates to the `RunStepHooks` use case and formats the results for agent or human consumption.

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

When no `run:` hooks exist for the given step+phase, the command prints `no hooks to run` to stdout (text format) or `{ "result": "ok", "hooks": [] }` (json/toon format) and exits with code 0.

### Requirement: Exit code 2 on hook failure

When any `run:` hook exits with a non-zero code, the command exits with code 2 (per the entrypoint spec's hook failure convention). The hook's stdout and stderr are forwarded to the CLI's stdout and stderr respectively.

### Requirement: Exit code 1 on domain errors

The command exits with code 1 for:

- Change not found (`ChangeNotFoundError`)
- Step is not a valid lifecycle state (`StepNotValidError`)
- Unknown hook ID when `--only` is specified (`HookNotFoundError` with reason `'not-found'`)
- Hook ID refers to an `instruction:` hook instead of a `run:` hook (`HookNotFoundError` with reason `'wrong-type'`)
- Schema mismatch (`SchemaMismatchError`)

### Requirement: Text output format

When `--format` is `text` (default):

- For each executed hook, print a result line to stdout:
  - Success: `ok: <hook-id>`
  - Failure: `failed: <hook-id> (exit code <n>)` followed by the hook's stderr on subsequent lines

- When all hooks succeed: no additional summary line
- When a pre-hook fails: only the hooks up to and including the failure are printed (fail-fast)
- When post-hooks fail: all hooks are printed, with failures clearly marked

### Requirement: JSON output format

When `--format` is `json` or `toon`, output to stdout:

On success:

```json
{
  "result": "ok",
  "hooks": [{ "id": "<hook-id>", "command": "<expanded-command>", "exitCode": 0, "success": true }]
}
```

On failure:

```json
{
  "result": "error",
  "code": "HOOK_FAILED",
  "hooks": [
    { "id": "<hook-id>", "command": "<expanded-command>", "exitCode": 0, "success": true },
    {
      "id": "<hook-id>",
      "command": "<expanded-command>",
      "exitCode": 1,
      "success": false,
      "stderr": "<stderr>"
    }
  ],
  "failedHook": { "id": "<hook-id>", "exitCode": 1 }
}
```

`failedHook` is present only for pre-phase failures (fail-fast). For post-phase failures, `failedHook` is omitted and the consumer inspects the `hooks` array.

### Requirement: Works for any step including archiving

The command MUST accept any step name defined in the schema, including `archiving`. While `specd change archive` handles hooks internally during the full archive operation, `specd change run-hooks <name> archiving --phase pre` can be used to run pre-archive checks independently — for example, to verify hooks pass before committing to the archive.

## Constraints

- `--phase` is required — the command does not execute both phases at once
- The command does not perform state transitions — it only executes hooks
- The command does not validate step availability — the agent is responsible for calling it at the appropriate time
- Exit code 2 is used exclusively for hook failures, consistent with the entrypoint spec
- Hook stdout/stderr is forwarded verbatim in text mode; captured in JSON mode

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

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes (0, 1, 2), output conventions, `--format` flag
- [`core:core/run-step-hooks`](../../core/run-step-hooks/spec.md) — `RunStepHooks` use case, result shape
- [`core:core/hook-execution-model`](../../core/hook-execution-model/spec.md) — hook types, failure semantics, agent-driven execution mode
