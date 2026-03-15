# Graph Index

## Purpose

Without an up-to-date code graph, all graph-based queries return stale or empty results. The `specd graph index` command indexes the current workspace into the code graph, reporting what was discovered, indexed, skipped, and removed so users and agents can verify completeness.

## Requirements

### Requirement: Command signature

```
specd graph index [--workspace <name>] [--force] [--format text|json|toon]
```

- `--workspace` — optional; index only the named workspace instead of all workspaces
- `--force` — optional flag; when present, all existing graph data is cleared before indexing
- `--format text|json|toon` — optional; output format, defaults to `text`

The `--path` option is removed — the workspace root is derived from `SpecdConfig` via `resolveCliContext()`.

### Requirement: Indexing behaviour

The command uses `resolveCliContext()` to load config and kernel, then uses `withProvider` which manages the `CodeGraphProvider` lifecycle and registers `SIGINT`/`SIGTERM` signal handlers for graceful shutdown.

The command:

1. Resolves CLI context via `resolveCliContext()` to get `SpecdConfig` and `Kernel`
2. Creates a `CodeGraphProvider` from the config via `withProvider`
3. If `--force` is passed, deletes the `.lbug`, `.lbug.wal`, and `.lbug.lock` files before opening (rather than calling `clear()`)
4. Builds `WorkspaceIndexTarget[]` from `config.workspaces`, using `kernel.specs.repos` to provide spec sources
5. If `--workspace` is specified, filters to only that workspace
6. Calls `index({ workspaces, projectRoot })` to perform the indexing
7. Outputs the `IndexResult` with per-workspace breakdown
8. Closes the provider
9. Exits with `process.exit(0)` — this explicit exit is required because the LadybugDB native threads keep the Node process alive

When output is a TTY and format is `text`, progress is displayed on stderr using `\r\x1b[K` for in-place updates (overwriting the current line).

### Requirement: Output format

In `text` mode (default), the output is a summary block:

```
Indexed 387 file(s) in 1234ms
  discovered: 459
  skipped:    72
  removed:    0
  specs:      122
  errors:     3
    path/to/file.ts: error message
```

The first line shows `filesIndexed` and `duration`. The indented lines show `filesDiscovered`, `filesSkipped`, `filesRemoved`, `specsIndexed`, and error count. When errors are present, each error is listed below with its file path and message, indented further.

In `json` or `toon` mode, the full `IndexResult` object is output as-is.

### Requirement: Error cases

If the provider cannot be opened or indexing fails due to an infrastructure error (I/O, database), the command exits with code 3.

Per-file indexing errors (parse failures, unsupported syntax) do not cause a non-zero exit — they are reported in the `errors` array of `IndexResult` and the command exits with code 0.

## Constraints

- The CLI does not contain indexing logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider to prevent LadybugDB native threads from keeping the process alive
- `--force` deletes the database files (`.lbug`, `.lbug.wal`, `.lbug.lock`) before opening; without it, indexing is incremental
- The `withProvider` helper manages lifecycle and registers `SIGINT`/`SIGTERM` signal handlers
- Workspace targets and spec sources are derived from `SpecdConfig` and `Kernel`, not from CLI arguments

## Examples

```
$ specd graph index
Indexed 387 file(s) in 1234ms
  discovered: 459
  skipped:    72
  removed:    0
  specs:      122
  errors:     0
  workspaces:
    core:    300 discovered, 250 indexed, 50 skipped, 0 removed
    cli:     159 discovered, 137 indexed, 22 skipped, 0 removed

$ specd graph index --workspace core
Indexed 250 file(s) in 800ms
  discovered: 300
  skipped:    50
  removed:    0
  specs:      80
  errors:     0

$ specd graph index --force
Indexed 459 file(s) in 2100ms
  discovered: 459
  skipped:    0
  removed:    312
  specs:      122
  errors:     0

$ specd graph index --format json
{"filesDiscovered":459,"filesIndexed":387,...,"workspaces":[{"name":"core",...},{"name":"cli",...}]}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider, IndexResult
