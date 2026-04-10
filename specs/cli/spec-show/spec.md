# Spec Show

## Purpose

Users and scripts need to read the raw content of a spec without navigating the directory tree. The `specd spec show <workspace:capability-path>` command prints the content of a spec's artifact files to stdout in schema-declared order.

## Requirements

### Requirement: Command signature

```
specd spec show <workspace:capability-path> [--format text|json|toon]
```

- `<workspace:capability-path>` — required positional; the fully-qualified spec ID (e.g. `default:auth/login`)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), the command prints each artifact file for the spec in schema-declared order. Each file is preceded by a header line:

```
--- <filename> ---
<content>
```

All artifact files declared by the schema with scope `spec` are printed. Files that do not exist on disk are skipped silently.

In `json` or `toon` mode, the output is an array (encoded in the respective format):

```json
[{ "filename": "...", "content": "..." }]
```

Each entry corresponds to one artifact file present on disk, in schema-declared order. Files that do not exist on disk are omitted.

### Requirement: Error cases

- If the spec does not exist (no artifact files found at the given path), the command exits with code 1 and prints an `error:` message to stderr.
- If the workspace portion of the path is not a configured workspace, exits with code 1.

## Constraints

- The workspace is always explicit in the path — there is no default-workspace inference for this command
- Only spec-scoped artifacts are printed; change artifacts are not included
- `.specd-metadata.yaml` is excluded from the output — it is internal metadata, not user-facing spec content

## Examples

```
$ specd spec show default:auth/login
--- spec.md ---
# Auth Login

...

--- verify.md ---
# Verification: Auth Login

...
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
