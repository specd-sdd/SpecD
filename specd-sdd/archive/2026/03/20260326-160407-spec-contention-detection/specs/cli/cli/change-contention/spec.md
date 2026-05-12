# Change Contention

## Purpose

Users need a way to check whether their in-progress work overlaps with other active changes targeting the same specs. Without a dedicated command, contention is invisible until archive time when delta application fails. `specd change contention` surfaces this information proactively.

## Requirements

### Requirement: Command signature

```
specd change contention [<name>] [--format text|json|toon]
```

- `<name>` — optional; when provided, shows contention only for the named change
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Text output format

In `text` mode, the command MUST print a grouped display where each contended spec is a header followed by the changes that target it:

```
<specId>
  <changeName>  <state>
  <changeName>  <state>

<specId>
  <changeName>  <state>
  <changeName>  <state>
```

Spec IDs MUST be sorted lexicographically. Changes within each group MUST be sorted by name.

### Requirement: JSON output format

In `json` or `toon` mode, the command MUST output the `ContentionReport` structure:

```json
{
  "hasContention": true,
  "entries": [
    {
      "specId": "core:core/config",
      "changes": [
        { "name": "change-a", "state": "designing" },
        { "name": "change-b", "state": "implementing" }
      ]
    }
  ]
}
```

### Requirement: No contention output

When no contention is detected, the command MUST:

- In `text` mode: print `no contention detected` to stdout
- In `json`/`toon` mode: output `{"hasContention":false,"entries":[]}`

The process MUST exit with code 0.

### Requirement: Named change not found

When `<name>` is provided but no active change with that name exists, the command MUST print an error message to stderr and exit with code 1.

### Requirement: Exit codes

- `0` — command succeeded (contention or no contention)
- `1` — named change not found or unexpected error

Contention is informational — its presence MUST NOT cause a non-zero exit code.

## Constraints

- The command MUST delegate to `DetectContention` via the kernel — it MUST NOT scan changes directly
- No filtering by workspace or spec ID in v1

## Spec Dependencies

- `cli:cli/entrypoint` — config discovery, exit codes, output conventions
- `core:core/spec-contention` — `DetectContention` use case and `ContentionReport` type
