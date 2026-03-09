# Spec Write-Metadata

## Overview

The `specd spec write-metadata` command writes a `.specd-metadata.yaml` file for a given spec. It accepts YAML content from stdin or a file and persists it through the `SaveSpecMetadata` use case, which delegates to `SpecRepository.save()` for conflict detection and atomic writes.

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

On success, text format outputs: `wrote .specd-metadata.yaml for <workspace:path>`

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

## Constraints

- The command contains no business logic — all writing is delegated to the `SaveSpecMetadata` use case
- YAML validation happens at the CLI boundary before the use case is invoked
- The command never reads or writes the filesystem directly for spec content — it uses the kernel

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — adapter packages contain no business logic
- [`specs/_global/conventions/spec.md`](../../_global/conventions/spec.md) — error types, named exports

## ADRs

_none_
