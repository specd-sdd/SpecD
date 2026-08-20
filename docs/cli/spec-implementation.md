# spec implementation

Manage persisted implementation links in `spec-lock.json`.

## Usage

```bash
specd specs implementation list <specPath>
specd specs implementation add <specPath> --file <path> [--symbol <name>...]
specd specs implementation remove <specPath> --file <path> [--symbol <name>...]
specd specs implementation suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--confidence <HIGH|MED>] [--rebuild-cache]
```

## Behavior

- `add` requires the target file to exist under the workspace `codeRoot` and normalizes paths to `workspace:relative/path`.
- `add` merges `symbols` additively when the file entry already exists.
- `remove` with `symbols` drops only those names; without `symbols`, removes the whole entry.
- `suggest` performs static analysis and Code Graph symbol correlation to deduce candidate implementation files and AST symbols.
- `suggest --apply` performs an additive set union, updating `spec-lock.json` without overriding or deleting existing confirmed links.
- Missing lock: `add` creates incidental state; `remove` is a no-op.

## Errors

| Error                                  | Cause                            |
| -------------------------------------- | -------------------------------- |
| `ImplementationFileNotFoundError`      | File missing on disk             |
| `ImplementationWorkspaceBoundaryError` | File outside workspace code root |
