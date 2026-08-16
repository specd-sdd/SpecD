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

The command SHALL open the project host and graph provider through the standard composition lifecycle and call the provider's canonical `getGraphHealth` operation exactly once for the requested project.

Provider composition SHALL use the same resolved configuration and kernel workspace definitions as the host. The CLI MUST NOT independently repeat workspace discovery, recompute freshness, or merge a second health interpretation. Project bootstrap and configuration errors remain standard command errors.

### Requirement: Concurrent indexing guard

`graph stats` MUST NOT perform a host-managed pre-open lock probe before opening the provider.

Instead, the command relies on provider-owned availability checks surfaced through `GetGraphHealth` and provider reads.

### Requirement: Output format

Human-readable output SHALL retain the existing labeled graph counts and append canonical health diagnostics: aggregate state, global stale latch, content freshness, coverage completeness, schema/generation compatibility, non-current workspace details, and stable reason codes. It SHALL not reduce dirty, partial, unknown, or incompatible health to an unqualified fresh/current message.

JSON and TOON output SHALL expose the complete structured result returned by `getGraphHealth` without presenter-side health recomputation. Legacy fields such as `stale`, `currentRef`, and `fingerprintMismatch` MAY remain as compatibility projections, but no exact legacy warning prose or stderr-only presentation is required.

### Requirement: Error cases

If the provider reports `GRAPH_BUSY`, the command SHALL fail with the standard graph-busy infrastructure error path and exit code 3.

If the provider reports `GRAPH_PROVIDER_STALE`, the command SHALL fail with the standard infrastructure error path and exit code 3.

If the provider cannot be opened or statistics retrieval fails due to another infrastructure error, the command SHALL exit with code 3.

### Requirement: Content freshness and coverage diagnostics

Graph stats SHALL render VCS, working-tree/content, derivation, backend schema/generation, and partial-index health as distinct diagnostics. It SHALL summarize excluded, unsupported, parse-failed, and partial coverage with stable reason codes.

Text output SHALL explain why the graph cannot prove symbol absence. JSON and TOON SHALL emit the complete structured health and coverage fields unchanged. Dirty or partial state MUST NOT be labelled simply as a fresh graph.

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
