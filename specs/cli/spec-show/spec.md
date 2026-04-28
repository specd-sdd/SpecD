# Spec Show

## Purpose

Users and scripts need to read the raw content of a spec without navigating the directory tree. The `specd spec show <workspace:capability-path>` command prints the content of a spec's artifact files to stdout in schema-declared order.

## Requirements

### Requirement: Command signature

```
specd spec show <workspace:capability-path> [--artifact <name>] [--format text|json|toon]
```

- `<workspace:capability-path>` — required positional; the fully-qualified spec ID (e.g. `default:auth/login`)
- `--artifact <name>` — optional; filters the output to only include the artifact with the given ID (e.g. `specs`, `verify`)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), the command prints each artifact file for the spec in schema-declared order. Each file is preceded by a header line:

```
--- <filename> ---
<content>
```

If `--artifact` is provided, the header line for the single artifact IS still printed.

In `json` or `toon` mode, the output is an array (encoded in the respective format):

```json
[{ "filename": "...", "content": "..." }]
```

If `--artifact` is provided, the array SHALL contain exactly one entry for the requested artifact.

### Requirement: Error cases

- If the spec does not exist (no artifact files found at the given path), the command exits with code 1 and prints an `error:` message to stderr.
- If the workspace portion of the path is not a configured workspace, exits with code 1.

### Requirement: Artifact filtering

When the `--artifact <name>` flag is provided, the command MUST resolve the `<name>` to a filename using the active schema's artifact definitions.

- Only the content of the artifact matching the resolved filename SHALL be printed.
- If `<name>` does not exist in the active schema, the command SHALL exit with code 1 and print an `error:` message to stderr.
- If the artifact exists in the schema but is missing on disk for the specified spec, the command SHALL exit with code 1 and print an `error:` message to stderr (unlike the default behavior which skips missing files).

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
