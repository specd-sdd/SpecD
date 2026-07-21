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

The command obtains host context via `openSpecdHost` from `@specd/sdk`, opens the graph provider through the SDK lifecycle helper, and delegates health computation to `createGetGraphHealth`.

For `--config`, the command uses the explicit configuration path. For `--path` and the no-config fallback, it calls `openSpecdHost` with `allowBootstrapFallback: true` so the SDK first discovers a project configuration and otherwise creates a synthetic graph host from the resolved VCS root. `graph stats` MUST NOT call `resolveGraphCliContext`.

The command MUST pass `ListWorkspaces` results when the host has a configured kernel; synthetic bootstrap uses its generated default workspace.

### Requirement: Concurrent indexing guard

`graph stats` MUST NOT perform a host-managed pre-open lock probe before opening the provider.

Instead, the command relies on provider-owned availability checks surfaced through `GetGraphHealth` and provider reads.

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

If the provider reports `GRAPH_BUSY`, the command SHALL fail with the standard graph-busy infrastructure error path and exit code 3.

If the provider reports `GRAPH_PROVIDER_STALE`, the command SHALL fail with the standard infrastructure error path and exit code 3.

If the provider cannot be opened or statistics retrieval fails due to another infrastructure error, the command SHALL exit with code 3.

## Constraints

- Health orchestration runs inside `withOpenGraphProvider` from `@specd/sdk`; the CLI does not manage provider lifecycle inline
- `process.exit(0)` is called explicitly after the SDK wrapper closes the provider
- Zero-value relation counts are omitted from text output for readability
- Bootstrap mode (`--path`) resolves host context through `openSpecdHost` with the appropriate config path input
- Graph-busy and provider-stale availability semantics are owned by the provider, not by a CLI-managed pre-open lock probe

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
- [`code-graph:staleness-detection`](../../code-graph/staleness-detection/spec.md)
- [`core:list-workspaces`](../../core/list-workspaces/spec.md)
- [`code-graph:get-graph-health`](../../code-graph/get-graph-health/spec.md) — consolidated health orchestration (invoked via SDK host session)
- [`sdk:with-open-graph-provider`](../../sdk/with-open-graph-provider/spec.md) — provider lifecycle wrapper
- [`sdk:host-context`](../../sdk/host-context/spec.md) — host bootstrap via `openSpecdHost`
