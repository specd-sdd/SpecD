# Spec Write-Metadata

## Purpose

Agents and scripts that produce metadata externally need a safe way to persist it without bypassing validation or conflict detection. The `specd spec write-metadata` command writes metadata for a given spec, accepting YAML content from stdin or a file and persisting it through the `SaveSpecMetadata` use case for conflict detection and atomic writes.

## Requirements

### Requirement: Command signature

The command is registered as `write-metadata <specPath>` on the `spec` parent command. It accepts:

- `--input <file>` — read YAML content from a file path instead of stdin
- `--force` — skip conflict detection and overwrite unconditionally
- `--format <fmt>` — output format: `text|json|toon` (default `text`)
- `--config <path>` — path to `specd.yaml`

The `<specPath>` argument uses the same `workspace:capability-path` syntax as other `spec` subcommands.

### Requirement: Content source

Content is read from `--input <file>` when provided, otherwise from stdin. The content must be a valid JSON string representing a metadata object.

### Requirement: YAML validation

### Requirement: JSON validation

The command reads content from `--input` file or stdin. Before passing to `SaveSpecMetadata`, it validates the content is valid JSON by calling `JSON.parse()`. If parsing fails, the command writes `error: invalid JSON: <message>` to stderr and exits with code 1.

### Requirement: Text output

On success, text format outputs: `wrote metadata for <workspace:path>`

### Requirement: JSON output

On success, JSON format outputs: `{ "result": "ok", "spec": "<workspace:path>" }`

### Requirement: Error — spec not found

If the spec does not exist in the given workspace, the command writes `error: spec '<specPath>' not found` to stderr and exits with code 1.

### Requirement: Error — invalid YAML

### Requirement: Error — invalid JSON

If the input content is not valid JSON (syntax error), the command writes `error: invalid JSON: <parse error message>` to stderr and exits with code 1.

### Requirement: Error — invalid metadata structure

If the use case throws a `MetadataValidationError` (content is valid YAML but fails structural validation), the error propagates through `handleError` which writes `error: <message>` to stderr and exits with code 1.

### Requirement: Error — conflict detected

If `--force` is not set and the repository detects a concurrent modification (hash mismatch), the command writes the conflict error to stderr and exits with code 1.

### Requirement: Error — dependsOn overwrite

If `--force` is not set and the incoming metadata would change existing `dependsOn` entries, `SaveSpecMetadata` throws a `DependsOnOverwriteError`. The error propagates through `handleError` which writes `error: dependsOn would change (...)` to stderr and exits with code 1. Stdout remains empty on error.

When `--force` is set, the overwrite check is skipped entirely.

## Constraints

- The command contains no business logic — all writing is delegated to the `SaveSpecMetadata` use case
- YAML validation happens at the CLI boundary before the use case is invoked
- The command never reads or writes the filesystem directly for spec content — it uses the kernel

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — adapter packages contain no business logic
- [`default:_global/conventions`](../../_global/conventions/spec.md) — error types, named exports
- [`core:core/spec-metadata`](../../core/spec-metadata/spec.md) — metadata format, validation, and dependsOn overwrite protection

## ADRs

_none_
