# Spec List

## Purpose

Without a quick inventory of all specs, users and agents cannot orient themselves in a project or spot stale metadata. `specd specs list` is the canonical command and lists all specs across all configured workspaces, always including a title per spec and optionally a short summary and metadata freshness status.

`specd spec list` remains supported as an alias.

## Requirements

### Requirement: Command signature

```
specd specs list [--summary] [--metadata-status [filter]] [--format text|json|toon]
```

Alias:

```
specd spec list [--summary] [--metadata-status [filter]] [--format text|json|toon]
```

- `--summary` — optional flag; when present, a short summary is included for each spec alongside the title
- `--metadata-status` — optional flag with optional filter value; when present, a metadata-freshness METADATA STATUS column is included for each spec
  - Without a filter value (`--metadata-status`), all specs are shown with their status
  - With a comma-separated filter value (`--metadata-status stale`, `--metadata-status stale,missing`), only specs matching at least one of the listed statuses are shown
  - Valid filter tokens: `fresh`, `stale`, `missing`, `invalid`
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

### Requirement: Status resolution

When `--metadata-status` is passed, each spec receives a metadata-freshness status, determined as follows:

1. If the spec has no `.specd-metadata.yaml` file → `missing`
2. If the metadata file exists but fails structural validation against `specMetadataSchema` → `invalid`
3. If the metadata exists but has no `contentHashes` field (or it is empty) → `stale`
4. If any recorded hash in `contentHashes` does not match the SHA-256 hash of the current artifact file → `stale`
5. If a file listed in `contentHashes` no longer exists → `stale`
6. Otherwise → `fresh`

When a filter value is provided (e.g. `--metadata-status stale,missing`), only specs whose status matches at least one of the filter tokens are included in the output. Tokens are case-insensitive and comma-separated.

Status resolution is performed by `@specd/core` — the CLI receives the resolved value.

### Requirement: Output format

In `text` mode (default), specs are grouped by workspace. Each group is rendered as a table:

- The workspace name is printed as a bold title line above the table.
- Each workspace group begins with an inverse-video workspace header row: `  workspace: <name>  `, padded to the same inner width as the column header row below it.
- Immediately below the workspace header is an inverse-video column header row. The header includes columns depending on which flags are passed: `PATH  TITLE` (default), with `METADATA STATUS` appended when `--metadata-status` is present, and `SUMMARY` appended when `--summary` is present.
- Data rows list one spec per line. The PATH column displays the fully-qualified spec identifier `workspace:capability-path` (e.g. `default:auth/login`). All columns are aligned to globally fixed widths (computed across all entries in all workspaces).
- When `--metadata-status` is passed, a `METADATA STATUS` column appears after `TITLE`, showing `fresh`, `stale`, `missing`, or `invalid`.
- When `--summary` is passed, `SUMMARY` follows as an additional aligned column using wrap overflow (capped at 60 characters).
- Workspace groups are separated by a blank line.

```
  workspace: default
  PATH                      TITLE
  default:<capability-path>  <title>
  default:<capability-path>  <title>

  workspace: default  (with --metadata-status)
  PATH                      TITLE     METADATA STATUS
  default:<capability-path>  <title>  fresh
  default:<capability-path>  <title>  stale
  default:<capability-path>  <title>  missing

  workspace: default  (with --summary)
  PATH                      TITLE    SUMMARY
  default:<capability-path>  <title>  <summary>
  default:<capability-path>  <title>

  workspace: default  (with --metadata-status --summary)
  PATH                      TITLE    METADATA STATUS   SUMMARY
  default:<capability-path>  <title>  fresh    <summary>
  default:<capability-path>  <title>  stale
```

In `json` or `toon` mode, each spec entry is an object. The `path` field uses the fully-qualified `workspace:capability-path` format:

```json
{
  "workspaces": [
    {
      "name": "...",
      "specs": [
        {
          "path": "workspace:cap/path",
          "title": "...",
          "metadataStatus": "fresh",
          "summary": "..."
        }
      ]
    }
  ]
}
```

When `--summary` is not passed, `summary` is omitted from text rows and from JSON/toon objects. When `--summary` is passed but no summary is available for a spec, the text row shows the title only and the JSON/toon object omits `summary` (does not include `null`).

When `--metadata-status` is not passed, `metadataStatus` is omitted from JSON/toon objects. When `--metadata-status` is passed, `metadataStatus` is always present as a string (`"fresh"`, `"stale"`, `"missing"`, or `"invalid"`).

### Requirement: Empty output

If a workspace has no specs, its heading is still printed in text mode followed by `  (none)`. In JSON/toon mode it appears as `{"name": "...", "specs": []}`.

If there are no workspaces configured, the command prints `no workspaces configured` and exits with code 0.

### Requirement: Error cases

If the spec filesystem cannot be read (I/O error), exits with code 3.

## Constraints

- No filtering by workspace or prefix in v1
- All configured workspaces are listed, even empty ones
- Title resolution, summary extraction, and status resolution are all implemented in `@specd/core`, not in the CLI
- Summary is never a hard error — if extraction fails for any reason, the spec is still listed without it
- Status resolution errors (I/O failures reading artifacts for hashing) result in `stale` status, not a hard error

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

$ specd spec list --metadata-status
  workspace: default
  PATH                      TITLE     METADATA STATUS
  default:auth/login        Login     fresh
  default:auth/register     Register  stale
  default:billing/invoices  Invoices  missing

$ specd spec list --metadata-status stale,missing
  workspace: default
  PATH                      TITLE     METADATA STATUS
  default:auth/register     Register  stale
  default:billing/invoices  Invoices  missing

$ specd spec list --metadata-status --format json
{"workspaces":[{"name":"default","specs":[{"path":"default:auth/login","title":"Login","metadataStatus":"fresh"},{"path":"default:auth/register","title":"Register","metadataStatus":"stale"}]}]}
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/spec`](../../core/spec/spec.md) — spec metadata access and listing model
- [`cli:cli/command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
