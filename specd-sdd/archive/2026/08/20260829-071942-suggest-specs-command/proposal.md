# Proposal: suggest-specs-command

## Motivation

Adopting Spec-Driven Development (SDD) in brownfield or partially-specced projects is currently hindered by the lack of automated, deterministic specification discovery and gap detection. Developers and AI agents need a canonical `specd specs suggest` command and corresponding SDK orchestration that analyzes codebase structure, identifies unspecced capability gaps, correlates AST implementation targets, and infers minimal DAG inter-spec dependencies without hardcoded assumptions or LLM token overhead.

## Current behaviour

Today, SpecD provides two complementary discovery use cases:

1. `SuggestImplementationLinks` (`@specd/sdk`): Correlates existing specifications with AST implementation files and exported symbols.
2. `SuggestSpecDependencies` (`@specd/sdk`): Deduces inter-spec `dependsOn` relationships from code import graphs and applies transitive reduction.

However:

- **No Brownfield Discovery**: There is no mechanism to discover and propose high-level architectural specifications for a codebase that has zero existing specifications.
- **No Gap Analysis**: For partially-specced projects, there is no tool to audit the codebase, determine what percentage of code is covered by specifications, and report missing capability specifications (_unspecced gaps_).
- **Coupled Primitives**: The AST correlation and transitive reduction logic are tied to individual use cases rather than accessible as reusable Codebase Intelligence domain engines.

## Proposed solution

We propose introducing a unified `specd specs suggest` CLI command backed by a reusable `SuggestSpecs` use case in `@specd/sdk` that:

1. **Discovers Candidate Specifications**: Clusters source files and structural symbols into cohesive Clean Architecture and DDD capabilities (Use Cases, Domain Entities, Ports/Contracts, Infrastructure Adapters, Domain Services, and Public APIs).
2. **Early CodeGraph Staleness Diagnostics**: Inspects code graph freshness upfront before running heavy analysis, immediately warning in text mode if the graph is stale (allowing users to abort early) and exposing `codeGraphStale: boolean` in the JSON output.
3. **Performs Upfront Inverse Code $\rightarrow$ Spec Gap Audit & Implementation Cache Warmup**: Audits existing specifications exclusively through `SpecRepository` ports (never raw disk reads), reading and canonically concatenating all spec artifacts (`spec.artifacts`) into a unified whole. Runs an upfront warmup pass with `SuggestImplementationLinks` to prime the implementation suggestions cache across workspaces, pulling in confirmed `HIGH` confidence implementation links while claiming hierarchical footprints (composition wiring, internal helpers, storage adapters) to eliminate false-positive gaps.
4. **Applies Pure Symbol-Level Coverage & Multi-Symbol Granularity**: Employs `isSpeccableSymbol` filtering (classes, interfaces, enums, domain types, and top-level exported functions) and two-way symbol coverage maps (`symbolCoverageMap`, `symbolNameCoverageMap`). When a shared legacy file defines multiple distinct structural symbols, each uncovered structural symbol independently anchors its own candidate specification with a dedicated capability slug derived directly from the symbol name.
5. **Graph-First Semantic Detection of Barrels (Zero Hardcoding)**: Leverages CodeGraph's native distinction between original declarations and re-exports. Files with 0 own speccable definitions (pure re-export barrels) are discarded naturally without hardcoded file or folder names.
6. **Offers Pure Brownfield Mode**: Supports an `--ignore-current-specs` flag to run 100% clean capability discovery across the entire codebase regardless of existing spec files.
7. **Deduces Minimal Inter-Spec Dependencies**: Employs a shared transitive reduction engine to generate minimal, direct DAG dependency trees.
8. **Interactive Progress & Note Box Formatting**: Integrates `@clack/prompts` with dynamic spinners and `clack.note` box formatting (using `wrapForClack`) conforming to `spec deps` and `spec implementation` conventions.

### Operational Flow & Algorithmic Pseudocode

```text
FUNCTION SuggestSpecs(input: SuggestSpecsInput): SuggestSpecsResult
  1. INITIALIZE ENVIRONMENT, WORKSPACES & PROBE CODE GRAPH HEALTH
     host = openSpecdHost(input.startDir, allowBootstrapFallback: true)
     provider = host.createGraphProvider(); provider.open()

     // Early CodeGraph Staleness Diagnostics
     health = provider.getGraphHealth()
     codeGraphStale = health.stale OR health.knownStaleSinceLastIndex OR health.reasonCodes.isNotEmpty()
     IF codeGraphStale:
       onProgress({ type: 'stale-warning', stale: true })

     allFiles = provider.store.getAllFiles()
     allSymbols = provider.findSymbols({})
     hotspots = provider.getHotspots({ minScore: 0 })

  2. UPFRONT IMPLEMENTATION WARMUP & INVERSE CODE -> SPEC AUDIT
     symbolCoverageMap = new Map()     // symbolId -> specId
     symbolNameCoverageMap = new Map() // ws::symbolName -> specId
     existingSpecSlugs = new Set()     // ws::slug variants
     fullyClaimedFiles = new Set()

     IF NOT input.ignoreCurrentSpecs:
       // Warm up implementation suggestions cache
       IF deps.suggestImplementationLinks:
         deps.suggestImplementationLinks.execute({ all: true, rebuildCache: input.rebuildCache })

       FOR [wsName, repo] IN host.specRepositories:
         FOR entry IN repo.list():
           spec = repo.get(entry.path)
           // Unify all artifacts of spec in canonical order
           specContent = loadCanonicalSpecArtifacts(spec, repo)

           // Include HIGH confidence cached implementation suggestions
           cached = implementationCache.get(spec.id)
           FOR sug IN cached.suggestions WHERE sug.confidence == 'HIGH':
             markClaimedFile(sug.file, wsName)
             FOR sym IN sug.symbols:
               symbolNameCoverageMap.set(`${wsName}::${sym}`, spec.id)

           audit = SpecSymbolClassifier.classify(specContent, spec.id, persistedLinks)
           FOR ownedSymbol IN audit.ownedSymbols:
             symbolCoverageMap.set(ownedSymbol.id, spec.id)
             symbolNameCoverageMap.set(`${wsName}::${ownedSymbol.name}`, spec.id)
             // Propagate hierarchical claim to composition wiring and storage adapters
             propagateHierarchicalClaims(ownedSymbol.filePath, fullyClaimedFiles)

  3. CAPABILITY CLUSTERING (SYMBOL-LEVEL GRANULARITY)
     candidateClusters = new Map()
     targetSourceFiles = allFiles.filter(f => !isTestFile(f))

     FOR file IN targetSourceFiles:
       speccableSymbols = symbolsInFile(file).filter(isSpeccableSymbol)
       uncoveredSymbols = speccableSymbols.filter(s =>
         NOT symbolCoverageMap.has(s.id) AND NOT symbolNameCoverageMap.has(`${ws}::${s.name}`)
       )

       // Skip pure re-export barrels or files where all speccable symbols are claimed
       IF uncoveredSymbols.isEmpty(): CONTINUE

       distinctStructuralSymbols = uncoveredSymbols.filter(isStructural)
       IF distinctStructuralSymbols.length > 1:
         FOR sym IN distinctStructuralSymbols:
           anchor = resolveCapabilityAnchor(file.workspace, file.path, sym.name)
           IF existingSpecSlugs.has(anchor.capabilityKey): CONTINUE
           cluster = candidateClusters.getOrCreate(anchor.capabilityKey)
           cluster.symbols.add(sym)
           cluster.primaryFiles.add(file.path)
       ELSE:
         primarySymbol = distinctStructuralSymbols[0]?.name || uncoveredSymbols[0]?.name
         anchor = resolveCapabilityAnchor(file.workspace, file.path, primarySymbol)
         IF existingSpecSlugs.has(anchor.capabilityKey): CONTINUE
         cluster = candidateClusters.getOrCreate(anchor.capabilityKey)
         cluster.symbols.addAll(uncoveredSymbols)
         cluster.primaryFiles.add(file.path)

  4. INTER-SPEC DEPENDENCY INFERENCE & TRANSITIVE REDUCTION
     rawDepsMap = inferCrossClusterDependencies(candidateClusters, outgoingCalls)
     minimalDepsMap = TransitiveReductionEngine.reduce(rawDepsMap)

  5. CONFIDENCE SCORING & RATIONALE SYNTHESIS
     suggestedSpecs = []
     FOR cluster IN candidateClusters:
       confidence = ConfidenceScorer.compute({
         callers: computeCallerEvidence(cluster, hotspots),
         clarity: computeArchitecturalClarity(cluster),
         cohesion: computeGraphCohesion(cluster),
         surface: computePublicSurface(cluster),
         tests: computeTestAlignment(cluster, testFiles)
       })

       priority = determinePriority(cluster, hotspots, confidence)
       rationale = synthesizeRationale(cluster, hotspots, minimalDepsMap.get(cluster.specId))

       suggestedSpecs.add(CandidateSpec({
         id: cluster.specId,
         title: cluster.title,
         workspace: cluster.workspace,
         category: cluster.category,
         priority: priority,
         confidence: confidence,
         rationale: rationale,
         primaryFiles: cluster.primaryFiles,
         anchorSymbols: cluster.anchorSymbols,
         hotspots: cluster.hotspots,
         dependsOnSpecs: minimalDepsMap.get(cluster.specId)
       }))

  6. RETURN AUDIT & DISCOVERY REPORT
     coveragePct = (fullyClaimedFiles.size + suggestedFiles.size) / totalSourceFiles * 100
     RETURN SuggestSpecsResult({
       codeGraphStale: codeGraphStale,
       suggestedSpecs: filterAndSort(suggestedSpecs, input.minConfidence, input.limit),
       summary: {
         totalFilesAnalyzed: totalSourceFiles,
         totalSymbolsAnalyzed: allSymbols.length,
         totalSpecsSuggested: suggestedSpecs.length,
         codeCoveragePercentage: coveragePct,
         averageConfidence: mean(suggestedSpecs.confidence)
       }
     })
```

## Specs affected

### New specs

- `sdk:suggest-specs`: Application use case in `@specd/sdk` that orchestrates capability clustering, specification gap analysis, confidence scoring, implementation link correlation, and inter-spec dependency deduction.
  - Depends on: `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`
- `cli:spec-suggest`: CLI command surface `specd specs suggest` in `@specd/cli` providing flags (`--ignore-current-specs`, `--workspace`, `--limit`, `--min-confidence`, `--rebuild-cache`, `--json`, `--format`, `--config`), `@clack/prompts` spinner progress, early staleness warnings, and `clack.note` box formatting.
  - Depends on: `sdk:suggest-specs`

### Modified specs

- `sdk:suggest-implementation-links`: Unifies all spec artifacts in canonical order, probes graph staleness upfront, filters out pure declaration-free barrel files, and modularizes AST symbol correlation into reusable domain services.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:suggest-spec-dependencies`: Modularizes the pure transitive reduction DAG algorithm and call-graph dependency inference into shared domain services consumed by both `SuggestSpecDependencies` and `SuggestSpecs`, with upfront graph staleness diagnostics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`@specd/sdk`**:
  - Adds `SuggestSpecs` application use case and input/output contracts.
  - Extracts shared domain engines: `TransitiveReductionEngine`, `DependencyInferenceEngine`, `CapabilityClusteringEngine`, `ConfidenceScorer`, and `SpecSymbolClassifier`.
  - Integrates canonical multi-artifact reading, upfront implementation warmup, early graph staleness diagnostics, and inverse Code $\rightarrow$ Spec deduction via `SpecRepository` ports.
- **`@specd/cli`**:
  - Registers the `specs suggest` (and `spec suggest`) command action under the `specs` command group with `--rebuild-cache`.
  - Implements early staleness warning in text modes, interactive progress spinners with `@clack/prompts`, `clack.note` box rendering via `wrapForClack`, and JSON/text formatting.
- **Backward Compatibility**:
  - Fully backward-compatible; existing `suggest-implementation-links` and `suggest-spec-dependencies` APIs and CLI commands remain unchanged in their public interfaces.

## Technical context

- **Baseline Prototype Validation**: Verified on full monorepo with 732 source files and 40,207 symbols, accurately identifying capability boundaries and coverage gaps.
- **Graph-First Semantic Barrel Detection**: Eliminates hardcoded file/folder names by checking owned structural definitions (`isSpeccableSymbol`) in CodeGraph.
- **Deterministic 5-Factor Confidence Model**:
  1. _Caller & Hotspot Evidence_ (0–25 pts)
  2. _Architectural Clarity & Invariants_ (0–25 pts)
  3. _Graph Coupling & Cohesion_ (0–20 pts)
  4. _Public Surface & Entrypoints_ (0–15 pts)
  5. _Test Alignment Evidence_ (0–15 pts)
- **Transitive Reduction**: Prunes redundant transitive edges ($A \rightarrow B \land B \rightarrow C \implies A \not\rightarrow C$) to maintain minimal, clean specification architecture DAGs.

## Open questions

None. All architectural aspects, symbol-level coverage maps, multi-artifact parsing, inverse Code $\rightarrow$ Spec deduction, and interactive progress reporting have been validated and aligned with system requirements.
