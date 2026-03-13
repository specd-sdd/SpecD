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

### Requirement: File discovery

The indexer SHALL walk the workspace directory recursively to discover source files. It MUST:

- Respect `.gitignore` rules (using the same algorithm as git)
- Exclude the following directories regardless of `.gitignore`: `node_modules`, `.git`, `.specd`, `dist`, `build`, `coverage`, `.next`, `.nuxt`
- Skip symbolic links — only regular files are indexed
- Skip files with no registered language adapter (determined by extension)

The discovery phase produces a list of workspace-relative file paths with forward-slash normalization.

### Requirement: Phased extraction

Extraction SHALL proceed in two phases to ensure symbols exist before resolving cross-references:

- **Phase 1** — For each file: extract symbols via the language adapter, create `DEFINES` and `EXPORTS` relations, and upsert the `FileNode` with its symbols and file-level relations into the store.
- **Phase 2** — For each file: extract `IMPORTS` and `CALLS` relations using the import map built from Phase 1 data, and update the file's relations in the store.

This two-phase approach ensures that all symbol definitions are available in the store before call resolution attempts to reference them.

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
4. Create a `SpecNode` and upsert it into the store
5. Create a `DEPENDS_ON` relation for each entry in `dependsOn`

Spec discovery follows the same incremental model as source files: content hashes are computed from `spec.md` + `.specd-metadata.yaml` combined, and only changed specs are re-processed.

Spec indexing runs as an additional phase after source file indexing (Phase 1 and Phase 2). It does not depend on source file data and could run in parallel, but sequencing after source indexing simplifies the implementation.

## Constraints

- The `GraphStore` must be opened before calling the use case — the indexer does not manage store lifecycle
- Discovery always uses forward-slash-normalized workspace-relative paths
- Hardcoded exclusion directories cannot be overridden (they are always excluded)
- Phase 2 depends on Phase 1 completing for all files — they are not interleaved per file
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
