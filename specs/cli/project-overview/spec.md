# Project Overview

## Purpose

Users joining a project or returning after time away need a quick snapshot of what exists and what is in flight. The `specd project overview` command displays a visual dashboard summarising the current state of a SpecD project -- project metadata, spec counts per workspace, and change counts by state -- as an ASCII box layout in text mode or a structured data object in `json`/`toon` mode.

## Requirements

### Requirement: Command signature

```
specd project overview [--format text|json|toon] [--config <path>]
```

- `--format text|json|toon` — optional; output format. Defaults to `text`.
- `--config <path>` — optional; path to `specd.yaml`. Uses standard config discovery when omitted.

### Requirement: Text dashboard

In `text` mode the command outputs:

1. **Banner** — the SpecD ASCII logo rendered above the dashboard.
2. **Outer container** — a rounded `boxen` box with the title `SpecD project overview` centred at the top and a cyan border.
3. **Project box** — an inner box labelled `Project` showing:
   - `root:` — absolute path to the project root.
   - `schema:` — the schema reference from `specd.yaml`.
   - `workspaces:` — comma-separated list of workspace names.
4. **Specs box** — an inner box labelled `Specs` showing total spec count and a per-workspace breakdown.
5. **Changes box** — an inner box labelled `Changes` showing active count, draft count, discarded count, and a per-state breakdown of active changes.
6. **Layout** — the Project box occupies the full width on its own row; the Specs and Changes boxes are rendered side by side on the row below.

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

No banner or box decoration is included in non-text output.

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

- The text dashboard must not hard-code column widths that assume a fixed terminal width; inner box widths may be fixed constants.
- ANSI escape codes must be stripped before measuring string lengths for column alignment.
- The command is read-only; it never modifies any files.

## Examples

```
# Text dashboard (default)
specd project overview

# JSON output for scripting
specd project overview --format json

# Use a non-default config
specd project overview --config /path/to/specd.yaml
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — exit codes, output conventions
- [`specs/core/config/spec.md`](../../core/config/spec.md) — config loading
