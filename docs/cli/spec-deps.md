# spec deps

Manage persisted `dependsOn` links in `spec-lock.json`.

## Usage

```bash
specd specs deps list <specPath>
specd specs deps add <specPath> --depends-on <id>...
specd specs deps remove <specPath> --depends-on <id>...
specd specs deps set <specPath> --depends-on <id>...
specd specs deps clear <specPath>
```

## Rules

- `set` and `clear` are mutually exclusive with `add` / `remove`.
- `remove` runs before `add` when both appear in one mutation.
- `add` is idempotent.
- Missing lock: `set` / `clear` create incidental state; non-empty `add` creates via initialization; `remove` / empty `add` are no-ops.

## Errors

Validation errors are returned for conflicting flags. `ReadOnlyWorkspaceError` and `ArtifactConflictError` surface on illegal workspace or concurrent writes.
