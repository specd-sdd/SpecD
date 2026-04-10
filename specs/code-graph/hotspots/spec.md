# Hotspots

## Purpose

Identify which symbols in the code graph have the highest impact — the most callers, importers, and cross-workspace dependents. This allows agents and users to focus review, testing, and spec coverage on the code that would cause the most breakage if changed.

## Requirements

### Requirement: Batch hotspot scoring

`computeHotspots(store: GraphStore, options?: HotspotOptions): Promise<HotspotResult>` SHALL compute a hotspot score for every symbol in the graph using batch graph queries rather than per-symbol lookups.

The scoring model uses four signal families:

- **sameWorkspaceCallers** — callers whose `filePath` shares the same workspace prefix as the symbol
- **crossWorkspaceCallers** — callers whose `filePath` has a different workspace prefix
- **fileImporters** — number of files that import the file containing the symbol
- **hierarchy dependents** — persisted hierarchy relations that make the symbol structurally central, including inheritors, implementors, and overriding methods

Workspace is extracted from `filePath` as the prefix before the first `:` (e.g. `core` from `core:src/index.ts`).

The exact numeric weighting of these signals is intentionally not fixed by this spec. It is defined by the implementation design and may be tuned without further spec churn, provided these observable semantics hold:

- symbol-level caller evidence is the primary ranking signal
- cross-workspace caller evidence contributes at least as strongly as same-workspace caller evidence
- file-level importer data is a secondary signal that refines symbol ranking rather than replacing symbol-level evidence
- hierarchy-derived structural centrality contributes to ranking when the symbol is a base type, a widely implemented contract, or a method with overriding dependents

### Requirement: Risk level

Each entry's `riskLevel` SHALL be computed using the existing `computeRiskLevel(directCallers, totalCallers + fileImporters, 0)` where `directCallers` = `sameWorkspaceCallers + crossWorkspaceCallers` and the second argument is the total callers plus file importers.

### Requirement: Smart defaults with automatic removal

Hotspot computation applies product defaults per option:

- **kinds = \[`class`, `method`, `function`, `interface`]** — the default hotspot view focuses on callable or structural symbols
- **score > 0** — symbols with no caller signal, importer signal, or hierarchy signal are excluded
- **risk >= MEDIUM** — LOW-risk symbols are filtered out
- **limit 20** — only the top 20 results are returned
- **no importer-only entries** — a symbol with zero direct callers MUST NOT appear in the default result solely because its containing file has many importers

Explicit options override only their own defaults:

- omitted `kinds` → use the default hotspot kinds
- explicit `kinds` → fully replace the default kind set; do not merge with it
- omitted `minRisk` → use `MEDIUM`
- explicit `minRisk` → use only the requested risk threshold
- omitted `limit` → use `20`
- explicit `limit` → use only the requested limit
- omitted `workspace`, `filePath`, `excludePaths`, `excludeWorkspaces` → no extra filter
- explicit `workspace`, `filePath`, `excludePaths`, `excludeWorkspaces` → add only the requested scope restriction

Importer-only exclusion remains active unless the user explicitly widens the result set with `includeImporterOnly = true`.

In other words, changing `minRisk`, `limit`, or `workspace` MUST NOT silently remove the default kind set or re-enable importer-only symbols.

Examples:

- `specd graph hotspots` → defaults apply (kinds = `class,method,function,interface`, no importer-only entries, risk >= MEDIUM, limit 20)
- `specd graph hotspots --min-risk HIGH` → risk >= HIGH, while default kinds, importer-only exclusion, and limit 20 remain active
- `specd graph hotspots --limit 50` → limit 50, while default kinds, importer-only exclusion, and risk >= MEDIUM remain active
- `specd graph hotspots --kind interface` → only `interface` symbols, with the rest of the default ranking policy still active
- `specd graph hotspots --include-importer-only --kind interface` → explicit broad query; importer-only `interface` symbols may appear

### Requirement: Filtering

`HotspotOptions` supports these optional filters:

- **workspace** — only include symbols whose `filePath` starts with this workspace prefix
- **kinds** — only include symbols whose kind is in the provided `SymbolKind[]`
- **filePath** — only include symbols in this file
- **excludePaths** — array of glob patterns to exclude by file path (supports `*` wildcards, case-insensitive). Uses `matchesExclude` from `domain/services/matches-exclude.ts`
- **excludeWorkspaces** — array of workspace names to exclude. Uses `matchesExclude` from `domain/services/matches-exclude.ts`
- **limit** — maximum results to return (default 20)
- **minScore** — minimum score threshold (default 1, i.e. > 0)
- **minRisk** — minimum risk level threshold (default MEDIUM)
- **includeImporterOnly** — include symbols with zero direct callers whose score comes only from file importer counts (default false)

Excludes are applied alongside the existing include filters before the limit is applied.

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
- Exact numeric weights are not fixed by this spec; design and implementation may tune them
- File-level importer counts are a secondary ranking signal, not a standalone default inclusion path
- Risk level thresholds reuse the existing `computeRiskLevel` function
- Workspace is the prefix before the first `:` in `filePath`
- No spec coverage logic — deferred to issue 19

## Spec Dependencies

- [`code-graph:code-graph/symbol-model`](../symbol-model/spec.md) — `SymbolNode`, `SymbolKind`, hierarchy relations
- [`code-graph:code-graph/graph-store`](../graph-store/spec.md) — `GraphStore` query methods
- [`code-graph:code-graph/traversal`](../traversal/spec.md) — `computeRiskLevel`, `RiskLevel`, hierarchy-aware impact semantics
