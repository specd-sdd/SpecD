# Graph Stats

## Purpose

Without a quick overview of the code graph's contents, users and agents cannot tell whether the graph is populated, how large it is, or when it was last updated. The `specd graph stats` command displays summary statistics from the code graph so users can assess coverage and freshness at a glance.

## Requirements

### Requirement: Command signature

```
specd graph stats [--path <path>] [--format text|json|toon]
```

- `--path` — optional; workspace root, defaults to the current working directory
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Statistics retrieval

The command:

1. Creates a `CodeGraphProvider` with the resolved path
2. Opens the provider
3. Calls `getStatistics()` to retrieve the `GraphStatistics` object
4. Outputs the statistics
5. Closes the provider
6. Exits with `process.exit(0)` — required because the LadybugDB native addon keeps the Node process alive

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

In `json` or `toon` mode, the full `GraphStatistics` object is output as-is.

### Requirement: Error cases

If the provider cannot be opened or statistics retrieval fails due to an infrastructure error, the command exits with code 3.

## Constraints

- The CLI does not compute statistics — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- Zero-value relation counts are omitted from text output for readability

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
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider, GraphStatistics
