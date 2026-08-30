# Verification: sdk:suggest-specs

## Requirements

### Requirement: Use Case Interface

#### Scenario: Successful execution of SuggestSpecs returns structured capability report

- **GIVEN** A valid configured execution environment with indexed code graph
- **WHEN** `SuggestSpecs.execute()` is invoked without filters
- **THEN** It returns a result with `result: 'ok'`, a summary containing analyzed files and coverage percentages, and an array of `suggestedSpecs`.

### Requirement: Input Validation & Dynamic Workspace Resolution

#### Scenario: Invalid minConfidence parameter is rejected

- **GIVEN** An input with `minConfidence: 1.5` or `minConfidence: -0.2`
- **WHEN** `SuggestSpecs.execute(input)` is invoked
- **THEN** It throws an `InvalidInputError` with an actionable message.

#### Scenario: Invalid limit parameter is rejected

- **GIVEN** An input with `limit: 0` or `limit: -5`
- **WHEN** `SuggestSpecs.execute(input)` is invoked
- **THEN** It throws an `InvalidInputError` indicating limit must be $\ge 1$.

#### Scenario: Non-existent workspaceFilter is rejected

- **GIVEN** An input with `workspaceFilter: 'unknown-ws'`
- **WHEN** `SuggestSpecs.execute(input)` is invoked
- **THEN** It throws a `WorkspaceNotFoundError`.

### Requirement: Code Graph Freshness Diagnostics

#### Scenario: Probes code graph freshness, emits early stale-warning event, and populates codeGraphStale indicator

- **GIVEN** An open code graph provider whose graph index is stale
- **WHEN** `SuggestSpecs.execute()` runs
- **THEN** It emits a `stale-warning` progress event immediately at the start of execution and populates `codeGraphStale: true` on the returned result.

### Requirement: Existing Spec Audit & Symbol-Level Coverage Map

#### Scenario: Existing specs are read through repository ports across all artifacts

- **GIVEN** A codebase with multi-artifact specifications
- **WHEN** `SuggestSpecs.execute({ ignoreCurrentSpecs: false })` is invoked
- **THEN** All artifacts for each spec are loaded in canonical order through `SpecRepository` and their owned symbols populate the symbol coverage map.

### Requirement: Graph-First Polyglot Capability Clustering

#### Scenario: Multi-symbol shared files are split into distinct capability specs

- **GIVEN** A generic source file containing multiple uncovered structural definitions (classes/interfaces)
- **WHEN** `SuggestSpecs.execute()` clusters capabilities
- **THEN** Each distinct structural symbol anchors its own candidate capability specification.

#### Scenario: Pure re-export barrel files are discarded naturally

- **GIVEN** A barrel file (`index.ts`, `__init__.py`) containing 0 owned definitions in CodeGraph
- **WHEN** Capability clustering runs
- **THEN** The barrel file is discarded from generating a standalone capability specification.

#### Scenario: Zero-hardcoding dynamic capability resolution across Clean Architecture and MVC

- **GIVEN** Source files in infrastructure, controller, or domain directories
- **WHEN** `SuggestSpecs.execute()` resolves capability anchors
- **THEN** Capability slugs, categories, and title suffixes derive dynamically from directory paths and symbol names without hardcoded technology strings.

### Requirement: Inter-Spec Dependency Inference & Pure Transitive Reduction

#### Scenario: Transitive dependency edges are pruned into a minimal DAG

- **GIVEN** Capability $A$ calls $B$, and Capability $B$ calls $C$, and $A$ also has direct call edges to $C$
- **WHEN** Transitive reduction runs
- **THEN** $C$ is pruned from $A$'s direct `dependsOnSpecs` list because it is reachable through $B$.

### Requirement: Deterministic 5-Factor Confidence Scoring

#### Scenario: High-centrality capability with tests scores >= 80% confidence

- **GIVEN** A cohesive use case with indexed callers, structural class/interfaces, and an associated test file
- **WHEN** Confidence scoring is evaluated
- **THEN** Its confidence score meets or exceeds $0.80$ ($80\%$) with a detailed breakdown across all 5 dimensions.

### Requirement: Multi-Process Cache & Lock Safety

#### Scenario: Cache lock contention throws typed CacheLockError

- **GIVEN** An active suggestion cache lock held by another process
- **WHEN** `SuggestSpecs.execute()` or an underlying suggestion cache operation attempts to acquire the lock
- **THEN** It throws a typed `CacheLockError` with code `CACHE_LOCKED` rather than corrupting cache data.
