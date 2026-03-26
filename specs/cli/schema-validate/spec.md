# Schema Validate

## Purpose

Schema authors and project maintainers need a way to verify that their schema configuration is correct before other commands consume it. Errors in schema YAML — malformed structure, invalid artifact IDs, dependency cycles, missing templates — currently surface only as side effects of unrelated commands. The `specd schema validate` command provides a dedicated validation entry point that delegates to the `ValidateSchema` use case in core, keeping the CLI as a thin adapter.

## Requirements

### Requirement: Command signature

`specd schema validate [--file <path>] [--raw] [--format text|json|toon] [--config <path>]`

- When neither `--file` nor `--raw` is provided, the command validates the project's fully-resolved schema (merged).
- When `--raw` is provided (without `--file`), the command validates the project's base schema without plugins or overrides.
- When `--file` is provided, the command validates the specified external file (resolving its extends chain).
- `--file` and `--raw` are mutually exclusive. If both are provided, the command SHALL fail with an error.

### Requirement: Project mode — resolved

When invoked without `--file` or `--raw`, the command SHALL call `ValidateSchema.execute` with `mode: 'project'`, passing `schemaRef`, `schemaPlugins`, and `schemaOverrides` from the project config. This runs the full resolution pipeline.

### Requirement: Project mode — raw

When invoked with `--raw` (without `--file`), the command SHALL call `ValidateSchema.execute` with `mode: 'project-raw'`, passing only `schemaRef`. This validates the base schema with its extends chain but without plugins or overrides.

### Requirement: File mode

When invoked with `--file <path>`, the command SHALL call `ValidateSchema.execute` with `mode: 'file'` and the resolved absolute path. The use case handles extends resolution, file reading, and validation.

### Requirement: Text output — success

When validation succeeds and `--format` is `text`, the command SHALL write:

- Project resolved mode: `schema valid: <name> v<version> (<N> artifacts, <M> workflow steps)`
- Project raw mode: `schema valid: <name> v<version> (<N> artifacts, <M> workflow steps) [raw]`
- File mode: `schema valid: <name> v<version> (<N> artifacts, <M> workflow steps) [file]`

Warning lines, if any, are appended as `  warning: <text>`.

### Requirement: Text output — failure

When validation fails and `--format` is `text`, the command SHALL write `schema validation failed:` followed by indented error lines, one per validation error.

### Requirement: JSON output

When `--format` is `json` or `toon`, the command SHALL write a structured result object:

Success:

```json
{
  "result": "ok",
  "schema": { "name": "...", "version": 1 },
  "artifacts": 5,
  "workflowSteps": 4,
  "mode": "project" | "project-raw" | "file",
  "warnings": []
}
```

Failure:

```json
{
  "result": "error",
  "errors": [{ "message": "..." }],
  "warnings": [],
  "mode": "project" | "project-raw" | "file"
}
```

### Requirement: Exit code

The command SHALL exit with code 0 when the schema is valid and code 1 when validation fails.

### Requirement: Error — file not found

When `--file <path>` references a file that does not exist, the validation result SHALL contain the error and exit with code 1.

### Requirement: Error — config required in project modes

When invoked without `--file` and no `specd.yaml` can be discovered, the command SHALL fail with the standard config-not-found error (as defined by the entrypoint spec).

### Requirement: Mutually exclusive flags

When both `--file` and `--raw` are provided, the command SHALL write an error: `--file and --raw are mutually exclusive` and exit with code 1.

## Constraints

- The command contains no validation logic — all validation is performed by the `ValidateSchema` use case in core
- The command follows all global CLI conventions (exit codes, `--format`, `--config`, excess argument rejection)
- The CLI imports only use-case factories or the kernel — never domain services or infrastructure functions directly

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — global CLI conventions (exit codes, `--format`, `--config`, error output)
- [`core:core/validate-schema`](../../core/validate-schema/spec.md) — the use case that performs validation
