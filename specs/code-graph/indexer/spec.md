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

1. Call `discoverFiles(codeRoot, hasAdapter)` to get paths relative to `codeRoot`
2. Prefix each path with `{workspaceName}/` to form the globally unique `FileNode.path`
3. Diff against the store (filtered by workspace prefix)

`discoverFiles` itself has no workspace knowledge — it accepts a root directory and:

- Respects `.gitignore` rules hierarchically (finds git root by walking up from root)
- Excludes the following directories regardless of `.gitignore`: `node_modules`, `.git`, `.specd`, `dist`, `build`, `coverage`, `.next`, `.nuxt`
- Skips symbolic links — only regular files are indexed
- Skips files with no registered language adapter (determined by extension)
- Returns root-relative file paths with forward-slash normalization

### Requirement: Single-pass extraction with in-memory index

Extraction proceeds in two passes over the files, using an in-memory `SymbolIndex` instead of store queries:

- **Pass 1 (Extract symbols, per workspace)** — For each workspace, for each file in chunks: read content, extract symbols via the language adapter, extract `ImportDeclaration` entries, build `DEFINES` and `EXPORTS` relations. Accumulate all `FileNode`, `SymbolNode`, and relations in memory arrays. Register symbols in the in-memory `SymbolIndex` (indexed by file path and by name). If the adapter implements `extractNamespace` and `buildQualifiedName`, build a qualified name map for that language. No store queries are needed. The `SymbolIndex` holds symbols from ALL workspaces before Pass 2 begins.
- **Pass 2 (Resolve imports + CALLS, all workspaces)** — For each file across all workspaces: resolve `ImportDeclaration` entries to symbol ids using the `SymbolIndex` (not the store). All resolution is delegated to the adapter: relative imports via `adapter.resolveRelativeImportPath`, package imports via `adapter.resolvePackageFromSpecifier` (using the `packageName → workspaceName` map built from `adapter.getPackageIdentity`), and qualified names via the namespace map (built using `adapter.buildQualifiedName`). Build the import map and call `extractRelations` with it to get `IMPORTS` and `CALLS` relations. Accumulate all relations.
- **Specs (per workspace)** — For each workspace: call the `specs()` callback to get discovered specs. Assign the workspace name to each spec.
- **Bulk load** — After all passes complete, call `GraphStore.bulkLoad()` once with all accumulated files, symbols, specs, and relations. This uses CSV `COPY FROM` internally for speed.
- **Rebuild FTS indexes** — After bulk load, call `GraphStore.rebuildFtsIndexes()` to drop and recreate full-text search indexes. This is required because LadybugDB FTS indexes are not automatically updated on insert.

This two-pass approach ensures all symbols exist in the index before import/call resolution, while avoiding any store queries during extraction.

### Requirement: Chunked processing

Files are grouped into chunks where each chunk's total source size does not exceed a configurable byte budget (default: 20 MB). Each chunk is processed sequentially — file content strings from completed chunks are eligible for garbage collection, bounding peak memory usage.

The chunk budget is configurable via `IndexOptions.chunkBytes`.

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

For non-relative import specifiers (e.g. `@specd/core`), the indexer extracts the package name from the specifier, looks it up in the `packageName → workspaceName` map, and searches the in-memory `SymbolIndex` for symbols with the imported name within the matching workspace's path prefix (`workspaceName + '/'`).

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

### Requirement: Spec dependency indexing

The indexer SHALL build `SpecNode` entries with `DEPENDS_ON` relations. Specs are resolved via the workspace's `specs()` callback (backed by `SpecRepository`), NOT by reading the filesystem directly. For each spec provided by the repository:

1. Read `.specd-metadata.yaml` via `SpecRepository.artifact()` — extract `title`, `description`, and `dependsOn`
2. If no `.specd-metadata.yaml` exists, use defaults: `title` = specId, `description` = `''`, `dependsOn` = `[]`. There is no fallback parsing of `spec.md` — metadata should be regenerated via `spec generate-metadata` before indexing.
3. Compute a `contentHash` (SHA-256 of all artifacts EXCEPT `.specd-metadata.yaml`) — this includes `spec.md`, `verify.md`, and any other spec artifacts
4. Create a `SpecNode` and upsert it into the store
5. Create a `DEPENDS_ON` relation for each entry in `dependsOn`

Metadata changes alone do NOT trigger re-indexing — only changes to spec content artifacts (`spec.md`, `verify.md`, etc.) affect the `contentHash`. Metadata freshness is tracked independently by `@specd/core`.

Spec discovery follows the same incremental model as source files: the `contentHash` is compared against the stored hash, and only specs with changed hashes are re-processed. Unchanged specs are skipped entirely.

Spec indexing runs as an additional phase after source file indexing (Phase 1 and Phase 2). It does not depend on source file data and could run in parallel, but sequencing after source indexing simplifies the implementation.

## Constraints

- The `GraphStore` must be opened before calling the use case — the indexer does not manage store lifecycle
- Discovery always uses forward-slash-normalized workspace-relative paths
- Hardcoded exclusion directories cannot be overridden (they are always excluded)
- Pass 2 depends on Pass 1 completing for all files — they are not interleaved per file
- Per-file errors are collected, not thrown — only infrastructure errors abort the run
- Spec indexing uses the workspace's `specs()` callback exclusively — no filesystem fallback
- Pass 2 depends on Pass 1 completing for ALL workspaces — they are not interleaved per workspace

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

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `FileNode`, `SymbolNode`, `Relation`
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore` port, upsert/remove operations
- [`specs/code-graph/language-adapter/spec.md`](../language-adapter/spec.md) — `LanguageAdapter`, `AdapterRegistry`
