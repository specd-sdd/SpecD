# Change Hook Instruction

## Purpose

External agent tools like Claude Code have their own hook systems that can inject instructions at specific points. These tools need a way to retrieve `instruction:` hook text from specd without compiling the full context block. `specd change hook-instruction` provides this: it returns instruction text for a given step and phase, either all instructions or a specific one by ID.

## Requirements

### Requirement: Command signature

```
specd change hook-instruction <name> <step> --phase pre|post [--only <hook-id>] [--format text|json|toon]
```

- `<name>` — required positional; the change name
- `<step>` — required positional; the workflow step name (e.g. `implementing`, `verifying`)
- `--phase pre|post` — required flag; which hook phase to query
- `--only <hook-id>` — optional flag; return only the instruction with this ID
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Delegates to GetHookInstructions

The command MUST delegate to the `GetHookInstructions` use case. It MUST NOT resolve schemas or collect hooks directly.

### Requirement: Exit code 0 on success

When instructions are found (or none exist), the command exits with code 0.

When no `instruction:` hooks exist for the given step+phase, the command prints `no instructions` to stdout (text format) or `{ "result": "ok", "instructions": [] }` (json/toon format) and exits with code 0.

### Requirement: Exit code 1 on domain errors

The command exits with code 1 for:

- Change not found (`ChangeNotFoundError`)
- Step is not a valid lifecycle state (`StepNotValidError`)
- Unknown hook ID when `--only` is specified (`HookNotFoundError` with reason `'not-found'`)
- Hook ID refers to a `run:` hook instead of an `instruction:` hook (`HookNotFoundError` with reason `'wrong-type'`)
- Schema mismatch (`SchemaMismatchError`)

### Requirement: Text output format

When `--format` is `text` (default):

- When returning all instructions: each instruction is printed with a header line `[<phase>] <hook-id>:` followed by the instruction text, separated by a blank line between entries
- When returning a single instruction (`--only`): the instruction text is printed directly without any header — raw text suitable for piping into an external hook system

### Requirement: JSON output format

When `--format` is `json` or `toon`, output to stdout:

```json
{
  "result": "ok",
  "phase": "pre|post",
  "instructions": [{ "id": "<hook-id>", "text": "<instruction text>" }]
}
```

### Requirement: Works for any step

The command MUST accept any step name defined in the schema. It does not validate whether the step is currently available — instruction text is returned regardless of change state.

## Constraints

- `--phase` is required — the command does not query both phases at once
- The command is read-only — it never executes hooks or modifies state
- When `--only` is used with text format, the output is raw instruction text with no framing — this allows direct use in external hook systems via command substitution

## Examples

```bash
# Get all pre-instructions for implementing
specd change hook-instruction add-auth implementing --phase pre

# Get a specific instruction by ID (raw text, no header)
specd change hook-instruction add-auth implementing --phase pre --only read-tasks

# JSON format for programmatic consumption
specd change hook-instruction add-auth verifying --phase pre --format json
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions, `--format` flag
- [`specs/core/get-hook-instructions/spec.md`](../../core/get-hook-instructions/spec.md) — `GetHookInstructions` use case, result shape
- [`specs/core/hook-execution-model/spec.md`](../../core/hook-execution-model/spec.md) — instruction hooks as passive text, individual query mode
