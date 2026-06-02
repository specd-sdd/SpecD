# Document Model

## Purpose

The code graph traditionally focuses on parser-recognized source code and symbol semantics, but a complete project includes valuable textual information in non-code files such as documentation (ADRs, guides), configuration, and scripts. The `DocumentModel` defines the `DocumentNode` family, providing a way to represent and search textual project resources that do not map to symbols. It also introduces the reserved `root:` namespace for resources that exist outside of workspace code roots, ensuring every project resource has a stable, searchable graph identity.

## Requirements

### Requirement: DocumentNode properties

A `DocumentNode` SHALL represent a textual non-code project resource. It MUST include the following properties:

- `path` — the unique identifier for the node (e.g., `core:docs/adr/0001.md` or `root:package.json`)
- `configRelativePath` — the path relative to the project root used for UI rendering
- `contentHash` — SHA-256 hash of the content used for incremental indexing
- `content` — the raw textual content used for full-text search
- `workspace` — the owning workspace name, or `root` for project-global documents

### Requirement: Reserved root namespace

The graph SHALL support a reserved `root:` prefix for its node identities. This namespace MUST be used for files discovered via project-global `graph.includePaths` that are not owned by a specific workspace. Identities in this namespace SHALL take the form `root:<project-relative-path>`.

### Requirement: Textual classification fallback

During indexing, a file that does not match any registered language adapter SHALL be classified as a `DocumentNode` if its content is determined to be textual. Files detected as binary SHALL be skipped and MUST NOT produce a node in the graph.

Filesystem-backed spec directories exposed by a repository `specsPath` capability MUST be excluded from file/document discovery. Spec artifacts enter the graph through spec indexing only; they MUST NOT also become `DocumentNode` entries.

### Requirement: Search category

The document category SHALL be a first-class citizen in the graph search API. It MUST be possible to filter search results specifically to include or exclude `DocumentNode` results.

## Constraints

- A `DocumentNode` SHALL NOT produce symbol nodes or structural relations (like `CALLS` or `DEPENDS_ON` code) by default.
- The `path` of a `DocumentNode` MUST NOT collide with any `FileNode` path in the same workspace.
- `root` is a reserved workspace name for the graph and cannot be used by normal spec workspaces.
- A file already owned by a workspace `codeRoot` MUST NOT also be indexed as a `root:` document.

## Spec Dependencies

- [`code-graph:symbol-model`](../symbol-model/spec.md) — defines the base graph node vocabulary
- [`code-graph:graph-store`](../graph-store/spec.md) — defines how nodes are persisted and searched
- [`core:config`](../../core/config/spec.md) — defines the project and workspace graph path configuration
