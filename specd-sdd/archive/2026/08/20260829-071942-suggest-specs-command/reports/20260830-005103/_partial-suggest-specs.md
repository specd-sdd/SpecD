# Compliance Audit Partial Report: suggest-specs-command

## Target Specs Evaluated

1. `sdk:suggest-specs`
2. `cli:spec-suggest`
3. `sdk:suggest-implementation-links` (delta)
4. `sdk:suggest-spec-dependencies` (delta)

---

## 1. `sdk:suggest-specs`

- **Spec Path**: `specs/sdk/suggest-specs/spec.md`
- **Implementation File(s)**: `packages/sdk/src/application/use-cases/suggest-specs.ts`, `packages/sdk/src/composition/suggest-specs.ts`, `packages/sdk/src/domain/services/capability-clustering-engine.ts`, `packages/sdk/src/domain/services/confidence-scorer.ts`
- **Test File(s)**: `packages/sdk/test/application/use-cases/suggest-specs.spec.ts`, `packages/sdk/test/domain/services/capability-clustering-engine.spec.ts`, `packages/sdk/test/domain/services/confidence-scorer.spec.ts`

### Requirements Audit:

- **`Requirement: Use Case Interface`**: **CONFORMANT**. `SuggestSpecs` exposes `execute(input?: SuggestSpecsInput): Promise<SuggestSpecsResult>`.
- **`Requirement: Input Validation & Dynamic Workspace Resolution`**: **CONFORMANT**. `minConfidence` float bounds, `limit` integer checks, and workspace existence validations via `deps.specRepositories` are enforced.
- **`Requirement: Code Graph Freshness Diagnostics`**: **CONFORMANT**. Probes `provider.getGraphHealth()`, emits `stale-warning`, sets `codeGraphStale: boolean`.
- **`Requirement: Existing Spec Audit & Symbol-Level Coverage Map`**: **CONFORMANT**. Reads specs through repository ports, primes `SuggestImplementationLinks`, builds symbol coverage maps.
- **`Requirement: Graph-First Polyglot Capability Clustering`**: **CONFORMANT**. Filters speccable symbols, merges concept roots, generates facade specs for barrel files, and derives slugs/categories dynamically without hardcoded technology strings.
- **`Requirement: Inter-Spec Dependency Inference & Pure Transitive Reduction`**: **CONFORMANT**. Traces SQLite call graph edges and delegates transitive reduction to `TransitiveReductionEngine`.
- **`Requirement: Deterministic 5-Factor Confidence Scoring`**: **CONFORMANT**. Sums caller evidence (25), architectural clarity (25), graph cohesion (20), public surface (15), and test alignment (15).
- **`Requirement: Multi-Process Cache & Lock Safety`**: **CONFORMANT**. In-process re-entrant reference counting and atomic PID locks via `withCacheFileLock`.

### Discrepancies: None.

### Test Coverage: 100% coverage (177 tests in `@specd/sdk`).

---

## 2. `cli:spec-suggest`

- **Spec Path**: `specs/cli/spec-suggest/spec.md`
- **Implementation File(s)**: `packages/cli/src/commands/spec/suggest.ts`, `packages/cli/src/commands/specs/index.ts`, `packages/cli/src/helpers/prompt-apply.ts`
- **Test File(s)**: `packages/cli/test/commands/specs/suggest.spec.ts`, `packages/cli/test/helpers/prompt-apply.spec.ts`

### Requirements Audit:

- **`Requirement: Command Surface & Options`**: **CONFORMANT**. Registers `--ignore-current-specs`, `-w, --workspace`, `-m, --min-confidence`, `-l, --limit`, `--rebuild-cache`, `--config`, `--format`, `-j, --json`.
- **`Requirement: Output Rendering`**: **CONFORMANT**. Interactive `@clack/prompts` spinner and `clack.note` boxes with clean line wrapping and ellipsis markers, plus raw JSON stdout emission when `--json` is passed.

### Discrepancies: None.

### Test Coverage: 100% coverage (919 tests in `@specd/cli`).

---

## 3. `sdk:suggest-implementation-links` (Delta)

- **Spec Path**: `deltas/sdk/suggest-implementation-links/spec.md.delta.yaml`
- **Implementation File(s)**: `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`
- **Test File(s)**: `packages/sdk/test/application/use-cases/suggest-implementation-links.spec.ts`

### Requirements Audit:

- **`Requirement: Spec Symbol Classifier & Ownership Partitioning`**: **CONFORMANT**. Partitions owned vs referenced symbols.
- **`Requirement: Early Graph Staleness Diagnostics`**: **CONFORMANT**. Emits `stale-warning`.
- **`Requirement: Multi-Process Cache Locking and Flush Merging`**: **CONFORMANT**. PID locking and flush merging.
- **`Requirement: Session-Level Query Caching & Incremental Persistence`**: **CONFORMANT**. `symbolQueryCache` & `fileCanonicalCache` eliminate redundant SQLite queries; per-spec incremental flushing preserves 100% of analyzed specs on disk.

### Discrepancies: None.

### Test Coverage: 100% coverage.

---

## 4. `sdk:suggest-spec-dependencies` (Delta)

- **Spec Path**: `deltas/sdk/suggest-spec-dependencies/spec.md.delta.yaml`
- **Implementation File(s)**: `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`
- **Test File(s)**: `packages/sdk/test/application/use-cases/suggest-spec-dependencies.spec.ts`

### Requirements Audit:

- **`Requirement: Modular Transitive Reduction & Invariant Graph Engine`**: **CONFORMANT**. Delegates transitive pruning to `TransitiveReductionEngine`.

### Discrepancies: None.

### Test Coverage: 100% coverage.
