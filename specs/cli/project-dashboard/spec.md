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
3. **Outer container** — a rounded `boxen` box with the title `SpecD project dashboard` centred at the top and a cyan border. The minimum inner width of this box MUST be at least the default `boxen` width plus 10 characters to accommodate typical project root paths.
4. **Project box** — an inner box labelled `Project` showing:
   - `root:` — absolute path to the project root. If the value would cause the row to overflow the outer box width, the value wraps to a new line indented to align with the start of the value column (i.e. the column position where values begin).
   - `schema:` — the schema reference from `specd.yaml`.
   - `workspaces:` — comma-separated list of workspace names.
5. **Specs box** — an inner box labelled `Specs` showing total spec count and a per-workspace breakdown.
6. **Changes box** — an inner box labelled `Changes` showing active count, draft count, discarded count, and a per-state breakdown of active changes.
7. **Layout** — the Project box occupies the full width on its own row; the Specs and Changes boxes are rendered side by side on the row below.

### Requirement: JSON and toon output

In `json` or `toon` mode the command outputs a single object:

```json
{
  "projectRoot": "<absolute-path>",
  "schemaRef": "<schema-ref>",
  "workspaces": ["<id>", ...],
  "specs": {
    "total": <number>,
    "byWorkspace": { "<workspace-id>": <number>, ... }
  },
  "changes": {
    "active": <number>,
    "drafts": <number>,
    "discarded": <number>
  }
}
```

No config line, banner, or box decoration is included in non-text output.

### Requirement: Data sources

All data is fetched via the kernel:

- `kernel.specs.list` — list all specs across all workspaces.
- `kernel.changes.list` — list active changes.
- `kernel.changes.listDrafts` — list draft changes.
- `kernel.changes.listDiscarded` — list discarded changes.

All four queries run in parallel.

### Requirement: Config dependency

The command requires a valid `specd.yaml`. If config discovery fails the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The outer dashboard box MUST have a minimum inner width of at least the default `boxen` width plus 10 characters.
- When the `root:` value would overflow the outer box width, it MUST wrap to the next line, indented to align with the value column start position.
- ANSI escape codes must be stripped before measuring string lengths for column alignment and overflow detection.
- The command is read-only; it never modifies any files.
- The `Using config:` line is always printed to stdout in text mode, even when the banner is suppressed (no suppression flag exists; this note is for future-proofing).

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

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — exit codes, output conventions
- [`specs/core/config/spec.md`](../../core/config/spec.md) — config loading
