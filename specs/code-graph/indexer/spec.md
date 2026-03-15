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
- **Deleted** — file exists in the store but not on disk → remove from store

Files whose hash matches the stored hash are skipped entirely — no parsing, no I/O beyond the hash comparison.

Changed files are removed from the store before bulk load, because CSV `COPY FROM` cannot upsert — it can only insert. Removing changed files first ensures the bulk load inserts fresh data without conflicts.

To force a full re-index, callers MUST call `GraphStore.clear()` before `execute()`. This removes all stored data, causing every file to be treated as new.

### Requirement: File discovery

The indexer SHALL walk the workspace directory recursively to discover source files. It MUST:

- Respect `.gitignore` rules (using the same algorithm as git)
- Exclude the following directories regardless of `.gitignore`: `node_modules`, `.git`, `.specd`, `dist`, `build`, `coverage`, `.next`, `.nuxt`
- Skip symbolic links — only regular files are indexed
- Skip files with no registered language adapter (determined by extension)

The discovery phase produces a list of workspace-relative file paths with forward-slash normalization.

### Requirement: Single-pass extraction with in-memory index

Extraction proceeds in two passes over the files, using an in-memory `SymbolIndex` instead of store queries:

- **Pass 1 (Extract symbols)** — For each file in chunks: read content, extract symbols via the language adapter, extract `ImportDeclaration` entries, build `DEFINES` and `EXPORTS` relations. Accumulate all `FileNode`, `SymbolNode`, and relations in memory arrays. Register symbols in the in-memory `SymbolIndex` (indexed by file path and by name). For PHP files with namespace declarations, build a qualified name map. No store queries are needed.
- **Pass 2 (Resolve imports + CALLS)** — For each file: resolve `ImportDeclaration` entries to symbol ids using the `SymbolIndex` (not the store). For relative imports, find the target file's symbols by path. For monorepo package imports, find by name within the package prefix. For PHP qualified names, match against the namespace map. Build the import map and call `extractRelations` with it to get `IMPORTS` and `CALLS` relations. Accumulate all relations.
- **Bulk load** — After both passes complete, call `GraphStore.bulkLoad()` once with all accumulated files, symbols, specs, and relations. This uses CSV `COPY FROM` internally for speed.

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

### Requirement: Monorepo package resolution

When the workspace root contains a `pnpm-workspace.yaml` file, the indexer discovers all monorepo packages by parsing the `packages` globs and reading each `package.json` name field. For non-relative import specifiers (e.g. `@specd/core`), the indexer checks this map and searches the in-memory `SymbolIndex` for symbols with the imported name within the matching package's file path prefix.

The monorepo package map is computed lazily (once per indexing run).

### Requirement: Error isolation

Errors during extraction or storage for a single file MUST NOT abort the entire indexing run. The indexer SHALL:

- Catch errors per file
- Record the file path and error message in the index result
- Continue processing remaining files
- Include the error count and details in the final result

Only infrastructure-level errors (e.g. store connection lost, disk full) may abort the entire run.

### Requirement: Index result

`IndexCodeGraph` SHALL return an `IndexResult` value object containing:

- **`filesDiscovered`** — total files found during discovery
- **`filesIndexed`** — files that were new or changed and successfully processed
- **`filesRemoved`** — files removed from the store (deleted from disk)
- **`filesSkipped`** — files skipped because their hash matched
- **`specsDiscovered`** — total spec directories found
- **`specsIndexed`** — specs that were new or changed and successfully processed
- **`errors`** — array of `{ filePath: string; message: string }` for files or specs that failed
- **`duration`** — elapsed time in milliseconds

### Requirement: Spec dependency indexing

The indexer SHALL discover spec directories under `specs/` and build `SpecNode` entries with `DEPENDS_ON` relations. For each spec directory found:

1. Read `.specd-metadata.yaml` if it exists — extract `dependsOn` as the primary source
2. If no `.specd-metadata.yaml` exists, parse the `## Spec Dependencies` section in `spec.md` — extract linked spec paths and convert them to spec IDs
3. Extract the spec title from the `# Title` heading in `spec.md`
4. Compute a `contentHash` (SHA-256 of `spec.md` + `.specd-metadata.yaml` content) and include it in the `SpecNode`
5. Create a `SpecNode` and upsert it into the store
6. Create a `DEPENDS_ON` relation for each entry in `dependsOn`

Spec discovery follows the same incremental model as source files: the `contentHash` is compared against the stored hash, and only specs with changed hashes are re-processed. Unchanged specs are skipped entirely.

Spec indexing runs as an additional phase after source file indexing (Phase 1 and Phase 2). It does not depend on source file data and could run in parallel, but sequencing after source indexing simplifies the implementation.

## Constraints

- The `GraphStore` must be opened before calling the use case — the indexer does not manage store lifecycle
- Discovery always uses forward-slash-normalized workspace-relative paths
- Hardcoded exclusion directories cannot be overridden (they are always excluded)
- Pass 2 depends on Pass 1 completing for all files — they are not interleaved per file
- Per-file errors are collected, not thrown — only infrastructure errors abort the run
- Spec indexing uses `.specd-metadata.yaml` as the primary source for `dependsOn`; falls back to parsing `spec.md` links
- No dependency on `@specd/core`

## Examples

```typescript
const store = new LadybugGraphStore({ storagePath: '/project' })
await store.open()

const registry = new AdapterRegistry() // TypeScript adapter registered by default
const indexer = new IndexCodeGraph(store, registry)

const result = await indexer.execute({ workspacePath: '/project' })
// result: {
//   filesDiscovered: 150,
//   filesIndexed: 12,
//   filesRemoved: 2,
//   filesSkipped: 136,
//   errors: [{ filePath: 'src/broken.ts', message: 'Parse error at line 42' }],
//   duration: 340,
// }

await store.close()
```

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `FileNode`, `SymbolNode`, `Relation`
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore` port, upsert/remove operations
- [`specs/code-graph/language-adapter/spec.md`](../language-adapter/spec.md) — `LanguageAdapter`, `AdapterRegistry`
