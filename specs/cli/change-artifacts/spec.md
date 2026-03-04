# Change Artifacts

## Overview

Defines the `specd change artifacts <name>` command, which lists all artifact files for a change with their absolute paths on disk, effective statuses, and whether each file currently exists. Primarily useful for agents that need to know exactly where to create or edit artifact files.

## Requirements

### Requirement: Command signature

```
specd change artifacts <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), each artifact is listed on one line:

```
<artifact-id>  <effectiveStatus>  <exists>  <absolute-path>
```

where `<exists>` is `yes` or `no`, and `<absolute-path>` is the full filesystem path to the artifact file within the change directory (whether or not the file currently exists on disk).

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{
  "name": "<change-name>",
  "changeDir": "<absolute-path-to-change-directory>",
  "artifacts": [
    {
      "id": "...",
      "filename": "...",
      "path": "<absolute-path>",
      "effectiveStatus": "missing|in-progress|complete|skipped",
      "exists": true
    }
  ]
}
```

Artifacts are listed in schema-declared order. `changeDir` is the absolute path to the root of the change directory.

### Requirement: Error cases

- If the change does not exist, exits with code 1.

## Constraints

- Paths are always absolute — never relative
- All artifacts declared by the schema are listed, regardless of whether their files exist on disk
- Delta artifact paths (e.g. `deltas/<workspace>/<cap-path>/<filename>.delta.yaml`) are included as separate entries when the schema declares `delta: true` for an artifact

## Examples

```
$ specd change artifacts add-oauth-login
proposal   complete     yes  /home/user/project/.specd/changes/2026-01-add-oauth-login/proposal.md
spec       in-progress  yes  /home/user/project/.specd/changes/2026-01-add-oauth-login/spec.md
tasks      missing      no   /home/user/project/.specd/changes/2026-01-add-oauth-login/tasks.md

$ specd change artifacts add-oauth-login --format json
{
  "name": "add-oauth-login",
  "changeDir": "/home/user/project/.specd/changes/2026-01-add-oauth-login",
  "artifacts": [
    {"id": "proposal", "filename": "proposal.md", "path": "...proposal.md", "effectiveStatus": "complete", "exists": true},
    {"id": "spec", "filename": "spec.md", "path": "...spec.md", "effectiveStatus": "in-progress", "exists": true},
    {"id": "tasks", "filename": "tasks.md", "path": "...tasks.md", "effectiveStatus": "missing", "exists": false}
  ]
}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — artifact status derivation, change directory structure
