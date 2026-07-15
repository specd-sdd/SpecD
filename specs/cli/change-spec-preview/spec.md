# Change Spec Preview

## Purpose

Humans reviewing a change need to see how a spec will look after its deltas are applied, without mentally reconstructing the merge or waiting until archive. The `specd change spec-preview` command renders the merged spec content (or a colorized unified diff) by delegating to the `PreviewSpec` use case, keeping the CLI as a thin adapter.

## Requirements

### Requirement: Command signature

```
specd changes spec-preview <name> <specId> [--artifact <name>] [--diff] [--format text|json|toon]
```

- `<name>` — required positional; the change name
- `<specId>` — required positional; the fully-qualified spec ID to preview (e.g. `core:compile-context`); MUST be one of the change's `specIds`
- `--artifact <name>` — optional; filters the output to only include the artifact with the given ID (e.g. `specs`, `verify`)
- `--diff` — optional flag; when present, outputs a unified diff instead of the full merged content
- `--format text|json|toon` — optional; output format, defaults to `text`

Canonical agent-facing guidance MUST use plural command groups (for example `changes`). Singular groups remain alias-compatible.

### Requirement: Text output — merged mode (no --diff)

When `--diff` is not present, the command MUST output the merged spec content. Artifact files MUST be concatenated in order: `spec.md` first (if present), then remaining files alphabetically. Each file MUST be preceded by a separator line formatted as `--- <filename> --- <label>`, where `<label>` depends on the file's status:

- status `merged`: No label (empty)
- status `no-op`: `(no-op delta, showing original)`
- status `missing`:
  - If base is not `null` (delta): `(missing artifact, showing original)`
  - If base is `null` (new spec): `(missing artifact)`

If `--artifact <name>` is provided, the command MUST resolve `<name>` to a filename using the active schema. Only the content of the matching artifact SHALL be printed, still preceded by its `--- <filename> --- <label>` header line.

### Requirement: Text output — diff mode (--diff)

When `--diff` is present, the command MUST request diff-enabled preview output from `PreviewSpec` and consume the `diff` field returned on preview file entries. The CLI SHALL NOT generate unified diffs locally from `base` and `merged`.

The diff MUST be colorized using `chalk`:

- Lines starting with `+` (additions) — green
- Lines starting with `-` (removals) — red
- Lines starting with `@@` (hunk headers) — cyan
- All other lines (context) — dim

Each file's diff MUST be preceded by a `--- <filename> ---` separator line. Files without returned diff output MUST be omitted from diff mode output entirely; this includes `no-op` and `missing` entries.

If `--artifact <name>` is provided, the command MUST only output the diff for the requested artifact. If the requested artifact has no diff output, the command SHALL exit with code 0 and output nothing (or a message indicating no changes if applicable to text format), matching the default diff behavior for individual files.

### Requirement: JSON/TOON output

JSON and TOON output MUST return the `PreviewSpecResult` object from the use case. When `--diff` is present, the CLI MUST request diff-enabled preview output and forward the returned `diff` fields unchanged. The CLI SHALL NOT synthesize diff strings for structured output.

When `--diff` is absent, file entries include `base` and `merged` fields as returned by the use case.

If `--artifact <name>` is provided, the `files` array in the result object SHALL contain exactly one entry for the requested artifact.

### Requirement: Error handling

If the change does not exist, the command MUST print an error message and exit with code 1. If the spec ID is not in the change's `specIds`, the command MUST print an error message and exit with code 1; the error message SHALL explicitly suggest using `specd specs show <specId>` to view the canonical spec. Parser or delta application warnings from the use case MUST be printed to stderr.

### Requirement: Drift and overlap review support

The command SHALL be suitable as the authoritative merged-content checkpoint when artifact drift or overlap risk exists.

Workflow guidance that detects overlap/drift risk MUST use this command to review merged output before accepting delta results.

Reading raw delta files alone MUST NOT be treated as equivalent to merged preview review, because deltas can be stale relative to the current base spec.

When only one spec-scoped artifact is required for that review, guidance SHOULD pass `--artifact <name>` to limit output to the relevant merged artifact.

### Requirement: Artifact filtering errors

- If `--artifact <name>` is provided and `<name>` does not exist in the active schema, the command SHALL exit with code 1 and print an `error:` message to stderr.
- If the artifact exists in the schema but its scope is not `spec`, the command SHALL exit with code 1 and print an `error:` message to stderr.
- If the artifact is valid in the schema but is not present in the change's artifacts for the given `specId`, the command SHALL exit with code 1 and print an `error:` message to stderr.

## Constraints

- The CLI command delegates merge logic and diff generation to `PreviewSpec`; CLI-specific responsibilities are artifact filtering, text rendering, warning presentation, and ANSI colorization
- Colorization applies only to text format output; JSON/TOON output is never colorized
- The `chalk` library (already a dependency of `@specd/cli`) is used for colorization
- The concrete diff-generation library is not a responsibility of `@specd/cli`; it belongs to core's default `DiffGenerator` implementation
- Artifact filtering resolve IDs to filenames using the same logic as `specd spec show`

## Spec Dependencies

- `core:preview-spec` — the use case this command delegates to
