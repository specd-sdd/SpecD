# Spec Search

## Purpose

Users need a dedicated command to search spec content by keyword. `specd specs search` provides relevance-ranked results by first attempting the code graph for fast, precise search, and falling back to `@specd/core`'s `SearchSpecs` use case (repository-based content search) when the graph is unavailable. Results are presented with titles, summaries, and workspace attribution in the same columnar style as `specs list`.

## Requirements

### Requirement: Command signature

```
specd specs search <query> [--workspace <name>] [--graph] [--summary] [--format text|json|toon]
```

- `<query>` — required positional argument; the search text
- `--workspace <name>` — optional, repeatable; restrict results to the named workspace(s). When provided, the workspace names MUST be passed to the search backend (graph or core) for server-side filtering
- `--graph` — optional flag; force graph-only mode. When set, the command MUST error if the graph is unavailable or stale
- `--summary` — optional flag; when present, a short summary is included for each result (same resolution as `specd specs list --summary`)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Search execution

The command MUST use the following search strategy:

1. **Graph-first**: Attempt to use the code graph's spec search facility. If the graph is available and not stale, use it for fast, precise search results.
2. **Core fallback**: When the graph is stale or unavailable and `--graph` is NOT set, fall back to `SearchSpecs.execute(query, options)` from `@specd/core`, which searches spec content via `SpecRepository.search()`. The command MUST print a warning to stderr indicating the fallback and that results may be less precise.
3. **Graph-only error**: When `--graph` is set and the graph is stale or unavailable, the command MUST exit with code 1 and print an error message to stderr.

In both paths, the search MUST cover spec content (title, description, spec.md body).

### Requirement: Workspace filtering

When `--workspace` is provided one or more times, the workspace names MUST be passed to the active search backend:

- In graph mode: pass workspaces to the graph search options for server-side filtering
- In core mode: pass `options.workspaces` to `SearchSpecs.execute()`

Workspace names that do not match any configured workspace MUST be silently ignored (no error, no warning).

When `--workspace` is not provided, all workspaces are included.

### Requirement: Summary resolution

When `--summary` is passed, each result MUST include a summary resolved using the exact same algorithm and priority order as `specd specs list --summary`:

1. `description` field from the spec's `.specd-metadata.yaml`
2. First non-empty paragraph after the H1 heading in `spec.md`
3. First paragraph of the first matching section (`## Overview`, `## Summary`, `## Purpose`)

Summary extraction is performed by `@specd/core` — the CLI does not contain Markdown parsing logic.

### Requirement: Output format — text

In text mode, results are rendered as a single table with columns depending on flags:

- Always: `PATH`, `TITLE`
- With `--summary`: add `SUMMARY` column (wrap overflow, capped at 60 characters)

Results are sorted by search score descending (highest relevance first). PATH displays the fully-qualified spec identifier `workspace:capability-path`.

Column widths are computed globally across all results (same algorithm as `specd specs list`).

When no results match, the command MUST print `no matching specs` to stdout.

### Requirement: Output format — JSON/toon

In `json` or `toon` mode, the output is a flat array of result objects:

```json
[
  {
    "path": "workspace:capability-path",
    "title": "...",
    "score": 0.42,
    "summary": "..."
  }
]
```

- `path` uses the fully-qualified `workspace:capability-path` format
- `score` is the search relevance score from the active backend
- `summary` is present only when `--summary` is passed and a summary is available

When no results match, the output is `[]`.

### Requirement: Error cases

- If the graph provider fails to initialize and `--graph` is set, exit with code 1
- If `<query>` is empty or whitespace-only, exit with code 1 with an error message
- I/O errors during core fallback exit with code 3

## Constraints

- The CLI orchestrates the search strategy (graph vs core); core does not depend on the code graph
- The command reuses the code-graph's existing spec search API when graph is available; no new graph indexing logic is introduced
- The command delegates to `SearchSpecs` use case from `@specd/core` for the fallback path; no direct filesystem access in the CLI
- Summary extraction delegates to `@specd/core` — the CLI does not parse Markdown
- Results are always ranked by relevance score; there is no alphabetical sort mode
- The `--graph` flag is the only way to require graph availability; the default behavior degrades gracefully to core

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`default:_global/spec-layout`](../../../_global/spec-layout/spec.md) — spec directory structure and file naming conventions
- [`core:search-specs`](../../core/search-specs/spec.md) — core use case for repository-based spec search (fallback path)
