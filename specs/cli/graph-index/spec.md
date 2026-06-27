# Graph Index

## Purpose

Without an up-to-date code graph, all graph-based queries return stale or empty results. The `specd graph index` command indexes the current workspace into the code graph, reporting what was discovered, indexed, skipped, and removed so users and agents can verify completeness.

## Requirements

### Requirement: Command signature

```text
specd graph index [--force] [--exclude-path <pattern>] [--config <path> | --path <path>] [--format text|json|toon]
```

- `--force` — optional; recreate the graph store from scratch
- `--exclude-path <pattern>` — optional, repeatable; additional patterns to exclude during file discovery
- `--config <path>` — optional; explicit path to `specd.yaml`
- `--path <path>` — optional; repo-root bootstrap mode
- `--format text|json|toon` — optional; output format, defaults to `text`

`--config` and `--path` are mutually exclusive.

### Requirement: Indexing behaviour

The command obtains workspace targets and spec sources from the project configuration.
It delegates effective project graph config merging and index execution to `IndexProjectGraph.execute()` inside the worker process (or current process when worker bypass is active).

The command SHALL retain CLI-only concerns:

- shared graph indexing lock acquisition in the parent process before spawning a worker
- worker subprocess isolation via `child_process.spawn` unless `SPECD_GRAPH_INDEX_NO_WORKER=true`
- `onProgress` callback wiring for text-mode progress output
- `provider.recreate()` for `--force` is triggered by passing `force: true` to `IndexProjectGraph`

Unless `SPECD_GRAPH_INDEX_NO_WORKER` is set to `true` (test-only bypass), the parent CLI process SHALL spawn a child worker via `child_process.spawn` reusing the same CLI arguments. The parent acquires the shared graph indexing lock before spawning. The worker receives `SPECD_GRAPH_INDEX_WORKER=true` and `SPECD_GRAPH_INDEX_LOCK_HELD=true` in its environment, performs indexing via `IndexProjectGraph`, and inherits stdio from the parent. The parent forwards `SIGINT` and `SIGTERM` to the worker, releases the lock when the worker exits, and propagates the worker exit code (or reports worker failure on non-zero exit).

When `SPECD_GRAPH_INDEX_NO_WORKER` is `true`, indexing runs in the current process without spawning a worker. This bypass exists only for automated tests.

### Requirement: Output format

In `text` mode (default), the output is a summary block:

```text
Indexed 387 file(s) in 1234ms
  discovered: 459
  documents:  18
  skipped:    72
  removed:    0
  specs:      122
  errors:     3
    path/to/file.ts: error message
```

The first line shows `filesIndexed` and `duration`. The indented lines show `filesDiscovered`, `documentsIndexed`, `filesSkipped`, `filesRemoved`, `specsIndexed`, and error count. When errors are present, each error is listed below with its file path and message, indented further.

When the result includes per-workspace breakdowns, text mode also lists each workspace with discovered, indexed, document, skipped, and removed counts.

In `json` or `toon` mode, the full `IndexResult` object is output as-is, including `documentsIndexed` and the per-workspace `documentsIndexed` breakdown.

### Requirement: Error cases

If the provider cannot be opened or indexing fails due to an infrastructure error (I/O, database), the command exits with code 3.

If the shared graph indexing lock cannot be acquired because another indexing run is in progress, the command exits with code 3 after printing a user-facing retry-later message.

Per-file indexing errors (parse failures, unsupported syntax) do not cause a non-zero exit — they are reported in the `errors` array of `IndexResult` and the command exits with code 0.

### Requirement: CLI reference documentation

The `specd graph` command group SHALL be fully documented in `docs/cli/cli-reference.md` under a `## graph` section. The reference MUST cover all five subcommands: `index`, `search`, `hotspots`, `stats`, and `impact`.

For `graph index`, the documentation MUST include:

- Full command signature with all flags
- Description of `--exclude-path` flag: repeatable, gitignore-syntax, merges on top of config's `graph.excludePaths`
- Description of `--config` and `--path` behavior, including that they are mutually exclusive
- Description of bootstrap mode and no-config fallback as setup/bootstrap mechanisms rather than the normal configured mode
- Description of `graph.excludePaths` and `graph.respectGitignore` workspace config fields and their effect on indexing
- The built-in default exclusion list (applied when `graph.excludePaths` is not configured)
- Replace semantics: specifying `graph.excludePaths` replaces built-in defaults
- Example showing how to re-include a subdirectory of an otherwise-excluded dir using negation

For each other subcommand (`search`, `hotspots`, `stats`, `impact`), the documentation MUST include: command signature, flag descriptions, at least one usage example, and the graph CLI context model (`--config`, `--path`, bootstrap-only fallback semantics) when the command supports those flags.

## Constraints

- The CLI does not contain indexing logic, lock management, or configuration building — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider to prevent LadybugDB native threads from keeping the process alive
- `--force` delegates destructive backend recreation to the graph-store contract
- The `withProvider` helper manages lifecycle and registers `SIGINT`/`SIGTERM` signal handlers
- Workspace targets and spec sources are derived from `SpecdConfig` and `Kernel`
- Worker subprocess isolation keeps native graph-store threads out of the parent CLI process; tests bypass spawning via `SPECD_GRAPH_INDEX_NO_WORKER`

## Examples

```
$ specd graph index
Indexed 387 file(s) in 1234ms
  discovered: 459
  documents:  18
  skipped:    72
  removed:    0
  specs:      122
  errors:     0
  workspaces:
    core:    300 discovered, 250 indexed, 12 documents, 50 skipped, 0 removed
    cli:     159 discovered, 137 indexed, 6 documents, 22 skipped, 0 removed

$ specd graph index --force
Indexed 459 file(s) in 2100ms
  discovered: 459
  documents:  18
  skipped:    0
  removed:    312
  specs:      122
  errors:     0

$ specd graph index --format json
{"filesDiscovered":459,"filesIndexed":387,"documentsIndexed":18,...,"workspaces":[{"name":"core",...},{"name":"cli",...}]}
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:config`](../../core/config/spec.md) — configured operation, explicit config path handling, and bootstrap-mode relationship
- [`code-graph:composition`](../../code-graph/composition/spec.md) — CodeGraphProvider, IndexResult
- [`code-graph:graph-store`](../../code-graph/graph-store/spec.md) — abstract recreation semantics used by `--force`
- [`core:list-workspaces`](../../core/list-workspaces/spec.md) — centralized project orchestration
- [`code-graph:index-project-graph`](../../code-graph/index-project-graph/spec.md) — index execution use case
