# Indexer

## Purpose

Source files change constantly and the code graph must be kept in sync without re-parsing the entire workspace every time. The indexer orchestrates the pipeline from file discovery through parsing to graph storage, using content hashing for incremental updates and language adapters for extraction. It is the primary write path into the code graph.

## Requirements

### Requirement: IndexCodeGraph use case

`IndexCodeGraph` SHALL be the primary entry point for building and updating the code graph. It is an application-layer use case that orchestrates:

1. **Discover** — walk the workspace roots AND project-global graph paths to find source files and documents
2. **Diff** — compare content hashes (or spec hashes) with the store to identify new, changed, and deleted resources
3. **Extract** — run the appropriate language adapter on code files, or index textual content as documents
4. **Spec Indexing** — consume `SpecRepository` from each workspace to extract metadata, dependencies, and coverage links
5. **Store** — upsert extracted data and relations into the `GraphStore`
6. **Clean** — remove deleted resources from the store
7. **Persist VCS ref** — store `lastIndexedRef` after success

Extraction and storage include hierarchy relations (`EXTENDS`, `IMPLEMENTS`, `OVERRIDES`) alongside existing file, symbol, and dependency relations.

The indexer SHALL directly consume `SpecRepository` methods (`list`, `metadata`, `artifact`, `readPersistedImplementation`, `specHash`) to build `SpecNode` and coverage relations. It MUST NOT parse raw sidecar files.

### Requirement: Incremental indexing

The indexer SHALL compute a content hash for each discovered file and compare it against the hash stored in the `GraphStore`. It SHALL also compare the persisted graph fingerprint against the current fingerprint for the indexing run.

The current graph fingerprint for this iteration SHALL be computed from:

- the effective `@specd/code-graph` package version loaded by the running process
- a canonical hash of the resolved workspace objects used for indexing

Only three categories of files are processed during a normal incremental run when the graph fingerprint matches:

- **New** — file exists on disk but not in the store → extract and upsert
- **Changed** — file exists in both but hashes differ → extract and upsert (replaces previous data)
- **Deleted** — file exists in the store but not on disk → remove from store. Only files belonging to workspaces being indexed are considered for deletion — files from other workspaces are left untouched. This allows `--workspace <name>` to index a single workspace without destroying data from others.

Files whose hash matches the stored hash are skipped entirely — no parsing, no I/O beyond the hash comparison — only when the persisted graph fingerprint also matches the current fingerprint.

When the persisted graph fingerprint differs from the current fingerprint, the indexer SHALL treat the run as a full rebuild of the active graph store rather than a normal incremental skip. The preferred behavior is to recreate the store and re-index every discovered file while surfacing a visible explanation that the code-graph version or resolved workspace configuration changed. If a backend cannot safely recreate in-place, the caller MAY fail fast and require an explicit force-reindex command instead.

Changed files are removed from the store before bulk load, because CSV `COPY FROM` cannot upsert — it can only insert. Removing changed files first ensures the bulk load inserts fresh data without conflicts.

To force a full re-index, callers MUST invoke the graph-store recreation path before `execute()`. This removes all stored data, causing every file to be treated as new.

### Requirement: Discovery fingerprint uses effective config

The graph fingerprint for an indexing run SHALL be computed from the effective discovery configuration actually used by the indexer, not only from the raw config declared in `specd.yaml`.

The effective fingerprint inputs MUST include:

- project-global `graph.includePaths`
- global `graph.excludePaths`
- each workspace's `allowedPaths`
- each workspace's `excludePaths`
- each workspace's `respectGitignore`
- any synthetic exclusions derived from filesystem-backed repository `specsPath` roots

### Requirement: Multi-workspace file discovery

The indexer SHALL discover files from two sources:

**1. Workspace Discovery**
For each `ProjectWorkspace` provided in options:

- Resolve one effective exclusion set composed of global `graph.excludePaths`, repository-derived spec-root exclusions, and the workspace's `excludePaths`
- Call `discoverFiles` on `codeRoot`, filtered by the workspace's `allowedPaths` (if configured)
- Prefix each path with `{workspaceName}:`
- Diff against the store filtered by workspace prefix

**2. Project-Global Discovery**

- Call `discoverFiles` on the project root using patterns from `graphConfig.includePaths`
- Prefix each path with `root:` to form the globally unique identity
- Resources discovered here are treated as project-global documents or scripts only when they are outside every configured workspace `codeRoot`

Files matching a language adapter become `FileNode`. Files without an adapter but with textual content become `DocumentNode` under the same identity format.

When a workspace repository exposes a filesystem-backed `specsPath`, the indexer SHALL derive a synthetic exclusion for that root and apply it to file/document discovery. Spec artifacts MUST be indexed through spec indexing only, not as files or documents.

Textual fallback SHALL decode document content using this policy:

- Detect and accept BOM-marked `utf-8`, `utf-16le`, and `utf-16be`
- Otherwise try `utf-8`
- Otherwise accept `utf-16le` or `utf-16be` when the byte pattern matches UTF-16 null-byte layout
- Otherwise accept `windows-1252` only when the file does not contain NUL bytes
- Otherwise skip the file as non-textual

`discoverFiles` accepts a root directory plus exclusion options:

- **`respectGitignore`** (default `true`): when `true`, `.gitignore` files are loaded hierarchically and applied with absolute priority.
- **`excludePaths`** (default: built-in list): gitignore-syntax patterns applied as an additional exclusion layer. Built-in default excludes MUST include `.git/`, `.hg/`, and `.svn/`.
- **`vcsRoot`** (`string | null`): the root directory of the VCS repository, resolved upstream from `VcsAdapter.rootDir()` and used to bound hierarchical `.gitignore` searches. Callers MUST pass `null` explicitly when no repository root exists. `discoverFiles` MUST NOT probe for repository markers on its own.

### Requirement: Binary file filtering

The indexer's discovery process SHALL filter out known binary and non-source file extensions by default (e.g., `.gif`, `.png`, `.jpg`, `.jpeg`, `.pdf`, `.sql`, `.zip`, `.tiff`, `.pack`). This prevents the engine from attempting to parse large binary payloads as text or document nodes, which causes CPU saturation and out-of-memory errors during hashing and extraction. This global binary filter runs before any document decoding heuristics are applied.

### Requirement: Bounded analysis memory

The indexer SHALL reduce repeated allocation pressure by reusing shared session lookups across passes and by storing compact per-file analysis results instead of re-deriving imports, bindings, and relations from raw content multiple times.

The indexer MUST NOT retain parser ASTs, parse trees, or equivalent heavyweight parser objects across the full run. Pass 1 MAY allocate such structures transiently while analyzing an individual file, but the retained run-scoped state MUST be limited to compact normalized facts and common indexes that Pass 2 requires.

### Requirement: Two-pass extraction with in-memory index

Extraction proceeds in two passes over the discovered files, using a shared in-memory `IndexSession` rather than repeated adapter extraction or graph-store lookups during analysis:

- **Pass 1 (Analyze files, per workspace)** — For each workspace, for each file in chunks: read content, derive a complete `FileAnalysis` through the language adapter, register the file analysis in the shared `IndexSession`, and emit `DEFINES` and `EXPORTS` relations from the registered symbols. The session owns common in-memory lookups for files, symbols, qualified names, and parser-emitted facts. No store queries are needed during extraction.
- **Pass 2 (Resolve imports + scoped bindings + relations, all workspaces)** — For each analyzed file, resolve imports and cross-file targets from the facts stored in the `IndexSession`, then derive `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, hierarchy, and other deterministic relations from the stored facts without re-parsing the file. Shared scoped resolution owns cross-language receiver, type-reference, constructor, and call-candidate lookup against the session indexes.
- **Specs (per workspace)** — For each workspace: iterate through specs provided by the `SpecRepository`.
- **Store commit** — After all passes complete, call `GraphStore.bulkLoad()` once.
- **Search readiness** — After bulk load, call `GraphStore.rebuildFtsIndexes()`.

This two-pass approach ensures all symbols exist in the shared session before import, binding, call, and hierarchy resolution, while avoiding store queries and repeated file analysis during indexing.

### Requirement: Shared indexing session

The indexer SHALL maintain a run-scoped in-memory `IndexSession` for the full indexing operation.

The `IndexSession` MUST provide shared lookup and deduplication facilities for:

- registered files and their stable run-local numeric IDs
- registered file analyses keyed by file ID and workspace-prefixed file path
- registered symbols keyed by file, name, and qualified name
- registered documents, specs, and deterministic cross-entity lookups such as file-to-symbol and spec-to-symbol
- deterministic parser-emitted facts required by Pass 2 relation building
- deduplicated relations accumulated before the final store commit

The `IndexSession` MUST expose a common API for all built-in adapters and indexer phases. Adapters MAY store compact run-scoped adapter cache state through that API, but they MUST NOT bypass the session with direct access to raw internal maps.

The `IndexSession` SHALL remain an in-memory indexing primitive only. It MUST NOT change persisted graph-store schemas, persisted graph IDs, or final graph relation semantics.

### Requirement: Scoped binding environment resolution

During Pass 2, the indexer SHALL build a per-file scoped binding environment from adapter-provided binding facts, call facts, symbols, import declarations, resolved import maps, namespace maps, and the shared `IndexSession` lookups.

The scoped binding environment builder SHALL be shared code-graph logic, not adapter-local full environment logic. It SHALL provide deterministic lookup for:

- source location to enclosing scope
- lexical shadowing
- local, parameter, property/field, class-managed, inherited, file/global, framework-managed, and imported type bindings
- receiver identities such as `this`, `self`, `cls`, `parent`, `super`, and language equivalents when represented by adapter facts
- free call, member call, static call, and constructor call candidates

The indexer SHALL use the environment to resolve `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` only when the target can be selected deterministically. It MUST NOT query the store during analysis and MUST NOT add language-specific resolution rules to `IndexCodeGraph`.

The indexer SHALL drop any resolved symbol-to-symbol dependency relation whose source symbol id equals its target symbol id before staging relations for persistence.

Unresolved or ambiguous binding facts SHALL NOT create persisted relations. The indexer MAY retain non-persisted diagnostics for tests, debugging, or result reporting if doing so does not change the graph-store contract.

### Requirement: Chunked processing

Files are grouped into chunks where each chunk's total source size does not exceed a configurable byte budget (default: 20 MB). Each chunk is processed sequentially so that content and intermediate extraction state from completed chunks are eligible for garbage collection, bounding peak memory usage.

The chunk budget is configurable via `IndexOptions.chunkBytes`.

Implementations MAY spill intermediate indexing artifacts to disk instead of retaining the full run in memory. When they do:

- staged artifacts MUST live under the graph temporary directory derived from project configuration
- staged artifacts MUST be scoped to the current indexing run
- staged artifacts MUST be cleaned up after successful completion
- staged artifacts SHOULD be cleaned up after failure when the process remains alive long enough to do so

### Requirement: Progress reporting

`IndexOptions` accepts an optional `onProgress` callback `(percent: number, phase: string) => void`. The indexer reports granular progress:

- 0-5%: File discovery and content hashing
- 5-7%: Diff computation and cleanup of deleted/changed files
- 7-50%: Pass 1 — file analysis and symbol registration (updates per file)
- 50-80%: Pass 2 — import resolution and relation building from stored facts (updates per file)
- 80-83%: Spec discovery
- 83-95%: Bulk loading (updates per table and relation batch)
- 100%: Done

Progress updates include a detail string (e.g. `"150/460 files"`) for phases that process individual items.

The indexer SHALL ensure progress callbacks are fired immediately when a phase finishes, before starting the next synchronous or heavy CPU-bound internal processing (such as session index finalization or relation aggregation), so the user interface does not display stale phase labels.

### Requirement: Phase execution timing logging

The indexer SHALL log the execution time of each major internal phase (e.g., File Discovery, Pass 1, Pass 2, Spec Indexing, Bulk Load) at the `debug` level to facilitate performance diagnostics and bottleneck detection without blocking or polluting standard output.

### Requirement: Cross-workspace package resolution

Before Pass 2, the indexer builds a `packageName → workspaceName` map by calling `adapter.getPackageIdentity(codeRoot)` for each workspace. The indexer iterates over all registered adapters and the first one to return a non-`undefined` identity wins. This is language-agnostic — each adapter reads its own manifest format (`package.json`, `go.mod`, `pyproject.toml`, `composer.json`).

For non-relative import specifiers (e.g. `@specd/core`), the indexer extracts the package name from the specifier, looks it up in the `packageName → workspaceName` map, and searches the shared `IndexSession` lookups for symbols with the imported name within the matching workspace scope.

This works for both monorepo (workspaces in the same repo) and multirepo (workspaces in separate repos configured in `specd.yaml`) because the resolution depends only on the adapter reading each workspace's manifest — not on `pnpm-workspace.yaml` or any monorepo-specific tooling.

### Requirement: Error isolation

Errors during extraction or storage for a single file MUST NOT abort the entire indexing run. The indexer SHALL:

- Catch errors per file
- Record the file path and error message in the index result
- Continue processing remaining files
- Include the error count and details in the final result

Only infrastructure-level errors (e.g. store connection lost, disk full) may abort the entire run.

### Requirement: Index result

`IndexCodeGraph` SHALL return an `IndexResult` value object containing:

- **`filesDiscovered`** — total files found during discovery (across all workspaces)
- **`filesIndexed`** — files that were new or changed and successfully processed
- **`filesRemoved`** — files removed from the store (deleted from disk)
- **`filesSkipped`** — files skipped because their hash matched and the graph fingerprint was still valid
- **`specsDiscovered`** — total spec directories found
- **`specsIndexed`** — specs that were new or changed and successfully processed
- **`errors`** — array of `{ filePath: string; message: string }` for files or specs that failed
- **`duration`** — elapsed time in milliseconds
- **`workspaces`** — per-workspace breakdown array of `{ name, filesDiscovered, filesIndexed, filesSkipped, filesRemoved, specsDiscovered, specsIndexed }`
- **`vcsRef`** — the VCS ref that was persisted, or `null` if none was provided
- **`graphFingerprint`** — the fingerprint persisted for the completed run
- **`fullRebuildReason`** — `null` for a normal incremental run, or a human-readable reason when the run escalated to a full rebuild because the stored fingerprint no longer matched

### Requirement: Spec dependency indexing

The indexer SHALL build `SpecNode` entries and relations by directly consuming the `SpecRepository` instance from each workspace:

1. Use `repo.count()` to discover the total spec volume upfront for accurate progress reporting
2. Use `repo.list()` to enumerate spec identities
3. For each spec, check `repo.specHash()` against the store to enable incremental skipping
4. Load `title` and `description` via `repo.metadata()`
5. Load `COVERS_FILE` and `COVERS_SYMBOL` relations via `repo.readPersistedImplementation()`
6. Load `DEPENDS_ON` relations via `repo.readPersistedDependsOn()`

The indexer SHALL NOT rely on the CLI to pre-extract spec data. It owns the semantic mapping from repository data to graph nodes.

Spec indexing runs as an additional phase after source file indexing.

### Requirement: Prefer LLM-optimized description

When indexing specs into the code graph, the indexer SHALL prefer `optimizedDescription` (if it exists and is not empty) over the standard `description` for BM25 full-text indexing and display metadata.

## Constraints

- The `GraphStore` must be opened before calling the use case — the indexer does not manage store lifecycle
- Discovery always uses forward-slash-normalized workspace-relative paths
- When `excludePaths` is not provided, built-in default patterns apply (node_modules/, .git/, .specd/, dist/, build/, coverage/, .next/, .nuxt/)
- When `excludePaths` is provided, it replaces built-in defaults entirely — no merging occurs
- When `respectGitignore` is `true`, `.gitignore` exclusions have absolute priority and cannot be overridden by `excludePaths` patterns
- Pass 2 depends on Pass 1 completing for all files — they are not interleaved per file
- Per-file errors are collected, not thrown — only infrastructure errors abort the run
- Spec indexing uses the workspace's `specs()` callback exclusively — no filesystem fallback
- Pass 2 depends on Pass 1 completing for ALL workspaces — they are not interleaved per workspace
- The scoped binding environment builder MUST use only in-memory pass data and adapter-provided facts; it MUST NOT query the graph store during analysis
- `IndexCodeGraph` MUST NOT contain language-specific binding or call-resolution rules
- Unresolved scoped binding facts MUST NOT produce persisted graph relations
- Resolved self-relations where the source symbol id equals the target symbol id MUST NOT be persisted

## Examples

```typescript
const store = new SQLiteGraphStore({ storagePath: '/project' })
await store.open()

const registry = new AdapterRegistry()
const indexer = new IndexCodeGraph(store, registry)

// Workspaces are typically obtained via ListWorkspaces use case
const result = await indexer.execute({
  workspaces: orchestratedWorkspaces,
  graphConfig: { includePaths: ['docs/**'] },
  projectRoot: '/project',
})

await store.close()
```

## Spec Dependencies

- [`code-graph:graph-store`](../graph-store/spec.md) — abstract graph-store contract used by the indexer
- [`code-graph:language-adapter`](../language-adapter/spec.md) — adapter extraction and resolution capabilities
- [`code-graph:symbol-model`](../symbol-model/spec.md) — files, symbols, specs, relations, and result types
- [`code-graph:workspace-integration`](../workspace-integration/spec.md) — workspace-prefixed path and spec identity rules
- [`core:config`](../../core/config/spec.md) — graph discovery config and config-derived graph/temp directories
- [`core:spec-repository-port`](../../core/spec-repository-port/spec.md) — semantic spec repository contract consumed during spec indexing
- [`core:list-workspaces`](../../core/list-workspaces/spec.md) — orchestrated workspace and repository source for indexing
- [`code-graph:document-model`](../document-model/spec.md) — document-node identity and textual fallback semantics
