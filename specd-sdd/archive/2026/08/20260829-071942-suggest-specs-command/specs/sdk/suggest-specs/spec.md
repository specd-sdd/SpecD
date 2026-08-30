# sdk:suggest-specs

## Purpose

Adopting Spec-Driven Development in brownfield or evolving codebases requires an automated, deterministic mechanism to discover candidate specifications and detect specification gaps. `SuggestSpecs` is an application use case in `@specd/sdk` that analyzes codebase structure via `@specd/code-graph`, groups source files into cohesive architectural capabilities, audits existing specifications against AST implementation evidence through repository ports, and deduces minimal DAG inter-spec dependencies with transitive reduction.

## Requirements

### Requirement: Use Case Interface

`SuggestSpecs` SHALL be an application use case class in `@specd/sdk` exposing an asynchronous `execute` method:

```typescript
export interface SuggestSpecsInput {
  readonly startDir?: string
  readonly workspaceFilter?: string | string[]
  readonly ignoreCurrentSpecs?: boolean
  readonly minConfidence?: number
  readonly limit?: number
  readonly rebuildCache?: boolean
  readonly onProgress?: (event: SuggestSpecsProgressEvent) => void
}

export interface CandidateSpec {
  readonly id: string
  readonly title: string
  readonly workspace: string
  readonly category: SpecCategory
  readonly priority: 'P0 (Critical)' | 'P1 (High)' | 'P2 (Medium)'
  readonly confidence: number
  readonly confidenceBreakdown: ConfidenceBreakdown
  readonly rationale: SpecRationale
  readonly primaryFiles: readonly string[]
  readonly testFiles: readonly string[]
  readonly anchorSymbols: readonly AnchorSymbol[]
  readonly hotspots: readonly HotspotSummary[]
  readonly dependsOnSpecs: readonly string[]
  readonly isExistingSpecCovered?: boolean | undefined
}

export interface SuggestSpecsResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string | undefined
  readonly codeGraphStale?: boolean
  readonly summary: SuggestSpecsSummary
  readonly suggestedSpecs: readonly CandidateSpec[]
}

export class SuggestSpecs {
  constructor(private readonly deps: SuggestSpecsDeps) {}
  async execute(input?: SuggestSpecsInput): Promise<SuggestSpecsResult>
}
```

### Requirement: Input Validation & Dynamic Workspace Resolution

1. The use case SHALL validate that `minConfidence` (when provided) is a numeric float between `0.0` and `1.0`.
2. The use case SHALL validate that `limit` (when provided) is a positive integer $\ge 1$.
3. When `workspaceFilter` is specified (as a single string, array of strings, or comma-separated list), the use case SHALL verify that each workspace exists in `deps.specRepositories` and throw `WorkspaceNotFoundError` if any workspace is not found.
4. When `workspaceFilter` is provided, analysis metrics (`files`, `symbols`, `coverage %`, and `workspaces`) SHALL be scoped strictly to the selected workspace(s).

### Requirement: Code Graph Freshness Diagnostics

1. Prior to executing heavy analysis, the use case SHALL probe the freshness and health of the code graph provider via `provider.getGraphHealth()`.
2. If the graph is stale, the use case SHALL emit a `stale-warning` progress event via `onProgress` immediately at the start of execution.
3. The use case SHALL populate `codeGraphStale: boolean` in `SuggestSpecsResult` indicating whether the underlying graph is stale.

### Requirement: Existing Spec Audit & Symbol-Level Coverage Map

1. When `ignoreCurrentSpecs` is `false` (default mode), the use case SHALL inspect all existing specifications strictly through `deps.specRepositories` ports (never direct raw disk access).
2. The use case SHALL execute a warm-up phase leveraging `SuggestImplementationLinks` and `implementationCache` to prime candidate implementation links for all existing specifications across workspaces.
3. The use case SHALL only integrate cached implementation suggestions that possess `HIGH` confidence.
4. For each existing spec, the use case SHALL load all its artifacts (`spec.artifacts`) in canonical order (`spec.md` first, then alphabetically by filename) and concatenate them into a unified document.
5. The use case SHALL classify owned vs. referenced symbols using `SpecSymbolClassifier` (extracting symbols from headings, code blocks, inline backticks, and interface stems) and populate:
   - `symbolCoverageMap` (mapping symbol ID to claiming spec ID)
   - `symbolNameCoverageMap` (mapping `${workspace}::${name}` to claiming spec ID)
   - `existingSpecSlugs` (set of active workspace/slug identities)
   - `fullyClaimedFiles` (set of claimed file paths)
6. The use case SHALL automatically propagate hierarchical claims: when a use case or port is claimed, its composition wiring (`composition/use-cases/`, `composition/`), internal domain helpers, and filesystem storage adapters (`infrastructure/fs/`) SHALL be marked as claimed.
7. When `ignoreCurrentSpecs` is `true`, the use case SHALL bypass existing spec inspection and perform 100% clean brownfield capability clustering across the entire codebase.

### Requirement: Graph-First Polyglot Capability Clustering

1. The use case SHALL filter AST symbols using `isSpeccableSymbol` (retaining substantive classes, interfaces, enums, domain types, and top-level exported functions $\ge 4$ chars; discarding private helpers, generic variable placeholders, getters/setters, and anonymous lambdas).
2. If a source file has 0 uncovered speccable symbols (because it is a pure re-export barrel file or because all its symbols are already claimed), it SHALL be skipped from generating a candidate spec without requiring hardcoded file names (`index.ts`, `__init__.py`).
3. The use case SHALL apply bidirectional concept root extraction (OOP role suffixes + Functional action verb prefixes) and canonical prefix/suffix mapping to merge related symbols into cohesive capability specifications.
4. Entrypoint and barrel files (`index.ts`, `main.ts`, `app.ts`, `entrypoint.ts`, `ports.ts`) SHALL generate a single unified facade specification (`workspace:entrypoint` or `workspace:program`) rather than being fragmented by internal subcommand wiring functions.
5. For multi-symbol files containing multiple distinct uncovered structural definitions, each distinct structural symbol SHALL anchor its own candidate capability specification with a sanitized slug derived from `toKebabCase(symbol.name)` (deduplicating repeated words and eliminating double hyphens).
6. Architectural layer directory names (`use-cases/`, `ports/`, `entities/`, `services/`) SHALL NOT be used as capability slugs; capability slugs SHALL derive directly from concrete file or symbol names.
7. The capability clustering engine SHALL derive capability slugs, architectural categories, and title suffixes dynamically from Clean Architecture, DDD, and MVC directory structures and symbol identities without hardcoding specific technology names, workspace identities, or domain entities.

### Requirement: Inter-Spec Dependency Inference & Pure Transitive Reduction

1. The use case SHALL trace cross-file call and import edges using SQLite caller graphs.
2. When code in capability cluster $A$ calls symbols in capability cluster $B$ ($A \neq B$), the use case SHALL register a candidate dependency $A \rightarrow B$.
3. The use case SHALL apply a pure `TransitiveReductionEngine` to the raw dependency graph to prune redundant indirect edges ($A \rightarrow B \land B \rightarrow C \implies A \not\rightarrow C$).

### Requirement: Deterministic 5-Factor Confidence Scoring

The use case SHALL calculate candidate confidence deterministically on a $0 - 100\%$ scale summing 5 objective dimensions:

1. **Caller & Hotspot Evidence (0–25 pts)**: Evaluates presence of indexed hotspots, incoming caller volume, and cross-workspace caller impact.
2. **Architectural Clarity & Invariants (0–25 pts)**: Evaluates explicit domain classes, use cases, ports, and structured I/O interfaces.
3. **Graph Coupling & Cohesion (0–20 pts)**: Evaluates file-to-symbol ratios and internal cohesion count.
4. **Public Surface & Entrypoints (0–15 pts)**: Evaluates public API exports, command handlers, or port interfaces.
5. **Test Alignment Evidence (0–15 pts)**: Evaluates presence of associated unit or integration test suites.

### Requirement: Multi-Process Cache & Lock Safety

1. The use case and underlying suggestion caches SHALL utilize process PID re-entrancy and atomic file-locking (`withCacheFileLock`) across analysis passes to prevent race conditions during concurrent execution.
2. Contention on cache locks SHALL produce typed `CacheLockError` (`code: 'CACHE_LOCKED'`).
3. Suggestion caches SHALL maintain granular per-spec SHA-256 self-validating stamps ensuring single spec modifications only invalidate that specific cache entry.

## Constraints

1. **Strict Port Access**: Existing specs SHALL be read exclusively through `SpecRepository` ports.
2. **Holistic Spec Artifacts**: Spec parsing SHALL NOT assume single `spec.md` files; all artifacts of a spec SHALL be loaded in canonical order.
3. **Zero Hardcoding**: No workspace names, project paths, or domain entities SHALL be hardcoded.

## Spec Dependencies

- [`sdk:suggest-implementation-links`](../suggest-implementation-links/spec.md) — Shared AST symbol correlation and evidence extraction.
- [`sdk:suggest-spec-dependencies`](../suggest-spec-dependencies/spec.md) — Shared call-graph dependency deduction and transitive reduction.
