# Technical Design: suggest-specs-command

## Overview

This technical design establishes the comprehensive implementation contract for `SuggestSpecs` in `@specd/sdk` and `specd specs suggest` in `@specd/cli`. The system delivers an automated, deterministic Codebase Intelligence engine that unifies capability clustering, specification gap analysis, upfront inverse Code $\rightarrow$ Spec correlation, canonical multi-artifact reading via `SpecRepository`, implementation cache warmup, and minimal DAG dependency deduction with transitive reduction, leveraging `@specd/code-graph`'s native graph entities.

## Architectural Approach & Component Structure

Following Hexagonal Architecture and Domain-Driven Design principles, the design separates pure domain algorithmic engines from application orchestrations and delivery adapters:

```
packages/sdk/
├── src/
│   ├── domain/
│   │   ├── services/
│   │   │   ├── capability-clustering-engine.ts  # Layer heuristics & polyglot file/symbol grouping
│   │   │   ├── spec-symbol-classifier.ts        # Owned vs referenced symbol partitioning (markdown AST)
│   │   │   ├── dependency-inference-engine.ts   # Call-graph to spec dependency mapper
│   │   │   ├── transitive-reduction-engine.ts   # Pure DAG reachability & edge pruning
│   │   │   └── confidence-scorer.ts             # Deterministic 5-factor scoring model
│   │   └── value-objects/
│   │       └── candidate-spec.ts                # Value objects & report structures
│   ├── application/
│   │   └── use-cases/
│   │       └── suggest-specs.ts                 # Application orchestration use case
│   └── composition/
│       └── suggest-specs.ts                     # Dependency injection factory
packages/cli/
└── src/
    └── commands/
        └── spec/
            └── suggest.ts                       # CLI command handler with @clack/prompts & clack.note
```

---

## 1. Domain Services & Value Objects (`packages/sdk/src/domain/`)

### 1.1 `CandidateSpec` & Value Objects (`candidate-spec.ts`)

```typescript
export type SpecCategory =
  | 'APPLICATION_USE_CASE'
  | 'CORE_DOMAIN_ENTITY'
  | 'PORT_OR_CONTRACT'
  | 'INFRASTRUCTURE_SUBSYSTEM'
  | 'DOMAIN_SERVICE'
  | 'PUBLIC_INTERFACE_API'
  | 'UTILITY_SUPPORT'

export interface ConfidenceBreakdown {
  readonly callerEvidence: number        // 0..25
  readonly architecturalClarity: number // 0..25
  readonly graphCouplingCohesion: number // 0..20
  readonly publicSurface: number         // 0..15
  readonly testAlignmentEvidence: number // 0..15
  readonly total: number                 // 0..100
}

export interface AnchorSymbol {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly filePath: string
}

export interface HotspotSummary {
  readonly name: string
  readonly kind: string
  readonly filePath: string
  readonly score: number
  readonly directCallers: number
  readonly crossWorkspaceCallers: number
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface SpecRationale {
  readonly whyNeeded: string
  readonly blastRadiusSummary: string
  readonly architecturalRole: string
  readonly keyEvidence: readonly string[]
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

export interface SuggestSpecsSummary {
  readonly totalFilesAnalyzed: number
  readonly totalSymbolsAnalyzed: number
  readonly totalWorkspaces: number
  readonly totalSpecsSuggested: number
  readonly highConfidenceSpecsCount: number
  readonly codeCoveragePercentage: number
  readonly averageConfidence: number
  readonly byPriority: Readonly<Record<string, number>>
  readonly byCategory: Readonly<Record<string, number>>
  readonly uncoveredFilesCount: number
  readonly existingSpecsCount?: number
  readonly missingSpecsCount?: number
}

export interface SuggestSpecsResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string | undefined
  readonly codeGraphStale?: boolean
  readonly summary: SuggestSpecsSummary
  readonly suggestedSpecs: readonly CandidateSpec[]
}
```

---

### 1.2 `CapabilityClusteringEngine` (`capability-clustering-engine.ts`)

**Purpose**: Maps source files and speccable symbols into architectural capability anchors without hardcoding file names or using layer directory names as single monolithic slugs.

```typescript
export interface CapabilityAnchor {
  readonly workspace: string
  readonly capabilitySlug: string
  readonly capabilityKey: string
  readonly category: SpecCategory
  readonly titleSuffix: string
  readonly layer: string
}

export class CapabilityClusteringEngine {
  static resolveCapabilityAnchor(
    workspace: string,
    filePath: string,
    supportedExtensions?: ReadonlySet<string>,
    primarySymbolName?: string,
  ): CapabilityAnchor
}
```

**Key Invariants**:
1. **Symbol-Level Granularity**: If a file contains multiple distinct structural symbols (e.g. `services.ts`), passing `primarySymbolName` anchors the capability to that specific symbol via `toKebabCase(primarySymbolName)`.
2. **Layer Folder Independence**: Folder names representing architectural layers (`use-cases/`, `ports/`, `entities/`, `services/`) are never used as capability slugs; slugs are derived from the concrete file or symbol name.
3. **Polyglot Extension Stripping**: Queries `AdapterRegistryPort` to cleanly strip extensions (`.ts`, `.py`, `.go`, `.php`).

---

### 1.3 `TransitiveReductionEngine` (`transitive-reduction-engine.ts`)

**Purpose**: Pure algorithmic optimization that computes the minimal DAG by pruning redundant transitive paths ($A \rightarrow B \land B \rightarrow C \implies A \not\rightarrow C$).

```typescript
export class TransitiveReductionEngine {
  static reduce(rawDependencies: ReadonlyMap<string, ReadonlySet<string>>): Map<string, string[]>
}
```

---

### 1.4 `ConfidenceScorer` (`confidence-scorer.ts`)

**Purpose**: Deterministic 5-factor confidence model:

```typescript
export interface ConfidenceInputs {
  readonly maxHotspotScore: number
  readonly totalIncomingCallers: number
  readonly totalCrossWorkspaceCallers: number
  readonly hasPrimaryClasses: boolean
  readonly category: SpecCategory
  readonly hasAnchorSymbols: boolean
  readonly fileCount: number
  readonly symbolCount: number
  readonly hasPublicExports: boolean
  readonly testSuitesCount: number
}

export class ConfidenceScorer {
  static compute(inputs: ConfidenceInputs): {
    score: number
    priority: 'P0 (Critical)' | 'P1 (High)' | 'P2 (Medium)'
    breakdown: ConfidenceBreakdown
  }
}
```

---

## 2. Application Use Case (`packages/sdk/src/application/use-cases/suggest-specs.ts`)

#### 2.1 Early Graph Staleness, Implementation Warmup, Spec Artifact Unification & Upfront Inverse Audit

1. **Strict Port Access**: All spec reads occur through `SpecRepository` (`repo.list()`, `repo.get()`, `repo.artifact()`, `repo.readPersistedState()`).
2. **Multi-Workspace & Scoped Filtering**: Supports `workspaceFilter?: string | string[]` accepting single strings, arrays, or comma-separated lists. Analysis metrics (`files`, `symbols`, `coverage %`, `workspaces`) are scoped strictly to the target workspace(s).
3. **Early CodeGraph Staleness Diagnostics**: Inspects provider health via `provider.getGraphHealth()` at the start of execution. If stale, emits `stale-warning` progress event and sets `codeGraphStale: true` on the returned result.
4. **Implementation Warmup Pass**: Executes `suggestImplementationLinks.execute({ all: true, rebuildCache })` to prime `.specd/implementation-suggestions.json`. Integrates cached suggestions possessing `HIGH` confidence into symbol and file claim sets.
5. **Canonical Multi-Artifact Reading**: For each spec, all artifacts in `spec.artifacts` are loaded in canonical order (`spec.md` first, then alphabetically by `filename`) and concatenated into a unified document.
6. **Upfront Inverse Code $\rightarrow$ Spec Correlation**:
   - `SpecSymbolClassifier` extracts owned symbols from AST markdown headings, code blocks, inline backticks, and interface stems (`*Input` $\rightarrow$ base class).
   - Generates camelCase and factory variations (`create*`, `resolve*Deps`, `open*`).
   - Propagates hierarchical claims: when a use case or port is claimed, automatically claims its composition wiring (`composition/use-cases/`, `composition/`), internal domain helpers, and filesystem storage adapters (`infrastructure/fs/`).
7. **Symbol Coverage Maps & Multi-Symbol Granularity**:
   - `symbolCoverageMap: Map<string, string>` (symbol ID $\rightarrow$ spec ID)
   - `symbolNameCoverageMap: Map<string, string>` (`${ws}::${name}` $\rightarrow$ spec ID)
   - `existingSpecSlugs: Set<string>` (workspace and slug variants)
   - `fullyClaimedFiles: Set<string>`
   - Shared legacy files with multiple structural symbols are not skipped when partially claimed; uncovered symbols independently anchor their own candidate specifications.
8. **Universal Concept Root Extraction & Barrel Aggregation**:
   - `isSpeccableSymbol`: Retains substantive classes, interfaces, enums, domain types, and top-level exported functions $\ge 4$ chars; discards private helpers, generic variable placeholders (`useCase`, `handler`, `fmt`, `pct`, `ctx`), getters/setters, and anonymous lambdas.
   - `extractConceptRoot`: Universal bidirectional extraction stripping both action verb prefixes (`create`, `register`, `get`, `find`, `list`, `update`, `delete`, `validate`, `render`, `format`, `resolve`, `build`, etc.) and OOP role suffixes (`Service`, `Repository`, `Controller`, `Factory`, `Report`, `Summary`, `Payload`, `Response`, `Request`, `Record`, `Entry`, `DTO`, `Model`).
   - `groupByConceptRoots`: Canonical bidirectional prefix/suffix mapping merges related symbols (e.g. `SpecDeps` $\leftrightarrow$ `Deps`, `SpecSuggest` $\leftrightarrow$ `Suggest`) into unified capability specifications.
   - Entrypoint and barrel files (`index.ts`, `main.ts`, `app.ts`, `entrypoint.ts`, `ports.ts`) are aggregated as unified facades (`workspace:entrypoint` or `workspace:program`).
9. **Multi-Process Cache & Lock Concurrency**:
   - `withCacheFileLock` ensures thread and process safety across analysis passes, using process PID re-entrancy to avoid deadlocks when `SuggestSpecs` invokes `SuggestImplementationLinks` internally.
   - Suggestion caches enforce granular per-spec SHA-256 self-validating stamps.

---

## 3. CLI Command (`packages/cli/src/commands/spec/suggest.ts`)

### 3.1 Early Warning, `@clack/prompts` Integration & `clack.note` Box Rendering

1. **TTY Interactive Detection**: When `isInteractiveText` is true, displays interactive intro and spinner:
   - `clack.intro('SpecD — Suggest specifications')`
   - Early staleness warning: If `stale-warning` is received, pauses spinner and displays `clack.log.warn(...)` immediately before proceeding.
   - Dynamic spinner messages for warmup, discovery, gap auditing, clustering, and synthesis.
2. **Non-Interactive Text Mode**:
   - Immediately outputs `warning: code graph index is stale. Run 'specd graph index' to update.` if graph is stale.
3. **Standard Clack Note Box**:
   - Renders candidate specification cards inside `clack.note(wrapForClack(lines.join('\n').trim()), 'Suggested specifications')`, conforming to `spec deps` and `spec implementation` visual styling.
   - Concludes with `clack.outro` reporting scoped workspace(s) or total workspaces analyzed.
4. **Concurrency UX**:
   - Catches `CACHE_LOCKED`, stops the spinner gracefully, provides an informative log via `clack.log.info`, and closes with `clack.outro('Command ended.')` without throwing uncaught stack traces.
5. **Output Formats**:
   - `text`: Structured text output (`suggested specifications:\n ...`).
   - `json`: Machine-readable `SuggestSpecsResult` payload with `codeGraphStale`.
   - `toon`: Token-optimized toon format.

---

## 4. Deduplication Matrix

| Package | File | Role |
| :--- | :--- | :--- |
| `@specd/sdk` | `src/domain/services/transitive-reduction-engine.ts` | Reusable pure DAG transitive reduction for `SuggestSpecs` and `SuggestSpecDependencies`. |
| `@specd/sdk` | `src/domain/services/spec-symbol-classifier.ts` | Shared AST owned vs. referenced symbol partitioning with heading and stem extraction. |
| `@specd/sdk` | `src/domain/services/capability-clustering-engine.ts` | Polyglot capability clustering and symbol-level anchoring. |
| `@specd/sdk` | `src/domain/services/confidence-scorer.ts` | Pure 5-factor confidence scoring. |
| `@specd/sdk` | `src/application/use-cases/suggest-specs.ts` | SuggestSpecs application use case with implementation warmup and upfront inverse correlation. |
| `@specd/sdk` | `src/application/use-cases/suggest-implementation-links.ts` | Updated to unify multi-artifact specs canonically. |
| `@specd/cli` | `src/commands/spec/suggest.ts` | CLI command with `--rebuild-cache`, `@clack/prompts` spinner, and `clack.note` box formatting. |
