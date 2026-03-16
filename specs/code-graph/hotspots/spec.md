# Hotspots

## Purpose

Identify which symbols in the code graph have the highest impact — the most callers, importers, and cross-workspace dependents. This allows agents and users to focus review, testing, and spec coverage on the code that would cause the most breakage if changed.

## Requirements

### Requirement: Batch hotspot scoring

`computeHotspots(store: GraphStore, options?: HotspotOptions): Promise<HotspotResult>` SHALL compute a hotspot score for every symbol in the graph using exactly two batch queries:

1. **Caller query** — returns one row per (symbol, caller) pair with both the symbol's `filePath` and the caller's `filePath`
2. **Importer count query** — returns the number of files that import each file

The score formula is:

```
score = (sameWorkspaceCallers * 3) + (crossWorkspaceCallers * 5) + fileImporters
```

Where:

- **sameWorkspaceCallers** — callers whose filePath shares the same workspace prefix as the symbol
- **crossWorkspaceCallers** — callers whose filePath has a different workspace prefix (weighted higher because cross-workspace calls are implicit contracts with wider blast radius)
- **fileImporters** — number of files that IMPORT the file containing this symbol

Workspace is extracted as the first path segment of filePath (everything before the first `/`).

### Requirement: Risk level

Each entry's `riskLevel` SHALL be computed using the existing `computeRiskLevel(directCallers, totalCallers + fileImporters, 0)` where `directCallers` = `sameWorkspaceCallers + crossWorkspaceCallers` and the second argument is the total callers plus file importers.

### Requirement: Smart defaults with override

By default the command applies these filters:

- **score > 0** — symbols with no callers and no importers are excluded
- **risk >= MEDIUM** — LOW-risk symbols are filtered out
- **limit 20** — only the top 20 results are returned

These defaults can be removed entirely with the `--all` flag, or overridden individually:

- `--min-score 0` overrides the score > 0 default
- `--min-risk LOW` overrides the risk >= MEDIUM default
- `--limit N` overrides the 20 result limit

### Requirement: Filtering

`HotspotOptions` supports these optional filters:

- **workspace** — only include symbols whose filePath starts with this workspace prefix
- **kind** — only include symbols of this SymbolKind
- **filePath** — only include symbols in this file
- **limit** — maximum results to return (default 20)
- **minScore** — minimum score threshold (default 1, i.e. > 0)
- **minRisk** — minimum risk level threshold (default MEDIUM)

### Requirement: Output

`HotspotResult` contains:

- **entries** — array of `HotspotEntry`, sorted by score descending
- **totalSymbols** — total number of symbols in the graph (before filtering)

Each `HotspotEntry` contains:

- **symbol** — the `SymbolNode`
- **score** — the computed hotspot score
- **directCallers** — same-workspace caller count
- **crossWorkspaceCallers** — cross-workspace caller count
- **fileImporters** — file importer count
- **riskLevel** — the computed risk level

### Requirement: Pure function

`computeHotspots` SHALL be a stateless pure function in `domain/services/`. It receives a `GraphStore` for reads only and returns value objects. It MUST NOT mutate the store.

## Constraints

- Exactly 2 graph queries — no N+1 per-symbol queries
- Score formula weights are fixed: same-ws = 3, cross-ws = 5, importers = 1
- Risk level thresholds reuse the existing `computeRiskLevel` function
- Workspace is the first path segment of filePath
- No spec coverage logic — deferred to issue 19

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — `SymbolNode`, `SymbolKind`
- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore` query methods
- [`specs/code-graph/traversal/spec.md`](../traversal/spec.md) — `computeRiskLevel`, `RiskLevel`
