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

Without `--input`, the command reads all of stdin until EOF. With `--input <file>`, it reads the file at the given path. In both cases the result is a raw YAML string passed to the use case.

### Requirement: YAML validation

Before calling the use case, the command parses the content with `yaml.parse()` to verify it is valid YAML. If parsing fails, the command writes an error to stderr and exits with code 1.

### Requirement: Text output

On success, text format outputs: `wrote metadata for <workspace:path>`

### Requirement: JSON output

On success, JSON format outputs: `{ "result": "ok", "spec": "<workspace:path>" }`

### Requirement: Error — spec not found

If the spec does not exist in the given workspace, the command writes `error: spec '<specPath>' not found` to stderr and exits with code 1.

### Requirement: Error — invalid YAML

If the content is not valid YAML, the command writes `error: invalid YAML: <parse error message>` to stderr and exits with code 1.

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

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — adapter packages contain no business logic
- [`specs/_global/conventions/spec.md`](../../_global/conventions/spec.md) — error types, named exports
- [`specs/core/spec-metadata/spec.md`](../../core/spec-metadata/spec.md) — metadata format, validation, and dependsOn overwrite protection

## ADRs

_none_
