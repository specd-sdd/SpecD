# spec init

Initialize persisted semantic state (`spec-lock.json`) for specs that do not yet have a lock file.

## Usage

```bash
specd specs init <specPath>
specd specs init --all [--workspace <name>...] [--schema <ref>]
```

## Behavior

- Resolves the project schema (or `--schema`) and records it in the lock.
- Seeds `dependsOn` from explicit CLI input when provided, otherwise from schema extraction against current artifacts, otherwise `[]`.
- Refuses to overwrite an existing lock (`SpecAlreadyInitializedError`).

## Output

Single-spec mode prints the initialized `specId`, schema identity, and `dependsOn` list. Batch mode (`--all`) reports per-spec `initialized` / `failed` counts and `existingSkipped` on repeat runs.

## Errors

| Error                         | Cause                  |
| ----------------------------- | ---------------------- |
| `SpecNotFoundError`           | Unknown spec path      |
| `SpecAlreadyInitializedError` | Lock already exists    |
| `ReadOnlyWorkspaceError`      | Workspace is read-only |
