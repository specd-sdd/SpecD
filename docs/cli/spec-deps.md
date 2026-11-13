# spec deps

Manage persisted `dependsOn` links in `spec-lock.json`.

## Usage

```bash
specd specs deps list <specPath>
specd specs deps add <specPath> --dep <id>...
specd specs deps remove <specPath> --dep <id>...
specd specs deps set <specPath> --dep <id>...
specd specs deps clear <specPath> [--force]
```

## Options

| Option                        | Description                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--dep <id>`                  | Dependency spec ID (repeatable on `add` / `remove` / `set`). Raw ID — never comma-split. Bare IDs mean `default`. |
| `--force`                     | On `clear`, skip the confirmation prompt.                                                                         |
| `--format <text\|json\|toon>` | Output format.                                                                                                    |
| `--config <path>`             | Path to configuration file.                                                                                       |

## Rules

- `set` and `clear` are mutually exclusive with `add` / `remove`.
- `remove` runs before `add` when both appear in one mutation.
- `add` is idempotent.
- Missing lock: `set` / `clear` create incidental state; non-empty `add` creates via initialization; `remove` / empty `add` are no-ops.
- `clear` prompts for confirmation unless `--force` is passed. In a non-interactive shell without `--force` it fails with `clearing requires confirmation; pass --force to skip it`.
- `list` and mutations report `initialized`: `false` when the spec has no `spec-lock.json` yet. Text output then prints `spec <id> is not initialized — run specs init first`; `remove` prints `spec <id> is not initialized — nothing was removed`. JSON/TOON output carries `initialized: false`.
- An empty list on an initialized spec prints `dependsOn: (empty)`.
- Successful JSON/TOON output contains `result`, fully-qualified `specId`, `dependsOn`, and `initialized` when the use case supplies it. Run a leaf command with `--help` to see its output schema.
- A value such as `--dep "a,b"` is one ID and is rejected as invalid; repeat `--dep` for several dependencies.

## Errors

Validation errors are returned for conflicting flags. Invalid dependency IDs fail with `INVALID_SPEC_ID` (or `WORKSPACE_NOT_FOUND` when the workspace is unknown). An invalid persisted `spec-lock.json` fails with `INVALID_SPEC_LOCK`. `ReadOnlyWorkspaceError` and `ArtifactConflictError` surface on illegal workspace or concurrent writes.
