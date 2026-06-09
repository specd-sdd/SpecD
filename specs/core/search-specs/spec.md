# Search Specs

## Purpose

Consumers need a core-level use case to search spec content by keyword without depending on the code graph. `SearchSpecs` provides content-based search across all configured workspaces by delegating to each workspace's `SpecRepository.search()` method. It is the fallback search path when the code graph is unavailable, and the primary search path for consumers that do not have graph access.

## Requirements

### Requirement: Multi-workspace search orchestration

`SearchSpecs.execute()` SHALL obtain the orchestrated project structure via the `ListWorkspaces` use case. It SHALL perform substring matching across all spec artifacts in each workspace using the provided `SpecRepository.search()` method.

Results from all workspaces SHALL be aggregated, ranked by relevance score, and returned to the caller.

### Requirement: Optional workspace filter

When `options.workspaces` is provided as a non-empty array of workspace names, only those workspaces SHALL be searched. Workspace names that do not match any configured workspace SHALL be silently ignored. When `options.workspaces` is omitted or empty, all configured workspaces are searched.

### Requirement: Optional summary resolution

When `options.includeSummary` is `true`, each result MUST include a `summary` field resolved using the same algorithm as `ListSpecs`: metadata `description` first, then `spec.md` extraction fallback.

When `options.includeSummary` is `false` or omitted, `summary` MUST NOT appear on any result.

### Requirement: Result shape

Each entry in the result array MUST include:

- `workspace` — the workspace name
- `path` — the spec's capability path
- `title` — the resolved title (same resolution as `ListSpecs`)
- `score` — the relevance score from the repository search
- `matches` — the array of `SpecSearchMatch` objects from the repository

Optional fields:

- `summary` — present only when `includeSummary` is `true` and a summary is available

### Requirement: Silent error handling

Errors encountered while searching an individual workspace MUST be silently caught. Results from that workspace MUST be omitted from the output, but results from other workspaces MUST still be returned. The use case SHALL NOT propagate I/O errors from individual repository searches to the caller.

### Requirement: Empty results

When no specs match across all searched workspaces, the use case MUST return an empty array (not an error).

## Constraints

- The use case SHALL depend on `ListWorkspaces` for consistent project traversal during fallback search.
- Results MUST be returned sorted by descending relevance score.

## Spec Dependencies

- [`core:spec-repository-port`](../spec-repository-port/spec.md) — repository-backed search contract
- [`core:list-specs`](../list-specs/spec.md) — shared listing and result-shaping model
- [`core:workspace`](../workspace/spec.md) — workspace attribution in search results
- [`core:list-workspaces`](../list-workspaces/spec.md) — orchestrated workspace source for fallback search
