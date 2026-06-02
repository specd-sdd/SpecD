# Proposal: improve-code-graph-path-search

## Motivation

The code graph currently exposes several discovery and identity behaviors that are correct internally but misleading at the edges. Exact spec and symbol lookup, file and symbol selector ergonomics, and document fallback all need tighter semantics before graph search and indexing can be trusted as a stable interface.

The current project-global graph path model also risks indexing the same physical spec files twice: once as documents/files through normal discovery, and again as specs through `SpecRepository`. That ambiguity is already leaking into search results and graph namespace expectations, so it needs to be resolved before this change lands.

## Current behaviour

Today, spec and symbol search rank only by relevance, so an exact query like `core:change` does not reliably return the exact spec first. Graph commands still prefer canonical workspace-prefixed selectors even when users naturally have project-relative or absolute paths.

`graph index` previously exposed partial-workspace indexing and still discovers file/document candidates independently from spec indexing. With the current project-global graph path idea, the same physical file can end up under both a workspace namespace and `root:`, or appear once as a `DocumentNode` and again as a `SpecNode`.

The current graph config shape also does not yet separate project-global includes from global excludes clearly enough. `graph.paths` is underspecified as a public contract, there is no global `graph.excludePaths`, and effective fingerprinting does not fully capture the real discovery inputs once synthetic exclusions such as spec roots are considered.

Finally, the CLI currently owns too much project traversal glue. It manually "bridges" config, workspace traversal, and repository wiring across commands like `project status`, `specs list`, `specs search`, `graph index`, and `graph stats`, which risks drift between entry points.

## Proposed solution

Tighten the graph boundary and centralize project orchestration in the core:

- **Centralized Orchestration**: Introduce a `ListWorkspaces` use case in `core` that provides a rich, orchestrated view of workspaces and their `SpecRepository` instances. This becomes the single source of truth for all project-traversing commands.
- **Semantic Repository**: Add `count()` to `SpecRepository` for efficient size discovery and replace raw sidecar APIs with semantic operations over persisted schema/dependencies/implementation.
- **Smart Indexing**: Move spec discovery and metadata extraction into `IndexCodeGraph`. The indexer will directly consume injected `SpecRepository` instances from the orchestrated workspaces.
- **Improved UX**: Use the new `count()` method and `ListWorkspaces` orchestrator to provide accurate `N/M specs processed` progress and instant, reliable status reporting across the CLI.
- **Search Precision**: Treat exact spec-id, symbol-name, and symbol-identity queries as first-class keys that rank ahead of generic text matches.
- **Normalization**: Graph-facing APIs should accept project-relative/absolute inputs and normalize them internally. CLI output should render file paths relative to `projectRoot`.
- **Global Indexing**: Configured indexing should always be a global operation over the full project surface.
- **Discovery Ownership**: Rename project-global graph paths to `graph.includePaths`, add global `graph.excludePaths`, and make workspace discovery plus project-global discovery operate on one effective config model.
- **No Spec Duplication**: Filesystem-backed spec roots are excluded automatically from file/document discovery, so a spec artifact is indexed as a spec once, not reintroduced as a document.
- **Stable Namespaces**: Workspace-owned files stay in `workspace:` identities; project-global `root:` discovery is only for files outside all workspace `codeRoot` domains.

## Specs affected

### New specs

- `core:list-workspaces`: defines the orchestration of workspaces and repositories, providing a unified surface to discover the project structure.
  - Depends on: `core:config`, `core:workspace`, `core:spec-repository-port`
- `code-graph:document-model`: defines the document category, `root:` identities, and fallback indexing semantics.
  - Depends on: `code-graph:symbol-model`, `code-graph:graph-store`, `core:config`

### Modified specs

- `core:spec-repository-port`: replace sidecar-shaped APIs with semantic operations, a stable spec hash, and a new `count()` method for workspace size discovery.
- `cli:graph-index`: remove `--workspace`, align with always-global indexing, and leverage the new orchestration and counting for better progress reporting.
  - Depends on (added): `core:list-workspaces`
- `code-graph:indexer`: update to consume `SpecRepository` directly from workspaces, own spec discovery/extraction, and define one effective discovery model with `includePaths`, global excludes, synthetic spec-root excludes, and workspace-vs-root ownership rules.
  - Depends on (added): `core:list-workspaces`, `core:spec-repository-port`, `code-graph:document-model`
- `cli:graph-search`: update for exact-match-first ranking and document category support.
  - Depends on: `code-graph:document-model`, `code-graph:graph-store`

- `cli:graph-impact`: broaden accepted selector forms and render project-relative paths.

- `code-graph:composition`: extend provider-facing responsibilities to include selector handling.
  - Depends on (added): `code-graph:document-model`

- `code-graph:workspace-integration`: update assumptions for global indexing and clarify canonical vs user-facing identity mapping, including the rule that `root:` cannot duplicate workspace-owned files.

- `code-graph:symbol-model`: add the document category to the graph vocabulary and ensure node shapes are consistent across families.
  - Depends on (added): `code-graph:document-model`

- `code-graph:graph-store`: extend the abstract contract for document nodes and exact-match-aware search semantics.
  - Depends on (added): `code-graph:document-model`

- `code-graph:sqlite-graph-store`: update SQLite FTS and ranking to support prioritization and document storage.
- `code-graph:ladybug-graph-store`: implement document and ranking parity in the Ladybug backend.
- `core:config`: rename `graph.paths` to `graph.includePaths`, add global `graph.excludePaths`, preserve workspace graph filters, and reserve the `root` workspace name.
- `core:list-specs`: refactor to use the centralized `ListWorkspaces` orchestrator and remove redundant spec mapping logic.
  - Depends on (added): `core:list-workspaces`
- `core:search-specs`: refactor to use the centralized `ListWorkspaces` orchestrator for consistent workspace traversal during fallback search.
  - Depends on (added): `core:list-workspaces`
- `core:get-spec-context`: refactor to use `ListWorkspaces` for consistent repository resolution across workspaces.
  - Depends on (added): `core:list-workspaces`
- `core:spec-metadata`: update metadata extraction and implementation projection logic to align with the new repository semantic operations.
- `core:spec-repository-port`: the semantic repository and filesystem-backed capability remain rooted in persisted spec state and `spec-lock` semantics.
  - Depends on (preserved): `core:spec-lock`
- `cli:project-status`: refactor to use `ListWorkspaces` and `SpecRepository.count()` for instant workspace sizing and project-global status reporting.
  - Depends on: `core:list-workspaces`, with existing project listing behavior still rooted in `core:list-drafts` and `core:list-changes`
- `cli:spec-list`: refactor to use `ListWorkspaces` for consistent workspace grouping and rich property visibility.
  - Depends on (added): `core:list-workspaces`
- `cli:spec-search`: align fallback search behavior with the centralized project orchestration.
  - Depends on (added): `core:list-workspaces`
- `cli:graph-stats`: refactor fingerprint mismatch detection to use the new centralized project traversal and the effective discovery config.
  - Depends on (added): `core:list-workspaces`

## Impact

The refactor centralizes the "brain" of the project structure in `core`. The CLI becomes a thinner delivery layer, and `@specd/code-graph` becomes more self-sufficient.

Key improvements:

- **`project status`**: instantaneous counting using `count()`, no longer needs to load all spec metadata.
- **`specs list`**: consistent workspace grouping and visibility of empty or read-only workspaces.
- **`graph index`**: accurate progress bars, no partial-workspace ambiguity, and no duplicate spec-as-document indexing.
- **`graph search` / `graph stats`**: documents remain searchable, but spec artifacts and workspace-owned files no longer leak into the wrong discovery namespace.

## Technical context

### Unified Orchestration

A new use case `ListWorkspaces` in `core` will provide a unified view of the project structure.

**The Contract:**

```ts
interface ProjectWorkspace {
  readonly name: string
  readonly codeRoot: string
  readonly isExternal: boolean
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly specRepo: SpecRepository
}

class ListWorkspaces {
  execute(): Promise<ProjectWorkspace[]>
}
```

`Kernel.workspaces.list()` will expose this view. All project-traversing CLI commands will use it as their entry point.

### Semantic Repository and Counting

`SpecRepository` gains `count(): Promise<number>` for efficient size discovery and semantic methods to hide `spec-lock.json` implementation details. Filesystem-backed repositories also need an explicit way to expose their canonical `specsPath`, so code-graph can exclude those roots from file/document discovery without coupling to raw sidecar layout.

### Indexer Evolution

`IndexCodeGraph` now receives `IndexOptions` containing the rich `ProjectWorkspace` list and a separate `ProjectGraphConfig` object. It directly extracts spec semantics through the injected repositories.

**The Indexer Contract:**

```ts
interface ProjectGraphConfig {
  readonly includePaths?: readonly string[]
  readonly excludePaths?: readonly string[]
  readonly workspaces?: ReadonlyMap<
    string,
    {
      readonly allowedPaths?: readonly string[]
      readonly excludePaths?: readonly string[]
      readonly respectGitignore?: boolean
    }
  >
}

interface IndexOptions {
  readonly projectRoot: string
  readonly workspaces: readonly ProjectWorkspace[]
  readonly graphConfig: ProjectGraphConfig
  readonly onProgress?: IndexProgressCallback
}
```

The effective discovery config must be resolved once and used consistently for:

- workspace discovery
- project-global `root:` discovery
- synthetic exclusion of filesystem-backed spec roots
- fingerprint computation

The agreed ownership rule is simple:

- files under a workspace `codeRoot` belong to that workspace
- `root:` is only for project-global files outside all workspace `codeRoot` domains
- spec directories are excluded from file/document discovery and enter the graph only through spec indexing

## Open questions

None. The remaining work is specification and design detail, not product-direction uncertainty.
