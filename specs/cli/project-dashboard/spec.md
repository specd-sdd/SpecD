# Project Dashboard

## Purpose

Users joining a project or returning after time away need a quick snapshot of what exists and what is in flight. The `specd project dashboard` command displays a visual dashboard summarising the current state of a SpecD project — project metadata, spec counts per workspace, and change counts by state — as an ASCII box layout in text mode or a structured data object in `json`/`toon` mode. It is also the default output when `specd` is invoked with no subcommand and a valid config is present.

## Requirements

### Requirement: Command signature

```text
specd project dashboard [--format text|json|toon] [--config <path>]
```

- `--format text|json|toon` — optional; output format. Defaults to `text`.
- `--config <path>` — optional; path to `specd.yaml`. Uses standard config discovery when omitted.

### Requirement: Text dashboard

In `text` mode the command outputs:

1. **Banner** — the SpecD ASCII logo rendered above the dashboard box.
2. **Config line** — a plain text line `Using config: <relative-path>` printed to stdout before any box decoration. `<relative-path>` is the path to the loaded `specd.yaml` relative to `process.cwd()`.
3. **Outer container** — a rounded `boxen` box with the title `SpecD project dashboard` centred at the top and a cyan border.
4. **Project box** — a full-width inner box labelled `Project` showing:
   - `root:` — absolute path to the project root. If the value would cause the row to overflow the inner box width, the value wraps to continuation lines indented to align with the start of the value column.
   - `schema:` — the schema reference from `specd.yaml`.
   - `workspaces:` — comma-separated list of workspace names. If the value exceeds available inner width, it wraps to continuation lines indented to align with the start of the value column, wrapping on word/comma boundaries without splitting workspace names mid-word.
5. **Specs box** — an inner box labelled `Specs` rendering a 2-column aligned table of total spec count and per-workspace breakdown (including empty workspaces with 0 count), dynamically padded to the longest workspace name.
6. **Changes box** — an inner box labelled `Changes` rendering a 2-column aligned table with each change state on its own line (`active`, `drafts`, `discarded`, `archived`).
7. **Graph box** — an inner box labelled `Graph` showing graph freshness timestamp, staleness indicator, document count (`docs:`), file count (`files:`), symbol count (`symbols:`), relation count (`relations:`), and indexed languages (`languages:`) when graph diagnostics are available.
8. **Layout** — the Project and Graph boxes span the full inner width of the dashboard; Specs and Changes sub-boxes are rendered side by side, matching the full container width.

### Requirement: JSON and toon output

In `json` or `toon` mode, `specd project dashboard` delegates execution directly to `specd project status`, producing the canonical project status JSON/TOON output schema without executing separate dashboard formatting.

### Requirement: Data sources

All metrics and diagnostics are fetched via `buildProjectStatusSnapshot(host, { includeGraph: true })` from `@specd/sdk` (or host composition), ensuring complete parity with `specd project status`.

### Requirement: Config dependency

The command requires a valid `specd.yaml`. If config discovery fails the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The outer dashboard box MUST have a minimum inner width of at least the default `boxen` width plus 10 characters.
- When `root:` or `workspaces:` values would overflow the inner box width, they MUST wrap to continuation lines, indented to align with the value column start position.
- ANSI escape codes must be stripped before measuring string lengths for column alignment and overflow detection.
- The command is read-only; it never modifies any files.
- The `Using config:` line is always printed to stdout in text mode, even when the banner is suppressed.

## Examples

```bash
# Text dashboard (default) — also triggered automatically by bare 'specd' invocation
specd project dashboard

# JSON output for scripting
specd project dashboard --format json

# Use a non-default config
specd project dashboard --config /path/to/specd.yaml
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — exit codes, output conventions
- [`core:config`](../../core/config/spec.md) — config loading
