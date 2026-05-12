# Proposal: spec-list-filters

## Motivation

Users need a way to narrow the `specd specs list` output to a workspace (or set
of workspaces) and perform richer text searches. Large repositories produce noisy
spec listings; workspace filters and an optional graph-backed search improve
discoverability and speed workflows.

## Current behaviour

`specd specs list` lists all specs across all configured workspaces with an
optional short summary. There is no built-in way to restrict results to one or
more workspaces from the CLI, nor an integrated graph-powered query mode.

## Proposed solution

Expose flags on the CLI `specs list` command:

- `--workspace <name>` (repeatable) — include only specs belonging to the named workspace(s). The CLI `specs list` implementation MUST add this flag and wire it to the extended `@specd/core` ListSpecs use-case so filtering is efficient and consistent across consumers.
- NOTE: Full-text search has moved to the dedicated command `specd specs search` (see `cli:cli/spec-search`). Use that command for search semantics.

Implementation approach (high-level):

- Add flags and wiring in `cli/src/commands/spec/list.ts` (registerSpecList).
- Extend `@specd/core` `ListSpecs` use-case to accept optional workspace-prefix and optional query parameters so listing and search behavior can be reused across consumers. Update the `SpecRepository` FS adapter as needed to support efficient prefix and content scanning. The CLI will call the extended use-case for listing and will reuse internal graph-search for search-specific flows.
- Search functionality is provided by the new `specd specs search` command which reuses the CLI's internal graph-search implementation (the same code path as `specd graph search --specs --spec-content`). The `specs list` command will not perform full-text searches; it will call the extended `ListSpecs` use-case for listing behavior. When search is invoked via `specs search`, it will map returned spec IDs to list entries and merge with filesystem metadata for display. If the graph is stale or unavailable, `specs search` will fall back to a filesystem-based content search and show a warning indicating the fallback and potential reduced precision.
- Fall back to filesystem listing when the graph is stale or unavailable, and
  surface a warning when graph-backed search is requested but cannot be used.

## Specs affected

### New specs

- cli:cli/spec-search: CLI subcommand `specs search` to perform full-content searches across specs. Uses graph-first strategy (code graph when available), falling back to core's `SearchSpecs` use case (repository-based content search) when the graph is unavailable. Provides flags including `--workspace` for workspace scoping, `--graph` for graph-only mode, `--summary`, and `--format` output selection.
  - Note: The `--summary` flag follows the exact semantics and extraction order used by `specd specs list` (implemented in `@specd/core`): 1) `description` in `.specd-metadata.yaml`, 2) the first non-empty paragraph immediately after the `# H1` heading in `spec.md`, 3) the first paragraph of `## Overview`/`## Summary`/`## Purpose`. In text mode summaries are wrapped to approximately 60 characters; in JSON/toon mode the `summary` key is omitted when not present.
  - Depends on: `core:core/search-specs`
- core:core/search-specs: New use case that searches spec content across workspaces via `SpecRepository.search()`. Orchestrate across workspaces, merge and rank results by score. Used by CLI as fallback when code graph is unavailable.
  - Depends on: none

### Modified specs

- cli:cli/spec-list: Add CLI flags and behavior for workspace filtering. `specs list` will not perform full-text searches; the new `specd specs search` subcommand provides full-text search functionality. This is a UX/behavior change to the CLI spec (adds new options and expected output behaviors).
  - Depends on (added): none
- core:core/list-specs: Extend `ListSpecs.execute()` to accept an optional `workspaces` filter parameter so that workspace filtering is performed at the use-case level, not just in the CLI. This makes filtering reusable across all consumers.
  - Depends on (added): none
- core:core/spec-repository-port: Add `search(query, options?)` method to `SpecRepository` port for content-based spec search within a single workspace. Returns ranked results with snippets.
  - Depends on (added): none

## Impact

- CLI code (primary): `packages/cli/src/commands/spec/list.ts` — add `--workspace` flag and listing behavior; `packages/cli/src/commands/spec/search.ts` — new `specs search` subcommand that orchestrates graph-first, core-fallback search.
- Core: Extend `ListSpecs` use case to accept `workspaces` filter; add `SearchSpecs` use case for repository-based content search; add `search()` method to `SpecRepository` port.
- Code-graph: reuse existing graph search APIs; no graph implementation changes required.
- Documentation/CLI help: update `docs/cli` and command help text for both `specs list` and `specs search`.

## Technical context

- Existing `ListSpecs` use-case and `SpecRepository` FS adapter already support
  prefix-based listing; this can be reused for workspace filtering if we extend
  the use-case signature or perform client-side filtering in the CLI.
- The code-graph provides `specs`-scoped search results that include spec IDs;
  mapping results to the CLI list is straightforward.
- Performance: prefer graph search for free-text queries and filesystem listing
  for simple workspace filters to avoid unnecessary graph queries.

## Decisions

1. Workspace filtering: extend `@specd/core` ListSpecs use-case now to accept optional workspace-prefix and optional query parameters; update FS adapters accordingly. This enables reuse by CLI and other consumers.
2. CLI flag chosen: `--workspace` (repeatable) for workspace scoping.
3. Graph stale behavior for search: fallback to filesystem-based content search and display a clear warning. `--graph` forces graph-only and errors if unavailable.
4. Search UX: create a dedicated subcommand `specd specs search` (primary). Keep `specs list` focused on listing; `spec-search` reuses the same internal implementation.

Generated-from: .specd-exploration.md and user conversation
