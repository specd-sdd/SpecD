# Spec Generate-Metadata

## Purpose

Metadata files must be regenerated whenever spec content changes, and doing it manually is error-prone. The `specd spec generate-metadata` command generates metadata content deterministically from schema extraction rules, delegating to `GenerateSpecMetadata` for generation and optionally to `SaveSpecMetadata` for persistence.

## Requirements

### Requirement: Command signature

The command is registered as `generate-metadata [specPath]` on the `spec` parent command. The `specPath` positional argument is optional when `--all` is used. It accepts:

- `--write` — persist the generated metadata
- `--force` — skip conflict detection when writing (requires `--write`)
- `--all` — batch mode: generate metadata for all specs matching `--status` filter. Mutually exclusive with `<specPath>`. Requires `--write`.
- `--status <values>` — comma-separated metadata status filter for `--all`. Accepted values: `stale`, `missing`, `invalid`, `fresh`, or the keyword `all` (every spec regardless of status). Default: `stale,missing`. Requires `--all`.
- `--format <fmt>` — output format: `text|json|toon` (default `text`)
- `--config <path>` — path to `specd.yaml`

The `<specPath>` argument uses the same `workspace:capability-path` syntax as other `spec` subcommands.

### Requirement: Default output (no --write)

Without `--write`, the command generates metadata and outputs it to stdout without persisting:

- **Text format:** outputs the generated YAML content, trimmed of trailing whitespace
- **JSON/toon format:** outputs `{ spec: "<workspace:path>", metadata: <object> }`

### Requirement: Write mode

With `--write`, the command generates metadata, persists it via `SaveSpecMetadata`, and outputs a confirmation:

- **Text format:** `wrote metadata for <workspace:path>`
- **JSON/toon format:** `{ result: "ok", spec: "<workspace:path>", written: true }`

### Requirement: Force flag

`--force` requires `--write`. Without `--write`, the command writes `error: --force requires --write` to stderr and exits with code 1. With `--write`, the command passes `force: true` to `SaveSpecMetadata` to skip conflict detection.

### Requirement: Batch mode (--all)

With `--all`, the command iterates over all specs across all workspaces, filters by metadata status using `--status` (default `stale,missing`), generates metadata for each matching spec, and writes it. `--all` requires `--write` — without it the command exits with `error: --all requires --write`. `--all` is mutually exclusive with a positional `<specPath>` — providing both exits with `error: --all and <specPath> are mutually exclusive`.

The `--status` filter accepts a comma-separated list of: `stale`, `missing`, `invalid`, `fresh`. The keyword `all` is a shorthand for every status (equivalent to regenerating every spec). `--status` without `--all` exits with `error: --status requires --all`.

For each matching spec, the command calls `GenerateSpecMetadata` and then `SaveSpecMetadata`. If `GenerateSpecMetadata` returns `hasExtraction: false`, the entire batch stops with the existing `no metadataExtraction` error (this is a schema-level issue, not per-spec).

Individual spec failures during batch mode (e.g. `DependsOnOverwriteError` when `--force` is not set) are reported as warnings and the batch continues to the next spec. The command exits with code 1 if any spec failed, 0 if all succeeded.

**Text output:** one line per spec processed: `wrote metadata for <specId>` on success, `error: <specId>: <message>` on failure. A summary line at the end: `generated metadata for N/M specs` (where M is total matched, N is successful).

**JSON output:** `{ result: "ok"|"partial"|"error", total: M, succeeded: N, failed: F, specs: [{ spec: "<id>", status: "ok"|"error", error?: "<msg>" }] }`

### Requirement: Error — spec not found

If the spec or workspace does not exist, the core use case throws `SpecNotFoundError` or `WorkspaceNotFoundError`. The error propagates through `handleError` which writes `error: ...` to stderr and exits with code 1.

### Requirement: Error — no metadataExtraction

If the core use case returns `hasExtraction: false` (schema has no `metadataExtraction` declarations), the command writes `error: schema has no metadataExtraction declarations` to stderr and exits with code 1.

### Requirement: Error — dependsOn overwrite (write mode)

When `--write` is used and `--force` is not set, if the generated metadata would change existing `dependsOn` entries, `SaveSpecMetadata` throws a `DependsOnOverwriteError`. The error propagates through `handleError` which writes `error: dependsOn would change (...)` to stderr and exits with code 1. Stdout remains empty on error.

When `--write --force` is used, the overwrite check is skipped entirely.

## Constraints

- The command contains no business logic — all generation is delegated to `GenerateSpecMetadata` and all writing to `SaveSpecMetadata`
- YAML serialization uses `lineWidth: 0` for literal scalars
- The command never reads or writes the filesystem directly for spec content — it uses the kernel
- Batch mode uses `ListSpecs` with `includeMetadataStatus: true` for filtering — no custom metadata resolution in the CLI layer
- `--status` values are validated at the CLI boundary before any spec processing begins

## Spec Dependencies

- [`specs/core/generate-metadata/spec.md`](../../core/generate-metadata/spec.md) — the core use case
- [`specs/core/spec-metadata/spec.md`](../../core/spec-metadata/spec.md) — metadata format and validation
- [`specs/core/list-specs/spec.md`](../../core/list-specs/spec.md) — batch mode uses `ListSpecs` with `includeMetadataStatus` for filtering
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — adapter packages contain no business logic
