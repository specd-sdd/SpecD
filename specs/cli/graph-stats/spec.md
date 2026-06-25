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

The command resolves the graph context and delegates project fingerprint comparison, VCS ref resolution, and staleness calculation entirely to the `@specd/code-graph` provider. It outputs the returned statistics, closes the provider, and exits.

### Requirement: Concurrent indexing guard

Before attempting to open the provider, `graph stats` SHALL query the lock status from the provider. If indexing is currently in progress, the command SHALL fail fast with a short user-facing retry-later message.

### Requirement: Output format

In `text` mode (default), the output is a labelled summary:

```text
Files:     459
Documents: 18
Symbols:   1497
Specs:     122
Languages: javascript, typescript
Relations:
  IMPORTS: 1227
  DEFINES: 1497
Last indexed: 2026-03-14T10:38:30.178Z
```

- `Files`, `Documents`, `Symbols`, `Specs` show `fileCount`, `documentCount`, `symbolCount`, `specCount`
- `Languages` shows the `languages` array joined by `, `
- `Relations` shows only non-zero relation counts from `relationCounts`, each on its own indented line
- `Last indexed` shows `lastIndexedAt` as an ISO 8601 timestamp

If the graph is stale, a warning line SHALL be appended after `Last indexed`:

```text
⚠ Graph is stale (indexed at <short-ref>, current: <short-ref>)
```

Where `<short-ref>` is the first 7 characters of the ref. If `lastIndexedRef` is `null`, no staleness line is shown.

If the stored derivation fingerprint differs from the fingerprint computed for the current effective graph configuration, a warning line SHALL be appended to stderr in text mode:

```text
⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index
```

This warning is independent from the VCS staleness line. Both MAY appear when the graph is stale by ref and mismatched by derivation fingerprint.

In `json` or `toon` mode, the full `GraphStatistics` object is output as-is, with three additional fields:

- `stale: boolean | null` — `true` if stale, `false` if fresh, `null` if unknown
- `currentRef: string | null` — the current VCS ref, or `null` if unavailable
- `fingerprintMismatch: boolean | null` — `true` when the stored derivation fingerprint differs from the current effective graph configuration, `false` when it matches, `null` when the comparison cannot be computed

### Requirement: Error cases

If the shared graph indexing lock is present, the command SHALL exit with code 3 after printing a user-facing retry-later message.

If the provider cannot be opened or statistics retrieval fails due to an infrastructure error, the command exits with code 3.

## Constraints

- The CLI does not compute statistics, manage locks, or calculate staleness — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- Zero-value relation counts are omitted from text output for readability
- Context resolution SHALL use the shared graph CLI model

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

- [`cli:entrypoint`](../entrypoint/spec.md)
- [`core:config`](../../core/config/spec.md)
- [`code-graph:composition`](../../code-graph/composition/spec.md)
- [`code-graph:staleness-detection`](../../code-graph/staleness-detection/spec.md)
- [`core:list-workspaces`](../../core/list-workspaces/spec.md)
