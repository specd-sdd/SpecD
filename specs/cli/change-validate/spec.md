# Change Validate

## Purpose

Before a change can advance, its artifacts must be verified against the schema to catch structural errors and missing content early. `specd change validate <name> <workspace:capability-path>` validates a change's artifact files against the active schema for a specific spec and marks passing artifacts as complete.

## Requirements

### Requirement: Command signature

```
specd change validate <name> [workspace:capability-path] [--all] [--artifact <artifactId>] [--format text|json|toon]
```

- `<name>` — required positional; the name of the change to validate
- `[workspace:capability-path]` — optional positional; the spec ID to validate against (e.g. `default:auth/oauth`). Must be one of the change's declared `specIds`. Required unless `--all` is used OR `--artifact` targets a `scope: change` artifact.
- `--all` — validate all `specIds` declared in the change. Mutually exclusive with `<workspace:capability-path>`.
- `--artifact <artifactId>` — optional; when provided, only the specified artifact is validated instead of all artifacts for the spec. Works with both single-spec and `--all` modes. When the artifact is `scope: change`, `specPath` is not required.
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command invokes the `ValidateArtifacts` use case, passing the change name, spec ID, and optionally the artifact ID from `--artifact`.

The command MUST render file path details from the use case's structured file result metadata instead of recomputing expected paths in the CLI layer.

### Requirement: Output on success

In `text` mode (default), when all artifacts pass, the command prints the validated artifact paths:

```text
validated <name>/<workspace:capability-path>: all artifacts pass
  file: <path>
  file: <path>
note: inspect merged spec output with `specd change spec-preview <name> <workspace:capability-path>`
```

In `text` mode, when there are notes but no failures:

```text
validated <name>/<workspace:capability-path>: pass (N note(s))
  file: <path>
note: <artifactId> — <description>
...
note: inspect merged spec output with `specd change spec-preview <name> <workspace:capability-path>`
```

The listed file paths MUST come from `ValidateArtifacts` result metadata and MUST be the exact paths validated for the requested spec/artifact. Any non-blocking suggestion MUST be labeled as a `note`.

In `json` or `toon` mode, the output includes a `notes` array:

```json
{
  "passed": true,
  "failures": [],
  "notes": [{ "artifactId": "...", "description": "..." }],
  "files": [{ "artifactId": "...", "key": "...", "filename": "...", "status": "validated" }]
}
```

The process exits with code 0 when `passed` is `true`.

### Requirement: Output on failure

In `text` mode, the command prints each failure to stdout, exits with code 1, and includes any expected file paths that could not be validated:

```text
validation failed <name>/<workspace:capability-path>:
  missing: <path>
    error: <artifactId> — <description>
    ...
    note: <artifactId> — <description>
    ...
  note: inspect merged spec output with `specd change spec-preview <name> <workspace:capability-path>`
```

Missing path lines MUST be derived from `ValidateArtifacts` result metadata. For an existing spec with a delta-capable artifact, this path is the expected `deltas/.../*.delta.yaml` file, even if a direct `specs/...` file exists.

In `json` or `toon` mode:

```json
{
  "passed": false,
  "failures": [{ "artifactId": "...", "description": "...", "filename": "..." }],
  "notes": [],
  "files": [{ "artifactId": "...", "key": "...", "filename": "...", "status": "missing" }]
}
```

The process exits with code 1 when `passed` is `false`, regardless of format.

### Requirement: Spec ID not in change

If the given `<workspace:capability-path>` is not declared in the change's `specIds`, the command exits with code 1 and prints an `error:` message to stderr.

### Requirement: Error cases

- If the change does not exist, exits with code 1.
- If the schema cannot be resolved, exits with code 3.

### Requirement: Unknown artifact ID

If `--artifact` is provided with an artifact ID that does not exist in the active schema, the command exits with code 1 and prints the validation failure from the use case to stdout (not stderr — it is a validation result, not a CLI error).

### Requirement: Batch mode (--all)

With `--all`, the command loads the change's `specIds` and validates each one in order. `--all` is mutually exclusive with the `<workspace:capability-path>` positional — providing both exits with `error: --all and <specPath> are mutually exclusive`. Omitting both exits with `error: either <specPath> or --all is required`.

`--artifact` works with `--all` — it validates only that artifact type for every spec in the change.

For each spec, the command invokes `ValidateArtifacts` and collects results. Individual spec failures do not abort the batch — all specs are validated.

**Text output:** each spec's result is printed as in single-spec mode (success or failure block), followed by a summary line: `validated N/M specs`.

**JSON output:** `{ passed: <bool>, total: M, results: [{ spec: "<id>", passed: <bool>, failures: [...], warnings: [...] }] }`

The process exits with code 1 if any spec has failures, 0 if all pass.

## Constraints

- Validation output (failures and warnings) goes to stdout; only CLI/system errors go to stderr
- The command marks artifacts as complete in the manifest when they pass
- Batch mode uses the change's `specIds` list — no custom spec resolution in the CLI layer

## Examples

```
specd change validate add-oauth-login default:auth/oauth
specd change validate update-billing default:billing/invoices
specd change validate add-oauth-login default:auth/oauth --artifact proposal
specd change validate update-billing default:billing/invoices --artifact specs
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — artifact status, validation, approval invalidation
- [`core:core/validate-artifacts`](../../core/validate-artifacts/spec.md) — validation result shape and expected artifact file paths
- [`core:core/spec-id-format`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format
