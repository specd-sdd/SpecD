# Spec Generate-Metadata

## Overview

The `specd spec generate-metadata` command generates `.specd-metadata.yaml` content deterministically from schema extraction rules. It delegates to `GenerateSpecMetadata` for generation and optionally to `SaveSpecMetadata` for persistence.

## Requirements

### Requirement: Command signature

The command is registered as `generate-metadata <specPath>` on the `spec` parent command. It accepts:

- `--write` — persist the generated metadata to the spec directory
- `--force` — skip conflict detection when writing (requires `--write`)
- `--format <fmt>` — output format: `text|json|toon` (default `text`)
- `--config <path>` — path to `specd.yaml`

The `<specPath>` argument uses the same `workspace:capability-path` syntax as other `spec` subcommands.

### Requirement: Default output (no --write)

Without `--write`, the command generates metadata and outputs it to stdout without persisting:

- **Text format:** outputs the generated YAML content, trimmed of trailing whitespace
- **JSON/toon format:** outputs `{ spec: "<workspace:path>", metadata: <object> }`

### Requirement: Write mode

With `--write`, the command generates metadata, persists it via `SaveSpecMetadata`, and outputs a confirmation:

- **Text format:** `wrote .specd-metadata.yaml for <workspace:path>`
- **JSON/toon format:** `{ result: "ok", spec: "<workspace:path>", written: true }`

### Requirement: Force flag

`--force` requires `--write`. Without `--write`, the command writes `error: --force requires --write` to stderr and exits with code 1. With `--write`, the command passes `force: true` to `SaveSpecMetadata` to skip conflict detection.

### Requirement: Error — no metadataExtraction

If the core use case returns `hasExtraction: false` (schema has no `metadataExtraction` declarations), the command writes `error: schema has no metadataExtraction declarations` to stderr and exits with code 1.

### Requirement: Error — dependsOn overwrite (write mode)

When `--write` is used and `--force` is not set, if the generated metadata would change existing `dependsOn` entries, `SaveSpecMetadata` throws a `DependsOnOverwriteError`. The error propagates through `handleError` which writes `error: dependsOn would change (...)` to stderr and exits with code 1. Stdout remains empty on error.

When `--write --force` is used, the overwrite check is skipped entirely.

## Constraints

- The command contains no business logic — all generation is delegated to `GenerateSpecMetadata` and all writing to `SaveSpecMetadata`
- YAML serialization uses `lineWidth: 0` for literal scalars
- The command never reads or writes the filesystem directly for spec content — it uses the kernel

## Spec Dependencies

- [`specs/core/generate-metadata/spec.md`](../../core/generate-metadata/spec.md) — the core use case
- [`specs/core/spec-metadata/spec.md`](../../core/spec-metadata/spec.md) — metadata format and validation
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — adapter packages contain no business logic
