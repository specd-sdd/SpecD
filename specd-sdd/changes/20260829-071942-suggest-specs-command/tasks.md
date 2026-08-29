# Tasks: suggest-specs-command

## 1. Domain Value Objects & Services (@specd/sdk)

- [x] 1.1 Create candidate specification value objects and report types
      `packages/sdk/src/domain/value-objects/candidate-spec.ts`: `CandidateSpec`, `SuggestSpecsResult`, `SpecCategory`, `ConfidenceBreakdown`
      Approach: define immutable TypeScript interfaces and types for candidate specifications, rationale summaries, 5-factor breakdowns, and aggregation metrics
      (Req: Use Case Interface)
- [x] 1.2 Implement pure Transitive Reduction Engine
      `packages/sdk/src/domain/services/transitive-reduction-engine.ts`: `TransitiveReductionEngine`
      Approach: implement pure recursive reachability algorithm over `Map<string, Set<string>>` that prunes indirect transitive edges to generate minimal DAGs
      (Req: Inter-Spec Dependency Inference & Pure Transitive Reduction)
- [x] 1.3 Implement Spec Symbol Classifier
      `packages/sdk/src/domain/services/spec-symbol-classifier.ts`: `SpecSymbolClassifier`
      Approach: build on `extractMarkdownSymbolEvidence` AST to partition owned primary symbols (matching specId/title, I/O interfaces, errors) from referenced collaborator types
      (Req: Existing Spec Audit & Gap Analysis Partitioning, Spec Symbol Classifier & Ownership Partitioning)
- [x] 1.4 Implement Polyglot Capability Clustering Engine
      `packages/sdk/src/domain/services/capability-clustering-engine.ts`: `CapabilityClusteringEngine`
      Approach: classify relative file paths into Clean Architecture layers (`APPLICATION_USE_CASE`, `CORE_DOMAIN_ENTITY`, etc.) consuming `FileNode.workspace` directly, grouping auxiliary files (DTOs, errors) with their owning capability, and stripping language extensions cleanly via `AdapterRegistryPort`
      (Req: Polyglot Capability Clustering & AST Anchors)
- [x] 1.5 Implement Deterministic 5-Factor Confidence Scorer
      `packages/sdk/src/domain/services/confidence-scorer.ts`: `ConfidenceScorer`
      Approach: calculate confidence scores ($0 - 100\%$) summing callers (25), architectural clarity (25), graph cohesion (20), public surface (15), and test alignment (15)
      (Req: Deterministic 5-Factor Confidence Scoring)
- [x] 1.6 Implement Call-Graph Dependency Inference Engine
      `packages/sdk/src/domain/services/dependency-inference-engine.ts`: `DependencyInferenceEngine`
      Approach: translate cross-file SQLite caller rows (`getSymbolCallers`) into spec-level dependency edges using the active `fileToSpecMap`
      (Req: Inter-Spec Dependency Inference & Pure Transitive Reduction)

## 2. Unit Tests for Domain Engines (@specd/sdk)

- [x] 2.1 Add unit tests for TransitiveReductionEngine
      `packages/sdk/test/domain/services/transitive-reduction-engine.spec.ts`: `TransitiveReductionEngine` tests
      Approach: test transitive chain pruning ($A \rightarrow B \rightarrow C \implies A \not\rightarrow C$), cycle handling, and isolated node preservation
      (Req: Inter-Spec Dependency Inference & Pure Transitive Reduction)
- [x] 2.2 Add unit tests for SpecSymbolClassifier
      `packages/sdk/test/domain/services/spec-symbol-classifier.spec.ts`: `SpecSymbolClassifier` tests
      Approach: test classification of primary classes vs constructor collaborator parameters and detection of insufficient implementation links
      (Req: Existing Spec Audit & Gap Analysis Partitioning)
- [x] 2.3 Add unit tests for CapabilityClusteringEngine
      `packages/sdk/test/domain/services/capability-clustering-engine.spec.ts`: `CapabilityClusteringEngine` tests
      Approach: test Clean Architecture layer classification, auxiliary file grouping, and polyglot extension stripping (`.php`, `.py`, `.go`, `.ts`)
      (Req: Polyglot Capability Clustering & AST Anchors)
- [x] 2.4 Add unit tests for ConfidenceScorer
      `packages/sdk/test/domain/services/confidence-scorer.spec.ts`: `ConfidenceScorer` tests
      Approach: test 5-factor scoring calculations, weighting boundaries, and priority assignment
      (Req: Deterministic 5-Factor Confidence Scoring)

## 3. Application Use Case & Composition (@specd/sdk)

- [x] 3.1 Implement SuggestSpecs application use case
      `packages/sdk/src/application/use-cases/suggest-specs.ts`: `SuggestSpecs`
      Approach: orchestrate workspace discovery from `FileNode`, spec audit/gap analysis, capability clustering, dependency reduction, confidence scoring, and scenario synthesis
      (Req: Use Case Interface, Existing Spec Audit & Gap Analysis Partitioning, Acceptance Scenario Synthesis)
- [x] 3.2 Implement composition factory createSuggestSpecs
      `packages/sdk/src/composition/suggest-specs.ts`: `createSuggestSpecs`
      Approach: provide standard factory injecting codeGraphProvider, adapterRegistry, and fileObserver dependencies
      (Req: Dependency-Injected Factory)
- [x] 3.3 Integrate SpecSymbolClassifier into SuggestImplementationLinks
      `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`: integrate classifier
      Approach: prioritize owned symbols for high-confidence link assignment, filtering out referenced collaborator types
      (Req: Spec Symbol Classifier & Ownership Partitioning)
- [x] 3.4 Integrate TransitiveReductionEngine into SuggestSpecDependencies
      `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`: integrate reduction engine
      Approach: delegate transitive edge pruning to the shared `TransitiveReductionEngine`, deduplicating inline reduction logic
      (Req: Modular Transitive Reduction & Invariant Graph Engine)
- [x] 3.5 Export SuggestSpecs and domain types from @specd/sdk
      `packages/sdk/src/index.ts`: export `SuggestSpecs`, `createSuggestSpecs`, and types
      Approach: re-export use case, input/output types, and factories from the main package index
      (Req: Use Case Interface)
- [x] 3.6 Add integration tests for SuggestSpecs
      `packages/sdk/test/application/use-cases/suggest-specs.spec.ts`: integration test suite
      Approach: test brownfield discovery mode, gap analysis mode, workspace filtering, and error handling (`InvalidInputError`, `WorkspaceNotFoundError`)
      (Req: Use Case Interface, Input Validation & Dynamic Workspace Resolution)

## 4. CLI Command & Output Formatting (@specd/cli)

- [x] 4.1 Implement specd specs suggest command handler
      `packages/cli/src/commands/specs/suggest.ts`: `createSpecsSuggestCommand`
      Approach: parse flags (`--ignore-current-specs`, `--workspace`, `--limit`, `--min-confidence`, `--json`, `--cwd`), delegate to `SuggestSpecs.execute()`, and render interactive tables or JSON
      (Req: Command Surface & Options, Delegation to SDK, Output Rendering, Error Handling)
- [x] 4.2 Register suggest command under specs command group
      `packages/cli/src/commands/specs/index.ts`: register `suggest` action
      Approach: add `.addCommand(createSpecsSuggestCommand())` to the specs command group
      (Req: Command Surface & Options)
- [x] 4.3 Add CLI integration tests for specs suggest
      `packages/cli/test/commands/specs/suggest.spec.ts`: CLI command tests
      Approach: verify argument parsing, exit codes, text table rendering, and `--json` stdout output
      (Req: Command Surface & Options, Output Rendering, Error Handling)

## 5. Verification & Documentation

- [x] 5.1 Run full build and test suite across `@specd/sdk` and `@specd/cli`
      Approach: `pnpm --filter @specd/sdk test`, `pnpm --filter @specd/cli test`, and `pnpm build`
      (Req: All Requirements)
- [x] 5.2 Update SDK and CLI documentation
      `packages/sdk/README.md`, `packages/cli/README.md`, `docs/cli/`: document `specd specs suggest`
      Approach: document command syntax, flags, SDK API usage, and example outputs
      (Req: Command Surface & Options, Output Rendering)
