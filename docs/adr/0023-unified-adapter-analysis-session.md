# ADR 0023: Unified Adapter Analysis Session

## Status

Proposed

## Context

Prior to this optimization, the code-graph indexing process was fragmented. The `LanguageAdapter` interface and the indexing pipeline required multiple separate passes that repeatedly read file contents or re-parsed Abstract Syntax Trees (ASTs). For instance, Pass 1 (symbol extraction) and Pass 2 (relation building/import resolution) operated in isolation, leading to redundant tree-sitter parsing and high memory/CPU overhead, particularly for large codebases or mixed-language projects with complex import graphs.

Furthermore, there was no shared state or cache across language adapters during a single indexing run. This resulted in O(N^2) bottlenecks when resolving import specifiers and building dependency relations, as symbol lookups had to traverse file lists or perform repetitive scans.

## Decision

We introduce a unified architecture centered on a shared runtime session and a single-pass full-file analysis:

1. **`IndexSession` (`InMemoryIndexSession`)**: A shared in-memory registry active during a single indexing execution. It tracks registered files, file analyses, resolved symbols, relations, and adapter-specific cache states. It enables O(1) lookups by file, simple name, and qualified name.
2. **Unified `LanguageAdapter`**: The adapter contract is consolidated around three sequential phases:
   - `analyzeFile`: Executes the parser once per file to extract a compact `FileAnalysisDraft` containing symbols, imports, and adapter-specific syntactic structures.
   - `resolveImports`: Resolves import specifiers against the populated session using resolved paths or names.
   - `buildRelations`: Emits code-graph relations (e.g., CALLS, DEFINES, EXPORTS) from the resolved imports and the session's lookups.
3. **`FileAnalysis`**: A compact, serializable record of file-level facts extracted during `analyzeFile`. All heavy tree-sitter AST nodes and parser resources are discarded immediately after Pass 1 to enforce bounded memory usage, retaining only the structured facts needed for Pass 2.

## Consequences

- **Performance Improvement**: Re-parsing and re-reading of source files is eliminated, reducing indexing time significantly (especially for import-heavy PHP and TypeScript files).
- **Memory Optimization**: Parser-specific runtime objects are dropped immediately after analysis, preventing memory leaks and keeping the indexing footprint bounded.
- **Improved Type Safety and Separation**: Adapters no longer access raw filesystem APIs or manage internal caches; they communicate solely via the well-defined `IndexSession` and `FileAnalysis` models.
- **Determinism**: Scoped binding and call resolution are fed entirely from stable, pre-extracted facts, ensuring identical graph results with a fraction of the compute overhead.
