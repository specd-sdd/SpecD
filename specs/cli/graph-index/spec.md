# Graph Index

## Purpose

Without an up-to-date code graph, all graph-based queries return stale or empty results. The `specd graph index` command indexes the current workspace into the code graph, reporting what was discovered, indexed, skipped, and removed so users and agents can verify completeness.

## Requirements

### Requirement: Command signature

```text
specd graph index [--force] [--exclude-path <pattern>...] [--config <path> | --path <path>] [--format text|json|toon]
```

- `--force` is optional and requests a full logical reindex: indexed contents are
  cleared and every selected input is reprocessed.
- If a typed recoverable storage-open failure occurs, `--force` also authorizes the
  SDK use case to recreate closed storage and retry once; it does not authorize
  deletion for ordinary open failures.
- `--exclude-path <pattern>` is optional and repeatable.
- `--config <path>` and `--path <path>` remain mutually exclusive.
- `--format text|json|toon` defaults to text.

### Requirement: Indexing behaviour

Index execution MUST go through the high-level `runIsolatedGraphIndex` capability
imported from `@specd/sdk`. The CLI SHALL provide:

- the graph storage root resolved for the command context;
- the URL of its trusted, packaged graph-index task module;
- JSON-serializable task input containing the explicit configured or bootstrap
  context descriptor plus `force` and additional exclude paths;
- a progress callback that renders text-mode progress while leaving structured
  modes presentation-neutral.

The CLI MUST NOT import, acquire, inspect, assert, release, or otherwise coordinate
the graph index lock. It MUST NOT spawn or fork a graph-index process itself. Lock
acquisition, child creation, signal forwarding, IPC validation, termination
classification, and cleanup belong to the code-graph isolated worker.

The packaged CLI task SHALL execute inside the isolated child. It SHALL reconstruct
an SDK host context equivalent to the parent's explicit configured or bootstrap
descriptor and invoke `runIndexProjectGraph(ctx, input)` exactly once. Because an
in-memory kernel cannot cross a process boundary, the task MUST NOT claim or attempt
to reuse the same kernel object identity. It MUST preserve the selected config path
or bootstrap root and MUST NOT perform implicit project substitution.

Workspace assembly, VCS resolution, spec metadata materialization, provider
lifecycle, repair handling, and `IndexProjectGraph` orchestration SHALL remain in
`runIndexProjectGraph` inside `@specd/sdk`; the CLI task MUST NOT reproduce them.

Production execution SHALL always use the process-isolated worker. CLI-specific
`SPECD_GRAPH_INDEX_WORKER` and `SPECD_GRAPH_INDEX_NO_WORKER` execution branches are
not part of the target command behaviour. Tests SHALL use explicit worker/task
seams without changing the production path.

The parent CLI SHALL receive typed progress, result, and failure outcomes from the
high-level worker. It SHALL render the successful `RunIndexProjectGraphResult`
using the existing text, JSON, or TOON contract. Per-file indexing errors remain a
successful result; busy, fork, task, protocol, abnormal-exit, signal, provider, and
other infrastructure failures SHALL follow the command's existing system-error
path.

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

### Requirement: Forced indexing result completeness

A successful `graph index --force` result SHALL identify the run as a forced full logical reindex in text, JSON, and TOON output. Structured output MUST retain the stable full-rebuild flag and reason together with discovered, indexed, unsupported, excluded, skipped, coverage, and error counts.

Inputs reconsidered by a forced run MUST NOT be reported as hash-matched incremental skips. Any input that does not produce a file or document node SHALL instead appear under its actual exclusion, unsupported-language, parse-failure, partial, or per-input error classification.

The CLI SHALL render the result returned by the SDK orchestration and MUST NOT infer successful reconstruction merely from process exit code or an updated index timestamp.

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

### Requirement: Visible incompatibility repair

`graph index` SHALL be the supported user repair path for backend schema or graph-derivation incompatibility. It SHALL delegate repair through `runIndexProjectGraph` and MUST NOT delete backend files itself.

Text output SHALL state when a destructive full rebuild occurred and why. JSON and TOON SHALL expose the same stable rebuild flag and reason. Per-file coverage/error counts SHALL remain visible after repair.

## Constraints

- Index execution orchestration lives in `@specd/sdk`; the CLI does not assemble
  workspace targets, VCS refs, spec metadata collaborators, or
  `IndexProjectGraph` inputs inline.
- Lock ownership, process supervision, the worker entrypoint, IPC, signals, and
  cleanup live in `@specd/code-graph` behind the high-level worker API.
- CLI MUST import graph platform capabilities through `@specd/sdk` and MUST NOT
  declare or import `@specd/code-graph` directly.
- CLI MUST NOT expose task-module selection as a command option; its task module is
  trusted, packaged, and version-affine with the installed CLI.
- Production indexing always crosses the code-graph child-process boundary; test
  seams do not create a user-visible no-worker mode.
- `--force` and additional exclude paths are forwarded through serializable task
  input to `runIndexProjectGraph`.
- A non-forced command, and a forced command with any non-recoverable open error,
  preserves the typed open error and MUST NOT delete graph storage.
- Worker and provider failures are rendered through the existing CLI typed error
  and exit contract; the graph runtime does not render CLI output or call host
  `process.exit()`.
- Successful output preserves all existing index result, per-workspace, phase,
  rebuild, coverage, and per-file error fields.

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

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output
  conventions, and the delivery-host SDK boundary
- [`core:config`](../../core/config/spec.md) — configured operation, explicit config
  path handling, and bootstrap-mode relationship
- [`core:list-workspaces`](../../core/list-workspaces/spec.md) — centralized project
  orchestration through SDK
- [`sdk:run-index-project-graph`](../../sdk/run-index-project-graph/spec.md) — index
  execution orchestration performed by the injected CLI task
- [`sdk:host-context`](../../sdk/host-context/spec.md) — equivalent SDK host context
  reconstruction inside the child
- `code-graph:isolated-index-worker` — lock-aware process isolation and injected
  task execution consumed through SDK
