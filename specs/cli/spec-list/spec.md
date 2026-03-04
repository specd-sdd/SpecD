# Spec List

## Overview

Defines the `specd spec list` command, which lists all specs in all configured workspaces, always including a title per spec and optionally a short summary.

## Requirements

### Requirement: Command signature

```
specd spec list [--summary] [--format text|json|toon]
```

- `--summary` — optional flag; when present, a short summary is included for each spec alongside the title
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Title resolution

Every spec row always includes a title, resolved in this order:

1. `title` field from the spec's `.specd-metadata.yaml`, if present and non-empty
2. Fallback: the last segment of the capability-path (e.g. `auth/login` → `login`)

Title resolution is performed by `@specd/core` — the CLI receives the resolved value.

### Requirement: Summary resolution

When `--summary` is passed, a short summary is included for each spec, resolved in this order:

1. `description` field from the spec's `.specd-metadata.yaml`, if present and non-empty
2. Fallback: extracted from `spec.md` using this priority order (first match wins):
   a. First non-empty paragraph immediately after the `# H1` heading
   b. Body of the first section matching `## Overview`, `## Summary`, or `## Purpose` (first paragraph only)
3. If no summary can be extracted, the field is omitted in `text` mode and `null` in `json`/`toon` mode

Summary extraction from `spec.md` is performed by `@specd/core` as a pure function — the CLI does not contain Markdown parsing logic.

### Requirement: Output format

In `text` mode (default), specs are grouped by workspace. Each group is rendered as a table:

- The workspace name is printed as a bold title line above the table.
- Each workspace group begins with an inverse-video workspace header row: `  workspace: <name>  `, padded to the same inner width as the column header row below it.
- Immediately below the workspace header is an inverse-video column header row. The header includes `PATH  TITLE` when `--summary` is not passed, and `PATH  TITLE  SUMMARY` when `--summary` is passed.
- Data rows list one spec per line. The PATH column displays the fully-qualified spec identifier `workspace:capability-path` (e.g. `default:auth/login`). All columns are aligned to globally fixed widths (computed across all entries in all workspaces).
- When `--summary` is passed, `TITLE` is padded to column width and `SUMMARY` follows as an additional aligned column using wrap overflow (capped at 60 characters).
- Workspace groups are separated by a blank line.

```
  workspace: default
  PATH                      TITLE
  default:<capability-path>  <title>
  default:<capability-path>  <title>

  workspace: billing
  PATH                       TITLE
  billing:<capability-path>  <title>

  workspace: default  (with --summary, extended width)
  PATH                      TITLE    SUMMARY
  default:<capability-path>  <title>  <summary>
  default:<capability-path>  <title>
```

In `json` or `toon` mode, each spec entry is an object. The `path` field uses the fully-qualified `workspace:capability-path` format:

```json
{
  "workspaces": [
    {
      "name": "...",
      "specs": [{ "path": "workspace:cap/path", "title": "...", "summary": "..." }]
    }
  ]
}
```

When `--summary` is not passed, `summary` is omitted from text rows and from JSON/toon objects. When `--summary` is passed but no summary is available for a spec, the text row shows the title only and the JSON/toon object omits `summary` (does not include `null`).

### Requirement: Empty output

If a workspace has no specs, its heading is still printed in text mode followed by `  (none)`. In JSON/toon mode it appears as `{"name": "...", "specs": []}`.

If there are no workspaces configured, the command prints `no workspaces configured` and exits with code 0.

### Requirement: Error cases

If the spec filesystem cannot be read (I/O error), exits with code 3.

## Constraints

- No filtering by workspace or prefix in v1
- All configured workspaces are listed, even empty ones
- Title resolution and summary extraction are both implemented in `@specd/core`, not in the CLI
- Summary is never a hard error — if extraction fails for any reason, the spec is still listed without it

## Examples

```
$ specd spec list
  workspace: default
  PATH                      TITLE
  default:auth/login        Login
  default:auth/register     Register
  default:billing/invoices  Invoices

  workspace: billing
  PATH                      TITLE
  billing:payments/create   Create Payment

$ specd spec list --summary
  workspace: default
  PATH                    TITLE     SUMMARY
  default:auth/login      Login     Handles user authentication via login form
  default:auth/register   Register

$ specd spec list --format json
{"workspaces":[{"name":"default","specs":[{"path":"default:auth/login","title":"Login"},{"path":"default:auth/register","title":"Register"}]}]}

$ specd spec list --summary --format json
{"workspaces":[{"name":"default","specs":[{"path":"default:auth/login","title":"Login","summary":"Handles user authentication via login form"}]}]}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
