# List Specs

## Purpose

Agents and CLI users need a single query to discover what specs exist across all workspaces without loading full spec content. The `ListSpecs` use case enumerates all specs across all configured workspaces, returning a title for each entry and optionally a short summary and metadata freshness status. It supports optional workspace filtering so callers can restrict results to one or more named workspaces. It is the primary query for discovery UIs and CLI listing commands.

## Requirements

### Requirement: Enumerate specs across all workspaces

`ListSpecs.execute(options?)` SHALL obtain the orchestrated project structure via the `ListWorkspaces` use case (or the corresponding kernel capability). It SHALL iterate through the resulting `ProjectWorkspace` entities and call `SpecRepository.list(options)` on each workspace's `specRepo`.

It MUST forward the same `ListOptions` and `includeSummary` to every workspace repository call. It MUST NOT forward a metadata-status flag — public metadata freshness status and status filtering are removed; repository listing is a raw identity/index operation. It MUST NOT apply a default `limit` of its own — when the host omits `limit`, each repository MUST return its full filtered set per [`core:repository-port`](../repository-port/spec.md). It MUST NOT re-sort, re-filter, or re-paginate per-workspace results after the repository returns.

The merged result MUST preserve workspace declaration order from `ListWorkspaces`, with each workspace's items in the repository's canonical path order. Cross-workspace pagination is out of scope for v1 — callers paginate within a single workspace via the port or filter workspaces explicitly.

Workspace filtering SHALL be performed by matching workspace names against the orchestrated list before invoking `list()`.

### Requirement: Always resolve a title for each entry

Every returned `SpecListEntry` MUST include a `title` field supplied by `SpecRepository.list()`. The use case MUST NOT perform additional metadata or file reads to resolve titles when the repository already returned them.

### Requirement: Optional summary resolution

When `options.includeSummary` is `true`, the use case MUST resolve `summary` for each entry from the workspace `SpecRepository.list()` result. Summary projection is performed at the repository/index materialization boundary (`FsSpecIndexCache` and related index rebuild paths), which self-heals metadata with `policy: 'if-needed'` (via `GetSpecMetadata` / internal materialization delegation) before projecting the normalized `description` (or, when `llmOptimizedContext` is active and the materialized metadata reports `optimizedDescription` as fresh, the optimized value). `ListSpecs` MUST NOT call `GetSpecMetadata` or `MaterializeSpecMetadata` directly for summary resolution.

It MUST NOT project a stale or missing optimized field as though it were current — a missing or stale `optimizedDescription` falls back to the normalized `description`.

When index materialization cannot produce a projection for a spec at all, that spec's `summary` is omitted rather than causing the whole listing to fail.

When `options.includeSummary` is `false` or omitted, `summary` MUST NOT appear on any entry, and repository listing MUST NOT trigger summary materialization for that call.

### Requirement: Silent error handling for metadata and summary reads

Per-spec title resolution errors are handled at index materialization time in `FsSpecIndexCache`. Per-spec summary materialization errors at the repository/index boundary MUST be caught by the repository list path and result in that entry's `summary` being omitted — they MUST NOT abort the listing or propagate to the caller.

The use case SHALL NOT propagate I/O errors from optional field projection to the caller when merging repository list results.

### Requirement: SpecListEntry shape

Each entry MUST include required fields `workspace`, `path`, and `title` as returned by `SpecRepository.list()`.

The optional `summary` field MUST only be present when explicitly requested via `includeSummary` **and** successfully materialized for that spec. `SpecListEntry` MUST NOT include a `metadataStatus` field — public metadata freshness status is removed.

When workspace filtering is active, the result array contains entries only from the filtered workspaces.

### Requirement: Config-based factory delegates through resolveListSpecsDeps

The config-based `createListSpecs(config, options?)` form MUST derive `ListSpecsDeps` through `resolveListSpecsDeps(resolver)` and then delegate to canonical `createListSpecs(deps)`.

`resolveListSpecsDeps(resolver)` MUST resolve:

- `listWorkspaces: ListWorkspaces`

It MUST NOT resolve `getMetadata`, `materializeMetadata`, `hasher: ContentHasher`, or `yaml: YamlSerializer` — `ListSpecs` orchestrates workspace repositories and forwards list options; summary projection and self-healing metadata reads occur inside `SpecRepository.list()` / `FsSpecIndexCache` when `includeSummary` is requested.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT modify the repositories.
- It SHALL depend on `ListWorkspaces` for consistent project traversal.
- It MUST NOT re-resolve title with extra I/O when the repository already returned it.
- `summary` is resolved via repository/index materialization only when `includeSummary` is requested; it is never a stale optimized value.
- `ListSpecs` MUST NOT project or filter by metadata freshness status.

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:workspace`](../workspace/spec.md)
- [`core:list-workspaces`](../list-workspaces/spec.md)
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `SpecListEntry`, paginated list contract, and summary projection at list/index boundary
- [`core:fs-spec-repository`](../fs-spec-repository/spec.md) — `FsSpecIndexCache` self-healing summary materialization
- [`core:get-spec-metadata`](../get-spec-metadata/spec.md) — `if-needed` read surface used by the index materialization boundary
- [`core:composition-resolver`](../composition-resolver/spec.md)
