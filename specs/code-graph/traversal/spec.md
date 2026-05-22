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

`analyzeImpact(store: GraphStore, target: string, direction: 'upstream' | 'downstream' | 'both', maxDepth?: number): Promise<ImpactResult>` SHALL compute the blast radius of modifying the target symbol. The optional `maxDepth` parameter (default: 3) controls how deep the traversal goes — it is passed through to `getUpstream`/`getDownstream` and limits the IMPORTS BFS loop.

The function produces an `ImpactResult` containing:

- **`target`** — the symbol being analyzed
- **`directDependents`** — count of depth-1 results (WILL BREAK)
- **`indirectDependents`** — count of depth-2 results (LIKELY AFFECTED)
- **`transitiveDependents`** — count of depth-3+ results (MAY NEED TESTING)
- **`riskLevel`** — computed from dependent counts: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`
- **`affectedFiles`** — unique file paths containing any affected symbol
- **`affectedSymbols`** — array of `AffectedSymbol` entries with depth information
- **`affectedProcesses`** — execution flows that include the target or any affected symbol (when process data is available)

`AffectedSymbol` SHALL contain:

- **`id`** (`string`) — the symbol identifier
- **`name`** (`string`) — the symbol's declared name
- **`filePath`** (`string`) — workspace-prefixed file path
- **`line`** (`number`) — 1-based line number
- **`depth`** (`number`) — distance from the target: 1 = direct dependent, 2 = indirect, 3+ = transitive

Impact analysis MUST include hierarchy relations in addition to existing call/import reachability:

- changing a type symbol MUST affect symbols connected through `EXTENDS` and `IMPLEMENTS` according to traversal direction
- changing a method symbol MUST affect symbols connected through `OVERRIDES` according to traversal direction
- hierarchy-derived affected symbols participate in depth counts, risk calculation, and affected-file aggregation the same way as other affected symbols
- requirement-aware symbol coverage relations (`COVERS_SYMBOL`) MAY also contribute affected specs when the caller requests requirement-aware impact views through higher-level traversal entry points

Risk level thresholds:

| Level      | Condition                                                |
| ---------- | -------------------------------------------------------- |
| `LOW`      | 0–2 direct dependents, no indirect                       |
| `MEDIUM`   | 3–5 direct dependents, or any indirect                   |
| `HIGH`     | 6+ direct dependents, or 10+ total dependents            |
| `CRITICAL` | 20+ total dependents, or target is in 3+ execution flows |

### Requirement: Static type dependency impact

Impact traversal SHALL treat all persisted symbol dependency relations as first-class blast-radius inputs, not only ordinary call edges.

Specifically:

- changing a symbol MUST affect symbols connected through `CALLS`, `CONSTRUCTS`, and `USES_TYPE` according to traversal direction
- changing a type symbol MUST affect symbols connected through `EXTENDS` and `IMPLEMENTS` according to traversal direction
- changing a method symbol MUST affect symbols connected through `OVERRIDES` according to traversal direction
- hierarchy-derived and static-type-derived affected symbols participate in depth counts, risk calculation, and affected-file aggregation the same way as call-derived affected symbols

This requirement applies to symbol impact and any file-impact operation that aggregates symbol impact results.

### Requirement: File impact

`analyzeFileImpact(store: GraphStore, filePath: string, direction: 'upstream' | 'downstream' | 'both', maxDepth?: number): Promise<FileImpactResult>` SHALL compute aggregate impact for all symbols defined in the given file. The optional `maxDepth` parameter (default: 3) is passed through to each per-symbol `analyzeImpact` call and limits the file-level IMPORTS BFS.

It:

1. Retrieves all symbols in the file via `findSymbols({ filePath })`
2. Runs `analyzeImpact` for each symbol with the given `maxDepth`
3. Merges results: deduplicates affected symbols (keeping the shallowest depth), takes the maximum risk level, unions affected files

`FileImpactResult` extends `ImpactResult` with:

- **`symbols`** — array of per-symbol `ImpactResult` entries
- **`riskLevel`** — the maximum risk level across all symbols in the file

When symbols in the file participate in `EXTENDS`, `IMPLEMENTS`, or `OVERRIDES`, their hierarchy-derived impact MUST be reflected in the aggregate result.

### Requirement: Spec impact

`analyzeSpecImpact(store: GraphStore, specId: string, direction: 'upstream' | 'downstream' | 'both', maxDepth?: number): Promise<ImpactResult>` SHALL compute requirement-aware impact for one spec.

It MUST treat the following relation families as first-class blast-radius inputs:

- `DEPENDS_ON` for `Spec -> Spec`
- `COVERS_FILE` for `Spec -> File`
- `COVERS_SYMBOL` for `Spec -> Symbol`

In upstream/dependents mode, spec impact reports:

- specs that depend on the target spec
- files covered by the target spec
- symbols covered by the target spec

In downstream/dependencies mode, spec impact reports:

- specs the target spec depends on
- files and symbols reached through those downstream spec relationships where the traversal depth includes them

The result shape remains `ImpactResult`, but the affected file and affected symbol sets are allowed to originate from requirement-aware relations rather than only code-structure traversal.

### Requirement: Change detection

`detectChanges(store: GraphStore, changedFiles: string[], maxDepth?: number): Promise<ChangeDetectionResult>` SHALL identify the impact of a set of changed files on the code graph. The optional `maxDepth` parameter (default: 3) is passed through to the upstream traversal for each changed symbol. It:

1. For each changed file, finds all symbols defined in it
2. Runs upstream traversal on each symbol with the given `maxDepth`
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

- [`code-graph:symbol-model`](../symbol-model/spec.md) — `SymbolNode`, `Relation`, `RelationType`, hierarchy relations
- [`code-graph:graph-store`](../graph-store/spec.md) — `GraphStore` query methods
