# Change Spec Preview

## Purpose

Humans reviewing a change need to see how a spec will look after its deltas are applied, without mentally reconstructing the merge or waiting until archive. The `specd change spec-preview` command renders the merged spec content (or a colorized unified diff) by delegating to the `PreviewSpec` use case, keeping the CLI as a thin adapter.

## Requirements

### Requirement: Command signature

```
specd change spec-preview <name> <specId> [--diff] [--format text|json|toon]
```

- `<name>` — required positional; the change name
- `<specId>` — required positional; the fully-qualified spec ID to preview (e.g. `core:core/compile-context`); MUST be one of the change's `specIds`
- `--diff` — optional flag; when present, outputs a unified diff instead of the full merged content
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Text output — merged mode (no --diff)

When `--diff` is not present, the command MUST output the merged spec content. Artifact files MUST be concatenated in order: `spec.md` first (if present), then remaining files alphabetically. Each file MUST be preceded by a `--- <filename> ---` separator line, matching the format used by `specd spec show`.

### Requirement: Text output — diff mode (--diff)

When `--diff` is present, the command MUST generate a unified diff locally from the `base` and `merged` fields returned by `PreviewSpec`, using the `diff` npm package's `createTwoFilesPatch` function with 3 lines of context. The diff MUST be colorized using `chalk`:

- Lines starting with `+` (additions) — green
- Lines starting with `-` (removals) — red
- Lines starting with `@@` (hunk headers) — cyan
- All other lines (context) — dim

Each file's diff MUST be preceded by a `--- <filename> ---` separator line. Files with no changes (no-op deltas) MUST be omitted from the diff output entirely.

### Requirement: JSON/TOON output

JSON and TOON output MUST return the `PreviewSpecResult` object from the use case. When `--diff` is present, the CLI MUST generate non-colorized unified diff strings and include them as a `diff` field on each file entry. When `--diff` is absent, file entries include `base` and `merged` fields as returned by the use case.

### Requirement: Error handling

If the change does not exist, the command MUST print an error message and exit with code 1. If the spec ID is not in the change's `specIds`, the command MUST print an error message and exit with code 1. Parser or delta application warnings from the use case MUST be printed to stderr.

## Constraints

- The CLI command delegates merge logic to `PreviewSpec` but owns diff generation via the `diff` npm package
- Colorization applies only to text format output; JSON/TOON output is never colorized
- The `chalk` library (already a dependency of `@specd/cli`) is used for colorization
- The `diff` npm package is a dependency of `@specd/cli`, not `@specd/core`

## Spec Dependencies

- `core:core/preview-spec` — the use case this command delegates to
