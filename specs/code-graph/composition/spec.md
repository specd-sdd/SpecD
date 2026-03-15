# Composition

## Purpose

Consumers of `@specd/code-graph` should not need to know how the store, indexer, adapters, and traversal functions are wired together. The composition layer provides a single facade and factory function that assembles all internal components, manages lifecycle, and defines the package's public API surface.

## Requirements

### Requirement: CodeGraphProvider facade

`CodeGraphProvider` SHALL be the top-level API object that wraps all code graph functionality. It exposes:

- **Indexing**: `index(options: IndexOptions): Promise<IndexResult>` — runs `IndexCodeGraph`
- **Querying**: `getSymbol(id)`, `findSymbols(query)`, `getFile(path)`, `getSpec(specId)`, `getSpecDependencies(specId)`, `getSpecDependents(specId)`, `getStatistics()` — delegates to `GraphStore`
- **Maintenance**: `clear(): Promise<void>` — removes all data from the store (for full re-index)
- **Traversal**: `getUpstream(symbolId, options?)`, `getDownstream(symbolId, options?)` — delegates to traversal functions
- **Impact**: `analyzeImpact(target, direction)`, `analyzeFileImpact(filePath, direction)`, `detectChanges(changedFiles)` — delegates to impact functions
- **Lifecycle**: `open(): Promise<void>`, `close(): Promise<void>` — manages the store connection

`CodeGraphProvider` is a thin orchestration layer — it holds no domain logic. All methods delegate to the appropriate domain service or use case.

### Requirement: Factory function

`createCodeGraphProvider(options: CodeGraphOptions): CodeGraphProvider` SHALL be the sole construction path for `CodeGraphProvider`. It accepts:

- **`storagePath`** (`string`, required) — workspace root path, used to locate the `.specd/code-graph.lbug` file
- **`adapters`** (`LanguageAdapter[]`, optional) — additional language adapters to register beyond the 4 built-in adapters (TypeScript, Python, Go, PHP)

The factory constructs all internal components:

1. Creates `LadybugGraphStore` with the storage path
2. Creates `AdapterRegistry` and registers the built-in adapters (TypeScript, Python, Go, PHP) plus any additional adapters
3. Creates `IndexCodeGraph` with the store and registry
4. Returns a `CodeGraphProvider` wired to all components

Callers MUST NOT construct `CodeGraphProvider` directly — the constructor is not part of the public API.

### Requirement: Package exports

The `@specd/code-graph` package SHALL export only:

- `createCodeGraphProvider` — factory function
- `CodeGraphProvider` — type only (for type annotations, not construction)
- `CodeGraphOptions` — options type for the factory
- `IndexOptions`, `IndexResult` — indexer types. `IndexOptions` includes `workspacePath` (required), `onProgress` (optional `(percent: number, phase: string) => void` callback), and `chunkBytes` (optional chunk size budget, default 20 MB).
- `TraversalOptions`, `TraversalResult`, `ImpactResult`, `FileImpactResult`, `ChangeDetectionResult` — traversal/impact types
- `FileNode`, `SymbolNode`, `SpecNode`, `Relation`, `SymbolKind`, `RelationType` — model types
- `SymbolQuery`, `GraphStatistics` — query types
- `LanguageAdapter` — interface for custom adapters
- `CodeGraphError` and subclasses — error types

Internal components (`LadybugGraphStore`, `AdapterRegistry`, `TypeScriptLanguageAdapter`, `IndexCodeGraph`, traversal functions) MUST NOT be exported from the package entry point.

### Requirement: Lifecycle management

Callers MUST call `open()` before using any query, traversal, or indexing method, and `close()` when done. The `CodeGraphProvider` delegates these calls to the underlying `GraphStore`. Methods called before `open()` or after `close()` throw `StoreNotOpenError`.

The provider does not auto-open or auto-close — callers manage the lifecycle explicitly. This follows the same pattern as database connections and avoids hidden state transitions.

### Requirement: No dependency on @specd/core

`@specd/code-graph` SHALL have zero workspace dependencies. It does not import from `@specd/core`, `@specd/cli`, or any other `@specd/*` package. All types, errors, and utilities are self-contained. Integration with specd happens at the CLI and MCP layers, which depend on both `@specd/core` and `@specd/code-graph`.

## Constraints

- `createCodeGraphProvider` is the only construction path — `CodeGraphProvider` constructor is not exported
- Internal components are not re-exported from the package
- The `LanguageAdapter` interface is exported so consumers can write custom adapters
- `CodeGraphProvider` holds no domain logic — it only delegates
- Lifecycle is explicit — no auto-open, no auto-close
- Zero workspace dependencies — standalone package

## Examples

```typescript
import { createCodeGraphProvider, SymbolKind, type LanguageAdapter } from '@specd/code-graph'

// Basic usage
const provider = createCodeGraphProvider({ storagePath: '/my/project' })
await provider.open()

// Index the workspace
const result = await provider.index({ workspacePath: '/my/project' })
console.log(`Indexed ${result.filesIndexed} files in ${result.duration}ms`)

// Query symbols
const symbols = await provider.findSymbols({ kind: SymbolKind.Function, name: 'create*' })

// Impact analysis
const impact = await provider.analyzeImpact(symbols[0].id, 'upstream')
console.log(`Risk: ${impact.riskLevel}, ${impact.directDependents} direct dependents`)

// Full-text search in symbol comments
const hashSymbols = await provider.findSymbols({ comment: 'content hash' })

// Change detection
const changes = await provider.detectChanges(['src/auth.ts', 'src/user.ts'])
console.log(changes.summary)

// Force full re-index (clear + index)
await provider.clear()
const freshResult = await provider.index({ workspacePath: '/my/project' })

await provider.close()
```

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — model types exported from package
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore`, `LadybugGraphStore` (internal wiring)
- [`specs/code-graph/language-adapter/spec.md`](../language-adapter/spec.md) — `LanguageAdapter` (exported), `AdapterRegistry` (internal)
- [`specs/code-graph/indexer/spec.md`](../indexer/spec.md) — `IndexCodeGraph` (internal), `IndexResult` (exported)
- [`specs/code-graph/traversal/spec.md`](../traversal/spec.md) — traversal/impact types (exported), functions (internal)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — composition layer pattern
