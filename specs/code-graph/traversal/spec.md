# Traversal

## Purpose

Once a code graph is built, developers need to answer questions like "what breaks if I change this function?" and "what does this function depend on?" Traversal operations walk the graph to compute blast radius, find callers and callees at arbitrary depth, and assess the risk of proposed changes. These are pure, stateless functions that read from the graph store — the query side of the code graph.

## Requirements

### Requirement: Upstream traversal

`getUpstream(store: GraphStore, symbolId: string, options?: TraversalOptions): Promise<TraversalResult>` SHALL return all callers of the given symbol, transitively up to `maxDepth` (default: 3). Results MUST be grouped by depth level:

- **Depth 1** — direct callers (symbols that call the target)
- **Depth 2** — callers of the direct callers
- **Depth N** — callers at N steps removed

The traversal follows `CALLS` relations in reverse (target → source). Cycles are detected and broken — a symbol already visited at a shallower depth is not revisited.

### Requirement: Downstream traversal

`getDownstream(store: GraphStore, symbolId: string, options?: TraversalOptions): Promise<TraversalResult>` SHALL return all callees of the given symbol, transitively up to `maxDepth` (default: 3). Results are grouped by depth level following `CALLS` relations forward (source → target). Cycle detection applies as with upstream.

### Requirement: TraversalOptions and TraversalResult

`TraversalOptions` is a value object with:

- **`maxDepth`** (`number`, default: 3) — maximum traversal depth
- **`includeFiles`** (`boolean`, default: true) — whether to include `IMPORTS` relations in addition to `CALLS`

`TraversalResult` is a value object with:

- **`root`** (`string`) — the starting symbol id
- **`levels`** — `Map<number, SymbolNode[]>` — symbols grouped by depth (1-indexed)
- **`totalCount`** — total number of unique symbols found across all levels
- **`truncated`** (`boolean`) — true if traversal hit `maxDepth` and there are potentially more results

### Requirement: Impact analysis

`analyzeImpact(store: GraphStore, target: string, direction: 'upstream' | 'downstream' | 'both'): Promise<ImpactResult>` SHALL compute the blast radius of modifying the target symbol. It runs traversal in the specified direction and produces:

- **`target`** — the symbol being analyzed
- **`directDependents`** — count of depth-1 results (WILL BREAK)
- **`indirectDependents`** — count of depth-2 results (LIKELY AFFECTED)
- **`transitiveDependents`** — count of depth-3+ results (MAY NEED TESTING)
- **`riskLevel`** — computed from dependent counts: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`
- **`affectedFiles`** — unique file paths containing any affected symbol
- **`affectedProcesses`** — execution flows that include the target or any affected symbol (when process data is available)

Risk level thresholds:

| Level      | Condition                                                |
| ---------- | -------------------------------------------------------- |
| `LOW`      | 0–2 direct dependents, no indirect                       |
| `MEDIUM`   | 3–5 direct dependents, or any indirect                   |
| `HIGH`     | 6+ direct dependents, or 10+ total dependents            |
| `CRITICAL` | 20+ total dependents, or target is in 3+ execution flows |

### Requirement: File impact

`analyzeFileImpact(store: GraphStore, filePath: string, direction: 'upstream' | 'downstream' | 'both'): Promise<FileImpactResult>` SHALL compute aggregate impact for all symbols defined in the given file. It:

1. Retrieves all symbols in the file via `findSymbols({ filePath })`
2. Runs `analyzeImpact` for each symbol
3. Merges results: deduplicates affected symbols, takes the maximum risk level, unions affected files

`FileImpactResult` extends `ImpactResult` with:

- **`symbols`** — array of per-symbol `ImpactResult` entries
- **`riskLevel`** — the maximum risk level across all symbols in the file

### Requirement: Change detection

`detectChanges(store: GraphStore, changedFiles: string[]): Promise<ChangeDetectionResult>` SHALL identify the impact of a set of changed files on the code graph. It:

1. For each changed file, finds all symbols defined in it
2. Runs upstream traversal on each symbol
3. Aggregates affected symbols, files, and execution flows
4. Computes an overall risk level

`ChangeDetectionResult` contains:

- **`changedFiles`** — the input file paths
- **`changedSymbols`** — symbols defined in the changed files
- **`affectedSymbols`** — symbols affected by the changes (upstream dependents)
- **`affectedFiles`** — files containing affected symbols
- **`riskLevel`** — maximum risk level across all changed symbols
- **`summary`** — human-readable summary string

### Requirement: Pure functions

All traversal operations SHALL be stateless pure functions defined in `domain/services/`. They receive a `GraphStore` instance (for reads only) and return value objects. They MUST NOT mutate the store, manage lifecycle, or hold state between calls.

## Constraints

- Traversal depth defaults to 3 — callers may override via `TraversalOptions`
- Cycles are broken by tracking visited symbols — a symbol is only reported at its shallowest depth
- Risk level thresholds are fixed in this spec — they are not configurable
- All traversal functions are in `domain/services/`, not in use cases or infrastructure
- Traversal functions never mutate the store
- No dependency on `@specd/core`

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `SymbolNode`, `Relation`, `RelationType`
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore` query methods
