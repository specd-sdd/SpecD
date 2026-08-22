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

### Requirement: Bounded batched traversal execution

Upstream and downstream breadth-first traversal SHALL query each frontier through
the `GraphStore` batch symbol and relation operations. One frontier MUST NOT
issue one store request per symbol or per relation type. Newly reached symbol ids
SHALL be deduplicated before their nodes are fetched in one logical batch.

File impact, multi-file impact, change detection, and any per-symbol impact
aggregation MUST use a fixed bounded concurrency budget whose number of active
store operations does not grow with the number of input files, symbols, or
frontier width. Multi-file impact SHALL share one memoized read view and one
concurrency budget across all input files.

Batching and scheduling MUST preserve the existing traversal direction, depth,
cycle handling, deterministic ordering, affected-symbol/file sets, covering-spec
evidence, dependent counts, and risk calculation. Backpressure is an adapter
safety boundary; a valid traversal over a wide graph MUST NOT fail with
`StoreOverloadError` merely because its input contains many distinct symbols.

### Requirement: Bounded hotspot hierarchy retrieval

Hotspot computation SHALL retrieve hierarchy signals (extenders, implementors,
and overriders) through the `GraphStore` batch relation operations. One logical
`getIncomingSymbolRelations` call SHALL carry all candidate symbol ids with the
`EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relation types, and the results SHALL be
folded in memory into per-symbol extender, implementor, and overrider counts.

Hotspot computation MUST NOT issue one hierarchy query per candidate symbol. A
valid hotspot ranking over a wide graph MUST NOT fail with `StoreOverloadError`
merely because the graph contains many symbols. Score composition, scoped
filters, ranking order, and risk classification MUST remain unchanged.

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

The provider also SHALL support multi-file impact analysis via `analyzeFilesImpact(store: GraphStore, filePaths: string[], direction: 'upstream' | 'downstream' | 'both', maxDepth?: number): Promise<FileImpactResult>`. When given multiple file paths, it aggregates the individual file impact results:

- Combines the lists of affected files and symbols.
- Sums direct, indirect, and transitive dependents counts.
- Computes the overall risk level as the maximum risk level among all analyzed files.

### Requirement: Spec impact

`analyzeSpecImpact(store: GraphStore, specId: string, direction: 'upstream' | 'downstream' | 'both', maxDepth?: number): Promise<SpecImpactResult>` SHALL compute requirement-aware impact for one spec.

It MUST treat the following relation families as first-class blast-radius inputs:

- `DEPENDS_ON` for `Spec -> Spec`
- `COVERS_FILE` for `Spec -> File`
- `COVERS_SYMBOL` for `Spec -> Symbol`

In upstream/dependents mode, spec impact reports:

- specs that depend on the target spec
- files covered by the target spec and all transitively affected dependent specs
- symbols covered by the target spec and all transitively affected dependent specs

In downstream/dependencies mode, spec impact reports:

- specs the target spec depends on
- files and symbols reached through those downstream spec relationships where the traversal depth includes them

The result shape remains `SpecImpactResult` (which extends `ImpactResult`), but the affected file and affected symbol sets are allowed to originate from requirement-aware relations rather than only code-structure traversal.

### Requirement: Change detection

`detectChanges(store: GraphStore, changedFiles: string[], maxDepth?: number): Promise<ChangeDetectionResult>` SHALL identify the impact of a set of changed files on the code graph. The optional `maxDepth` parameter (default: 3) is passed through to the upstream traversal for each changed symbol. It:

1. For each changed file, finds all symbols defined in it
2. Runs upstream traversal on each symbol with the given `maxDepth`
3. Aggregates affected symbols, files, and computes the risk level and summary

### Requirement: Pure functions

All traversal operations SHALL be stateless pure functions defined in `domain/services/`. They receive a `GraphStore` instance (for reads only) and return value objects. They MUST NOT mutate the store, manage lifecycle, or hold state between calls.

### Requirement: Resolved canonical and public-binding impact

Symbol impact SHALL resolve a selector to one logical canonical target before traversal. For unqualified names, resolution SHALL prefer case-exact candidates, fall back to case-insensitive exact names only when none exist, and MUST NOT use prefix/component/textual discovery matches. A unique candidate proceeds to traversal; multiple candidates produce bounded deterministic ambiguity and no traversal. Qualified and full occurrence selectors preserve exact semantics. Public-export impact SHALL accept one public-binding identity and return two explicit views:

- consumers proven to use that exact surface and exported name, including downstream re-export chains; and
- all dependents of the canonical logical symbol through every known route.

The selected binding, canonical target, and ordered binding chain SHALL be retained. An ambiguous export MUST NOT merge unrelated candidates or select one.

Hierarchy traversal SHALL preserve edge direction and language precedence for contracts, overrides, inherited members, traits, mixins, embedding, promotion, and provable interface satisfaction. Cycles SHALL terminate and a logical symbol with multiple declaration occurrences SHALL be counted once.

Traversal ordering SHALL be deterministic across backends and SHALL use indexed lookups and bounded cycle-safe traversal.

### Requirement: File-impact covering specs

`FileImpactResult` SHALL include a deterministically ordered `coveringSpecs` collection derived from reverse `COVERS_FILE` and `COVERS_SYMBOL` relations. Each spec SHALL appear once with its minimum impact depth and every distinct evidence item `{ kind: 'file' | 'symbol', target, depth }`.

The input file and its defined symbols have depth `0`. Files and symbols reached through the selected impact direction use their shallowest traversal depth from `1` through `maxDepth`. A multi-file impact SHALL treat every input file and each of its defined symbols as depth `0`, aggregate all evidence, and preserve deterministic ordering by minimum depth, spec id, evidence depth, kind, and target.

File coverage SHALL remain independently visible when no symbol-coverage relations exist. Symbol coverage SHALL augment, not gate or replace, file coverage. Reverse coverage retrieval MUST be batched over deduplicated file and symbol sets and MUST NOT issue one store query per affected result.

Traversal remains read-only. It SHALL project the coverage present in the open graph; graph-health and freshness consumers remain responsible for reporting whether corpus-wide coverage is complete.

## Constraints

- Traversal depth defaults to 3 — callers may override via `TraversalOptions`
- Cycles are broken by tracking visited symbols — a symbol is only reported at its shallowest depth
- Risk level thresholds are fixed in this spec — they are not configurable
- All traversal functions are in `domain/services/`, not in use cases or infrastructure
- Traversal functions never mutate the store
- No dependency on `@specd/core`

## Spec Dependencies

- [`code-graph:symbol-model`](../symbol-model/spec.md) — logical symbols, public bindings, relations, and hierarchy semantics
- [`code-graph:graph-store`](../graph-store/spec.md) — backend-neutral indexed query methods
- [`code-graph:resolve-symbol-reference`](../resolve-symbol-reference/spec.md) — canonical and public-binding target selection

## ADRs

- [ADR-0025: Non-Blocking Worker-Thread SQLite Graph Store](../../../docs/adr/0025-nonblocking-worker-sqlite-graph-store.md) — bounded batched traversal and hotspot hierarchy retrieval keep wide-graph analysis within worker backpressure limits
