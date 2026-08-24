# spec deps

Manage persisted `dependsOn` links in `spec-lock.json`.

## Usage

```bash
specd specs deps list <specPath>
specd specs deps add <specPath> --dep <id>...
specd specs deps remove <specPath> --dep <id>...
specd specs deps set <specPath> [--dep <id>...]
specd specs deps clear <specPath>
specd specs deps suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--create-change] [--rebuild-cache]
```

Each subcommand accepts `--format text|json|toon` (default `text`) and `--config <path>`.

## Rules

- Every subcommand delegates to the `UpdatePersistedSpecDeps` / `GetPersistedSpecDeps` kernel use cases; the CLI performs no persisted-state writes itself.
- `add` appends every supplied `--dep` id; duplicates are ignored by the use case.
- `remove` on an uninitialized spec reports a no-op instead of an error.
- `suggest` traces AST import graphs and barrel re-exports to deduce inter-spec dependencies.
- `suggest --apply` unions suggested dependencies into `spec-lock.json` and runs post-apply validation. If invalid specs exist and `--create-change` is set, creates an alignment change with `.specd-exploration.md`.
- Missing lock: `set` / `clear` create incidental state; non-empty `add` creates via initialization; `remove` / empty `add` are no-ops.

## Errors

Validation errors are returned for conflicting flags. `ReadOnlyWorkspaceError` and `ArtifactConflictError` surface on illegal workspace or concurrent writes.
