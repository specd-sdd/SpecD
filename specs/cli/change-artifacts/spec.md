# Change Artifacts

## Purpose

Agents need to know the exact filesystem paths where artifact files should be created or edited, without guessing directory layout. `specd change artifacts <name>` lists all artifact files for a change with their absolute paths on disk, effective statuses, and whether each file currently exists.

## Requirements

### Requirement: Command signature

```
specd change artifacts <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the change
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

Artifacts are listed per-file. Multi-file artifacts (e.g. `scope: spec` with multiple
specIds) produce one row per file. Single-file artifacts produce one row.

In `text` mode (default), each file is listed on one line:

```
<id>  <artifact-state>  <file-state>  <exists>  <absolute-path>
```

For multi-file artifacts, `<id>` includes the file key: `<artifact-id> [<file-key>]`.
For single-file artifacts, `<id>` is just the artifact type id.

When an artifact has no files yet (not synced), a summary row is shown with the
artifact-level `state`.

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{
  "name": "<change-name>",
  "changeDir": "<absolute-change-dir>",
  "artifacts": [
    {
      "artifactType": "proposal",
      "artifactState": "complete",
      "fileKey": "proposal",
      "filename": "proposal.md",
      "path": "/abs/path/proposal.md",
      "fileState": "complete",
      "exists": true
    },
    {
      "artifactType": "specs",
      "artifactState": "drifted-pending-review",
      "fileKey": "default:auth/login",
      "filename": "specs/default/auth/login/spec.md",
      "path": "/abs/path/specs/default/auth/login/spec.md",
      "fileState": "drifted-pending-review",
      "exists": true
    }
  ]
}
```

Artifacts are listed in schema-declared order, with per-file entries within each
artifact.

### Requirement: Error cases

- If the change does not exist, exits with code 1.

## Constraints

- Paths are always absolute — never relative
- All artifacts declared by the schema are listed, regardless of whether their files exist on disk
- Delta artifact paths (e.g. `deltas/<workspace>/<cap-path>/<filename>.delta.yaml`) are included as separate entries when the schema declares `delta: true` for an artifact

## Examples

```
$ specd change artifacts add-oauth-login
proposal                      complete      yes
specs [default:auth/login]    in-progress   yes
specs [default:auth/signup]   missing       no
tasks                         missing       no
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — CLI config discovery, exit codes, and output conventions
- [`core:core/change`](../../core/change/spec.md) — artifact and file state model used for listing
