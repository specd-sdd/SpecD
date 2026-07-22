# List Specs

## Purpose

Agents and CLI users need a single query to discover what specs exist across all workspaces without loading full spec content. The `ListSpecs` use case enumerates all specs across all configured workspaces, returning a title for each entry and optionally a short summary and metadata freshness status. It supports optional workspace filtering so callers can restrict results to one or more named workspaces. It is the primary query for discovery UIs and CLI listing commands.

## Requirements

### Requirement: Enumerate specs across all workspaces

`ListSpecs.execute(options?)` SHALL obtain the orchestrated project structure via the `ListWorkspaces` use case (or the corresponding kernel capability). It SHALL iterate through the resulting `ProjectWorkspace` entities and call `SpecRepository.list(options)` on each workspace's `specRepo`.

It MUST forward the same `ListOptions`, `includeSummary`, and `includeMetadataStatus` to every workspace repository call. It MUST NOT re-sort, re-filter, or re-paginate per-workspace results after the repository returns.

The merged result MUST preserve workspace declaration order from `ListWorkspaces`, with each workspace's items in the repository's canonical path order. Cross-workspace pagination is out of scope for v1 — callers paginate within a single workspace via the port or filter workspaces explicitly.

Workspace filtering SHALL be performed by matching workspace names against the orchestrated list before invoking `list()`.

### Requirement: Always resolve a title for each entry

Every returned `SpecListEntry` MUST include a `title` field supplied by `SpecRepository.list()`. The use case MUST NOT perform additional metadata or file reads to resolve titles when the repository already returned them.

### Requirement: Optional summary resolution

When `options.includeSummary` is `true`, the use case MUST forward the flag to `SpecRepository.list()` and project `summary` onto merged results only when the repository included it in the cached entry.

The use case MUST NOT re-resolve summary via `SpecRepository.metadata()`, `spec.md` reads, or `extractSpecSummary` when the repository already returned a summary for that entry.

When `includeSummary` is `false` or omitted, `summary` MUST NOT appear on any entry.

### Requirement: Optional metadata freshness status

When `options.includeMetadataStatus` is `true`, the use case MUST forward the flag to `SpecRepository.list()` and project `metadataStatus` only when the repository included it in the cached entry.

The use case MUST NOT re-compute metadata freshness via `SpecRepository.metadata()`, content hashing, or schema validation when the repository already returned `metadataStatus`.

When `includeMetadataStatus` is `false` or omitted, `metadataStatus` MUST NOT appear on any entry.

### Requirement: Silent error handling for metadata and summary reads

Per-spec title/summary/status resolution errors are handled at index materialization time in `FsSpecIndexCache`. `ListSpecs` MUST NOT perform supplementary I/O that could throw for individual specs.

The use case SHALL NOT propagate I/O errors from optional field projection to the caller when merging repository list results.

### Requirement: SpecListEntry shape

Each entry MUST include required fields `workspace`, `path`, and `title` as returned by `SpecRepository.list()`.

Optional fields (`summary`, `metadataStatus`) MUST only be present when explicitly requested via include flags **and** projected from the repository result.

When workspace filtering is active, the result array contains entries only from the filtered workspaces.

### Requirement: Config-based factory delegates through resolveListSpecsDeps

The config-based `createListSpecs(config, options?)` form MUST derive `ListSpecsDeps` through `resolveListSpecsDeps(resolver)` and then delegate to canonical `createListSpecs(deps)`.

`resolveListSpecsDeps(resolver)` MUST resolve:

- `listWorkspaces: ListWorkspaces`

It MUST NOT resolve `hasher: ContentHasher` or `yaml: YamlSerializer` — `ListSpecs` orchestrates workspace repositories and forwards list options; title/summary/metadata-status enrichment happens inside `SpecRepository.list()`'s index materialization, not in this use case, so it has no dependency on content hashing or YAML serialization.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT modify the repositories.
- It SHALL depend on `ListWorkspaces` for consistent project traversal.
- It MUST NOT re-resolve title, summary, or metadata status with extra I/O when the repository already returned those fields.
- Include flags are forwarded to repositories for projection-only filtering of cached payloads.

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:workspace`](../workspace/spec.md)
- [`core:list-workspaces`](../list-workspaces/spec.md)
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `SpecListEntry` and paginated list contract
- [`core:composition-resolver`](../composition-resolver/spec.md)
