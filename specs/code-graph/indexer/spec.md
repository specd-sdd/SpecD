# Indexer

## Purpose

Source files change constantly and the code graph must be kept in sync without re-parsing the entire workspace every time. The indexer orchestrates the pipeline from file discovery through parsing to graph storage, using content hashing for incremental updates and language adapters for extraction. It is the primary write path into the code graph.

## Requirements

### Requirement: IndexCodeGraph use case

`IndexCodeGraph` SHALL be the primary entry point for building and updating the code graph. It is an application-layer use case that orchestrates:

1. **Discover** — walk the workspace to find source files
2. **Diff** — compare content hashes with the store to identify new, changed, and deleted files
3. **Extract** — run the appropriate language adapter on each new/changed file
4. **Store** — upsert extracted data into the `GraphStore`
5. **Clean** — remove deleted files from the store
6. **Persist VCS ref** — if `IndexOptions.vcsRef` is provided, store it as the `lastIndexedRef` meta key after successful indexing

Extraction and storage include hierarchy relations (`EXTENDS`, `IMPLEMENTS`, `OVERRIDES`) alongside existing file, symbol, and dependency relations.

The use case accepts a `GraphStore` (already opened) and an `AdapterRegistry` via constructor injection.

### Requirement: Incremental indexing

The indexer SHALL compute a content hash for each discovered file and compare it against the hash stored in the `GraphStore`. Only three categories of files are processed:

- **New** — file exists on disk but not in the store → extract and upsert
- **Changed** — file exists in both but hashes differ → extract and upsert (replaces previous data)
- **Deleted** — file exists in the store but not on disk → remove from store. Only files belonging to workspaces being indexed are considered for deletion — files from other workspaces are left untouched. This allows `--workspace <name>` to index a single workspace without destroying data from others.

Files whose hash matches the stored hash are skipped entirely — no parsing, no I/O beyond the hash comparison.

Changed files are removed from the store before bulk load, because CSV `COPY FROM` cannot upsert — it can only insert. Removing changed files first ensures the bulk load inserts fresh data without conflicts.

To force a full re-index, callers MUST call `GraphStore.clear()` before `execute()`. This removes all stored data, causing every file to be treated as new.

### Requirement: Multi-workspace file discovery

The indexer SHALL discover files from each workspace's `codeRoot` independently. For each `WorkspaceIndexTarget`:

1. Call `discoverFiles(codeRoot, hasAdapter, options)` to get paths relative to `codeRoot`
2. Prefix each path with `{workspaceName}:` to form the globally unique `FileNode.path`
3. Diff against the store (filtered by workspace prefix)

`discoverFiles` accepts a root directory plus optional exclusion options:

- **`respectGitignore`** (default `true`): when `true`, `.gitignore` files are loaded hierarchically (git root → codeRoot → subdirectories during walk) and applied with absolute priority — no `excludePaths` pattern can re-include a file that `.gitignore` excludes. When `false`, `.gitignore` files are not loaded.
- **`excludePaths`** (default: built-in list): gitignore-syntax patterns applied as an additional exclusion layer on top of `.gitignore` (or as the sole ruleset when `respectGitignore` is `false`). Supports `!` negation. When not provided, the following built-in defaults apply: When provided, the supplied list **replaces** the built-in defaults entirely — the built-in defaults are not merged.

Evaluation order when `respectGitignore: true`:

1. `.gitignore` rules (absolute priority — cannot be overridden)
2. `excludePaths` rules (applied after; can negate each other but cannot un-ignore gitignored files)

`discoverFiles` itself has no workspace knowledge — it accepts a root directory and:

- Respects `.gitignore` rules hierarchically when `respectGitignore` is `true`
- Applies `excludePaths` patterns (or built-in defaults) as an `ignore`-library instance
- Skips symbolic links — only regular files are indexed
- Skips files with no registered language adapter (determined by extension)
- Returns root-relative file paths with forward-slash normalization

### Requirement: Two-pass extraction with in-memory index

Extraction proceeds in two passes over the files, using an in-memory `SymbolIndex` rather than store queries during analysis:

- **Pass 1 (Extract symbols, per workspace)** — For each workspace, for each file in chunks: read content, extract symbols via the language adapter, extract `ImportDeclaration` entries, and build `DEFINES` and `EXPORTS` relations. When an adapter provides `extractSymbolsWithNamespace()`, the indexer MAY use it to obtain symbols and namespace information from a single parse; otherwise it uses the adapter's separate extraction methods. Register symbols in the in-memory `SymbolIndex` (indexed by file path and by name). If the adapter provides namespace and qualified-name support, build the qualified name map for that language. No store queries are needed during extraction.
- **Pass 2 (Resolve imports + scoped bindings + CALLS + CONSTRUCTS + USES_TYPE + hierarchy, all workspaces)** — For each file across all workspaces: resolve `ImportDeclaration` entries to symbol ids using the `SymbolIndex` (not the store). All import and package resolution is delegated to the adapter: relative imports via `adapter.resolveRelativeImportPath`, package imports via `adapter.resolvePackageFromSpecifier` (using the `packageName -> workspaceName` map built from `adapter.getPackageIdentity`), and qualified names via the namespace map (built using `adapter.buildQualifiedName`). For `ImportDeclaration` entries with `isRelative: false` whose specifier is not resolved via the qualified name map, and where the adapter implements `resolveQualifiedNameToPath`, the indexer SHALL call `adapter.resolveQualifiedNameToPath(specifier, codeRoot, repoRoot)` and, if a path is returned, emit a file-to-file `IMPORTS` relation. Build the import map, collect adapter binding facts and call facts, build the scoped binding environment, and then resolve `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations for code-file analysis. Existing adapter `extractRelations()` output remains valid, but shared scoped resolution owns cross-language receiver, type-reference, constructor, and call-candidate lookup.
- **Specs (per workspace)** — For each workspace: call the `specs()` callback to get discovered specs. Assign the workspace name to each spec.
- **Store commit** — After all passes complete, call `GraphStore.bulkLoad()` once with the files, symbols, specs, and relations accumulated for the run. Concrete backends MAY use native bulk import mechanisms internally, but the indexer remains coupled only to the abstract graph-store contract.
- **Search readiness** — After bulk load, call `GraphStore.rebuildFtsIndexes()` so the active backend can bring its search indexes into a query-ready state when needed.

This two-pass approach ensures all symbols exist in the index before import, binding, call, and hierarchy resolution, while avoiding store queries during analysis.

### Requirement: Scoped binding environment resolution

During Pass 2, the indexer SHALL build a per-file scoped binding environment from adapter-provided binding facts, call facts, symbols, import declarations, resolved import maps, namespace maps, and the in-memory `SymbolIndex`.

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
- 7-50%: Pass 1 — symbol extraction (updates per file)
- 50-80%: Pass 2 — import resolution and CALLS extraction (updates per file)
- 80-83%: Spec discovery
- 83-95%: Bulk loading (updates per table and relation batch)
- 100%: Done

Progress updates include a detail string (e.g. `"150/460 files"`) for phases that process individual items.

### Requirement: Cross-workspace package resolution

Before Pass 2, the indexer builds a `packageName → workspaceName` map by calling `adapter.getPackageIdentity(codeRoot)` for each workspace. The indexer iterates over all registered adapters and the first one to return a non-`undefined` identity wins. This is language-agnostic — each adapter reads its own manifest format (`package.json`, `go.mod`, `pyproject.toml`, `composer.json`).

For non-relative import specifiers (e.g. `@specd/core`), the indexer extracts the package name from the specifier, looks it up in the `packageName → workspaceName` map, and searches the in-memory `SymbolIndex` for symbols with the imported name within the matching workspace's path prefix (`workspaceName + ':'`).

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
- **`filesSkipped`** — files skipped because their hash matched
- **`specsDiscovered`** — total spec directories found
- **`specsIndexed`** — specs that were new or changed and successfully processed
- **`errors`** — array of `{ filePath: string; message: string }` for files or specs that failed
- **`duration`** — elapsed time in milliseconds
- **`workspaces`** — per-workspace breakdown array of `{ name, filesDiscovered, filesIndexed, filesSkipped, filesRemoved, specsDiscovered, specsIndexed }`
- **`vcsRef`** — the VCS ref that was persisted, or `null` if none was provided

### Requirement: Spec dependency indexing

The indexer SHALL build `SpecNode` entries with `DEPENDS_ON` relations. Specs are resolved via the workspace's `specs()` callback (backed by `SpecRepository`), NOT by reading the filesystem directly. For each spec provided by the repository:

1. Load metadata via `SpecRepository.metadata()` — extract `title`, `description`, and `dependsOn`
2. If metadata is absent (`null`), use defaults: `title` = specId, `description` = `''`, `dependsOn` = `[]`. There is no fallback parsing of `spec.md` — metadata should be regenerated via `spec generate-metadata` before indexing.
3. Compute a `contentHash` (SHA-256 of all artifacts in `spec.filenames`) — this includes `spec.md`, `verify.md`, and any other spec artifacts
4. Create a `SpecNode` and upsert it into the store
5. Create a `DEPENDS_ON` relation for each entry in `dependsOn`

Metadata changes alone do NOT trigger re-indexing — only changes to spec content artifacts (`spec.md`, `verify.md`, etc.) affect the `contentHash`. Metadata freshness is tracked independently by `@specd/core`.

Spec discovery follows the same incremental model as source files: the `contentHash` is compared against the stored hash, and only specs with changed hashes are re-processed. Unchanged specs are skipped entirely.

Spec indexing runs as an additional phase after source file indexing (Phase 1 and Phase 2). It does not depend on source file data and could run in parallel, but sequencing after source indexing simplifies the implementation.

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
const store = new LadybugGraphStore({ storagePath: '/project' })
await store.open()

const registry = new AdapterRegistry()
const indexer = new IndexCodeGraph(store, registry)

const result = await indexer.execute({
  workspaces: [
    { name: 'core', codeRoot: '/project/packages/core', specs: async () => [...] },
    { name: 'cli', codeRoot: '/project/packages/cli', specs: async () => [...] },
  ],
  projectRoot: '/project',
})
// result: {
//   filesDiscovered: 150,
//   filesIndexed: 12,
//   filesRemoved: 2,
//   filesSkipped: 136,
//   specsDiscovered: 20,
//   specsIndexed: 5,
//   errors: [],
//   duration: 340,
//   workspaces: [
//     { name: 'core', filesDiscovered: 100, filesIndexed: 8, filesSkipped: 90, filesRemoved: 2, specsDiscovered: 15, specsIndexed: 3 },
//     { name: 'cli', filesDiscovered: 50, filesIndexed: 4, filesSkipped: 46, filesRemoved: 0, specsDiscovered: 5, specsIndexed: 2 },
//   ],
// }

await store.close()
```

## Spec Dependencies

- [`code-graph:code-graph/graph-store`](../graph-store/spec.md) — abstract graph-store contract used by the indexer
- [`code-graph:code-graph/language-adapter`](../language-adapter/spec.md) — adapter extraction and resolution capabilities
- [`code-graph:code-graph/symbol-model`](../symbol-model/spec.md) — files, symbols, specs, relations, and result types
- [`code-graph:code-graph/workspace-integration`](../workspace-integration/spec.md) — workspace-prefixed path and spec identity rules
- [`core:core/config`](../../core/config/spec.md) — graph discovery config and config-derived graph/temp directories
