# Spec Invalidate-Metadata

## Overview

The `specd spec invalidate-metadata` command marks a spec's `.specd-metadata.yaml` as stale by removing its `contentHashes` field. This forces metadata regeneration on the next pass without deleting the file or losing other metadata fields.

## Requirements

### Requirement: Command signature

The command is registered as `invalidate-metadata <specPath>` on the `spec` parent command. It accepts:

- `--format <fmt>` — output format: `text|json|toon` (default `text`)
- `--config <path>` — path to `specd.yaml`

The `<specPath>` argument uses the same `workspace:capability-path` syntax as other `spec` subcommands.

### Requirement: Text output

On success, text format outputs: `invalidated .specd-metadata.yaml for <workspace:path>`

### Requirement: JSON output

On success, JSON format outputs: `{ "result": "ok", "spec": "<workspace:path>" }`

### Requirement: Error — spec not found or no metadata

If the spec does not exist, or has no `.specd-metadata.yaml`, the command writes `error: spec '<specPath>' not found or has no metadata` to stderr and exits with code 1.

## Constraints

- The command contains no business logic — all work is delegated to the `InvalidateSpecMetadata` use case
- The command never reads or writes the filesystem directly for spec content — it uses the kernel

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — adapter packages contain no business logic
- [`specs/_global/conventions/spec.md`](../../_global/conventions/spec.md) — error types, named exports
- [`specs/core/invalidate-spec-metadata/spec.md`](../../core/invalidate-spec-metadata/spec.md) — the use case this command delegates to
