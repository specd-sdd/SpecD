# Graph Stats

## Purpose

Without a quick overview of the code graph's contents, users and agents cannot tell whether the graph is populated, how large it is, or when it was last updated. The `specd graph stats` command displays summary statistics from the code graph so users can assess coverage and freshness at a glance.

## Requirements

### Requirement: Command signature

```
specd graph stats [--config <path> | --path <path>] [--format text|json|toon]
```

- `--config <path>` — optional; explicit path to `specd.yaml`, matching the standard CLI meaning
- `--path <path>` — optional; repo-root bootstrap mode
- `--format text|json|toon` — optional; output format, defaults to `text`

`--config` and `--path` are mutually exclusive.

`--path` and no-config fallback are bootstrap mechanisms for setup and repository exploration, not the intended steady-state mode for configured projects.

### Requirement: Statistics retrieval

The command:

1. Validates that `--config` and `--path` are not both present
2. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
3. Creates a `CodeGraphProvider` from the resolved graph context
4. Opens the provider
5. Calls `getStatistics()` to retrieve the `GraphStatistics` object
6. Resolves the current VCS ref via `createVcsAdapter(projectRoot)` and `vcs.ref()`. If VCS detection fails or `ref()` throws, `currentRef` is `null`.
7. Compares `currentRef` against `statistics.lastIndexedRef` to determine staleness
8. Outputs the statistics with staleness information
9. Closes the provider
10. Exits with `process.exit(0)` — required because the LadybugDB native addon keeps the Node process alive

In bootstrap mode, the command SHALL behave as if there were a single `default` workspace whose `codeRoot` is the resolved VCS root.

### Requirement: Concurrent indexing guard

Before attempting to open the provider, `graph stats` SHALL check the shared graph indexing lock used by `graph index`.

If indexing is currently in progress, the command SHALL fail fast with a short user-facing retry-later message indicating that the graph is being indexed and should be queried again in a few seconds.

This guard exists so the command does not surface backend lock failures opportunistically while another CLI process is rebuilding the graph.

### Requirement: Output format

In `text` mode (default), the output is a labelled summary:

```
Files:     459
Symbols:   1497
Specs:     122
Languages: javascript, typescript
Relations:
  IMPORTS: 1227
  DEFINES: 1497
Last indexed: 2026-03-14T10:38:30.178Z
```

- `Files`, `Symbols`, `Specs` show `fileCount`, `symbolCount`, `specCount`
- `Languages` shows the `languages` array joined by `, `
- `Relations` shows only non-zero relation counts from `relationCounts`, each on its own indented line
- `Last indexed` shows `lastIndexedAt` as an ISO 8601 timestamp

If the graph is stale, a warning line SHALL be appended after `Last indexed`:

```
⚠ Graph is stale (indexed at <short-ref>, current: <short-ref>)
```

Where `<short-ref>` is the first 7 characters of the ref. If `lastIndexedRef` is `null`, no staleness line is shown.

In `json` or `toon` mode, the full `GraphStatistics` object is output as-is, with two additional fields:

- `stale: boolean | null` — `true` if stale, `false` if fresh, `null` if unknown
- `currentRef: string | null` — the current VCS ref, or `null` if unavailable

### Requirement: Error cases

If the shared graph indexing lock is present, the command SHALL exit with code 3 after printing a user-facing retry-later message.

If the provider cannot be opened or statistics retrieval fails due to an infrastructure error, the command exits with code 3.

## Constraints

- The CLI does not compute statistics — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- Zero-value relation counts are omitted from text output for readability
- Context resolution SHALL use the shared graph CLI model rather than command-local path semantics
- The command checks the shared graph indexing lock before opening the provider and fails fast while indexing is in progress

## Examples

```
$ specd graph stats
Files:     459
Symbols:   1497
Specs:     122
Languages: javascript, typescript
Relations:
  IMPORTS: 1227
  DEFINES: 1497
Last indexed: 2026-03-14T10:38:30.178Z

$ specd graph stats --format json
{"fileCount":459,"symbolCount":1497,"specCount":122,"languages":["javascript","typescript"],"relationCounts":{"IMPORTS":1227,"DEFINES":1497},"lastIndexedAt":"2026-03-14T10:38:30.178Z"}

$ specd graph stats --path /tmp/my-project
Files:     42
Symbols:   150
Specs:     12
Languages: typescript
Relations:
  IMPORTS: 120
  DEFINES: 150
Last indexed: 2026-03-13T09:00:00.000Z
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/config/spec.md`](../../core/config/spec.md) — configured operation, explicit config path handling, and bootstrap-mode relationship
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider, GraphStatistics
- [`specs/code-graph/staleness-detection/spec.md`](../../code-graph/staleness-detection/spec.md) — staleness semantics, warn-not-block policy
