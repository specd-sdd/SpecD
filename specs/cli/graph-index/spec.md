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

The command uses the shared graph CLI context model together with `withProvider`, which manages the `CodeGraphProvider` lifecycle and registers `SIGINT`/`SIGTERM` signal handlers for graceful shutdown.

The command:

1. Validates that `--config` and `--path` are not both present
2. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
3. In configured mode, obtains the orchestrated project structure via `ListWorkspaces` and uses the rich `ProjectWorkspace[]` list to build `IndexOptions`
4. In bootstrap mode, indexes the resolved repository root as a synthetic single `default` workspace whose `codeRoot` is the VCS root
5. Acquires the shared graph indexing lock before opening the provider for mutation work
6. If `--force` is passed, invokes the graph-store recreation capability before indexing
7. In configured mode, builds the effective graph config from `SpecdConfig.graph`, including project-global `includePaths`, global `excludePaths`, workspace graph filters, and any synthetic spec-root exclusions. Patterns from `--exclude-path` flags are appended to the effective global exclusion set.
8. Calls `index(options)` to perform the indexing. The indexer handles spec extraction and progress reporting using the injected repositories.
9. Outputs the `IndexResult` with per-workspace breakdown
10. Releases the shared graph indexing lock during normal shutdown and signal-driven shutdown paths
11. Closes the provider
12. Exits with `process.exit(0)`

In configured mode, indexing SHALL always cover the full configured project graph surface. The command MUST NOT offer a workspace-scoped partial indexing mode.

Project-global discovery MUST NOT emit `root:` entries for files already owned by a configured workspace `codeRoot`.

Archived spec implementation coverage and spec resolution SHALL be derived inside `@specd/code-graph`. The CLI SHALL NOT read `spec-lock.json` sidecars or manually construct extraction callbacks.

When output is a TTY and format is `text`, progress is displayed on stderr using `\r\x1b[K` for in-place updates (overwriting the current line).

The indexing lock is a CLI-level coordination mechanism that prevents overlapping graph commands from reaching backend lock failures first. If another indexing run already holds the lock, `graph index` fails fast with a user-facing retry-later message instead of attempting to mutate the backend concurrently.

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

- The CLI does not contain indexing logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider to prevent LadybugDB native threads from keeping the process alive
- `--force` delegates destructive backend recreation to the graph-store contract; the CLI does not delete backend-specific files directly
- `graph index` owns the shared graph indexing lock and must release it on normal exit and signal-driven shutdown
- The `withProvider` helper manages lifecycle and registers `SIGINT`/`SIGTERM` signal handlers
- Workspace targets and spec sources are derived from `SpecdConfig` and `Kernel`, not from CLI arguments

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
