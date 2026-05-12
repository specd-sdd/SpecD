# Tasks: code-graph-inheritance-relations

## 1. Domain model and store contract

- [x] 1.1 Extend the core relation vocabulary with hierarchy edge types
      `packages/code-graph/src/domain/value-objects/relation-type.ts`: `RelationType` — add `Extends`, `Implements`, and `Overrides` so hierarchy edges become valid first-class relations everywhere in the package.
      Approach: extend the closed `RelationType` constant and keep `isRelationType()` driven by `Object.values(RelationType)` so the validator updates automatically.
      (Req: Relation types, Hierarchy relation semantics)

- [x] 1.2 Add hierarchy query methods to the graph-store port
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore` — add directional methods for incoming and outgoing `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relations.
      Approach: add six abstract methods (`getExtenders`, `getExtendedTargets`, `getImplementors`, `getImplementedTargets`, `getOverriders`, `getOverriddenTargets`) and keep the port storage-agnostic.
      (Req: GraphStore port, Query methods)

- [x] 1.3 Update the in-memory store used by domain tests
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: `InMemoryGraphStore` — implement the new hierarchy query methods so traversal and hotspot tests can exercise the contract without LadybugDB.
      Approach: mirror the existing `CALLS` and `IMPORTS` filtering style by selecting stored `Relation` entries by type and source/target direction.
      (Req: Query methods)

- [x] 1.4 Extend graph-store contract coverage for hierarchy queries and statistics
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: contract scenarios — add assertions for the six hierarchy accessors and for hierarchy counts in `getStatistics()`.
      Approach: reuse the same contract harness as `getCallers`/`getImporters`, adding fixtures with persisted `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` edges.
      (Req: Query methods, Graph statistics, scenario: getExtenders returns incoming EXTENDS relations, scenario: getImplementors returns incoming IMPLEMENTS relations, scenario: getOverriders returns incoming OVERRIDES relations, scenario: Statistics include hierarchy relation counts)

## 2. Persistence and schema

- [x] 2.1 Persist hierarchy tables in the Ladybug schema
      `packages/code-graph/src/infrastructure/ladybug/schema.ts`: `SCHEMA_VERSION`, `SCHEMA_DDL` — add `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` relationship tables and bump the schema version.
      Approach: keep relationships propertyless like the existing edge tables and move the schema from version `5` to `6` so a force reindex rebuilds the graph cleanly.
      (Req: Relationship tables, Schema versioning)

- [x] 2.2 Implement hierarchy queries and counts in the Ladybug store
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `LadybugGraphStore` — implement the six hierarchy query methods and include hierarchy counts in `getStatistics()`.
      Approach: add private helpers for incoming/outgoing symbol relations so `CALLS` and hierarchy edge queries share the same materialization path, then extend statistics aggregation to include all relation types.
      (Req: Query methods, Graph statistics, LadybugDB adapter)

- [x] 2.3 Ensure relation creation and bulk load accept hierarchy edges transparently
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `bulkLoad()`, `createRelation()` — allow `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` to flow through the same grouped COPY/import path as existing relations.
      Approach: rely on relation type grouping by table name and avoid special-case insertion logic beyond the new schema tables.
      (Req: LadybugDB adapter, Relationship tables, scenario: LadybugDB adapter persists hierarchy relations)

- [x] 2.4 Add Ladybug regression tests for hierarchy persistence and schema v6
      `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts`: new describe blocks — verify hierarchy queries, statistics, and versioned persistence behavior.
      Approach: seed a small graph with type/method symbols and hierarchy edges, then assert both direct retrieval and aggregate counts after open/bulk-load cycles.
      (Req: LadybugDB adapter, Graph statistics, scenario: LadybugDB adapter persists hierarchy relations, scenario: Statistics include hierarchy relation counts)

## 3. Adapter extraction and index pipeline

- [x] 3.1 Extend adapter contract expectations to emit hierarchy relations
      `packages/code-graph/src/domain/value-objects/language-adapter.ts` and adapter implementations — make `extractRelations()` treat `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` as valid outputs from adapters.
      Approach: keep extraction synchronous and adapter-owned; do not add a separate hierarchy method, because the spec keeps all relation extraction inside `extractRelations()`.
      (Req: LanguageAdapter interface, Hierarchy extraction)

- [x] 3.2 Add deterministic hierarchy extraction to the TypeScript adapter
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractRelations()` — emit hierarchy edges for resolvable `extends`, `implements`, and method override matches.
      Approach: resolve type targets from local declarations and the existing import map, and drop ambiguous targets rather than guessing.
      (Req: Hierarchy extraction)

- [x] 3.3 Add deterministic hierarchy extraction to the Python adapter
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `extractRelations()` — emit hierarchy edges for resolvable base classes and overriding methods.
      Approach: normalize only what can be matched from imported or local symbols, preserving the “drop unresolved targets” rule.
      (Req: Hierarchy extraction)

- [x] 3.4 Add deterministic hierarchy extraction to the Go adapter
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `extractRelations()` — emit hierarchy edges for resolvable inheritance-adjacent constructs that fit the three chosen base relations.
      Approach: normalize only constructs that preserve impact semantics and avoid inventing extra relation categories in this iteration.
      (Req: Hierarchy extraction)

- [x] 3.5 Add deterministic hierarchy extraction to the PHP adapter
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractRelations()` — emit class/interface hierarchy edges and resolvable overrides, separate from the existing dynamic loader heuristics.
      Approach: reuse existing namespace/import resolution paths and keep ambiguous runtime-only targets dropped.
      (Req: Hierarchy extraction)

- [x] 3.6 Add adapter-level regression tests for hierarchy extraction
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`, `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`, `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`, `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: new extraction cases.
      Approach: add positive tests for `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`, plus negative tests showing unresolved hierarchy targets are omitted.
      (Req: Hierarchy extraction)

- [x] 3.7 Accumulate hierarchy edges in Pass 2 of the indexer
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph.execute()` — include `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` in the Pass 2 relation accumulation and single bulk load.
      Approach: keep Pass 1 unchanged, extend the existing Pass 2 `extractRelations()` flow, and preserve the “all symbols loaded into `SymbolIndex` before relation resolution” rule.
      (Req: IndexCodeGraph use case, Two-pass extraction with in-memory index, scenario: Hierarchy relations are accumulated in Pass 2)

- [x] 3.8 Add indexing tests for hierarchy propagation through the two-pass pipeline
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: new scenarios — verify hierarchy relations survive Pass 2 and are present after bulk load.
      Approach: create multi-file fixtures with base types and overriding methods, index them once, and assert the stored relations by type.
      (Req: Two-pass extraction with in-memory index, scenario: Hierarchy relations are accumulated in Pass 2)

## 4. Traversal, impact, and hotspot analysis

- [x] 4.1 Generalize upstream and downstream traversal to include hierarchy edges
      `packages/code-graph/src/domain/services/get-upstream.ts` and `packages/code-graph/src/domain/services/get-downstream.ts`: traversal BFS helpers — include incoming/outgoing hierarchy relations alongside `CALLS`.
      Approach: add private relation-collection helpers so the BFS loop stays single-path and continues to honor `maxDepth`, `visited`, and truncation semantics.
      (Req: Impact analysis)

- [x] 4.2 Make symbol-level and file-level impact hierarchy-aware
      `packages/code-graph/src/domain/services/analyze-impact.ts`: `analyzeImpact()` — integrate hierarchy-derived symbols/files into depth counts, risk calculation, and aggregate file impact.
      Approach: let symbol-level BFS pick up hierarchy edges first, then reuse the current file-import traversal and deduplication rules without changing the public result shape.
      (Req: Impact analysis, File impact)

- [x] 4.3 Add traversal regression tests for inherited and overriding symbols
      `packages/code-graph/test/domain/services/traversal.spec.ts`: new describe blocks — verify base classes affect subclasses, interfaces affect implementors, and methods affect overriders.
      Approach: use the in-memory store with explicit hierarchy relations and assert depth buckets, affected files, and merged file-level results.
      (Req: Impact analysis, File impact)

- [x] 4.4 Add hierarchy centrality to hotspot scoring and widen default kinds
      `packages/code-graph/src/domain/services/compute-hotspots.ts` and `packages/code-graph/src/domain/value-objects/hotspot-result.ts`: `computeHotspots()`, `DEFAULT_HOTSPOT_KINDS` — include hierarchy signals in ranking and add `interface` to the default kind set.
      Approach: keep caller evidence primary, compute hierarchy signals in one helper phase, and preserve the existing `HotspotEntry` shape unless implementation proves a public field is necessary.
      (Req: Batch hotspot scoring, Smart defaults with automatic removal)

- [x] 4.5 Add hotspot regression tests for hierarchy-aware ranking
      `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`: new ranking and default-kind scenarios.
      Approach: add fixtures where hierarchy dependents elevate a base type or interface, and assert importer-only exclusion still behaves the same unless explicitly widened.
      (Req: Batch hotspot scoring, Smart defaults with automatic removal)

## 5. Provider ripple, verification, and documentation checks

- [x] 5.1 Smoke-test provider-facing impact and hotspot behavior
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: provider integration scenarios — ensure richer hierarchy-aware results do not break the composition surface.
      Approach: keep the provider API unchanged and assert observable behavior through existing wrapper methods rather than adding new public APIs.
      (Req: Impact analysis, Batch hotspot scoring)

- [x] 5.2 Rebuild and inspect the graph after the schema bump
      `node packages/cli/dist/index.js graph index --force --format json` and `node packages/cli/dist/index.js graph stats --format json`: manual verification — confirm schema version `6` rebuilds cleanly and statistics expose hierarchy counts.
      Approach: force reindex after implementation, then inspect `relationCounts` for `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` before trusting impact/hotspot queries.
      (Req: Schema versioning, Graph statistics)

- [x] 5.3 Verify hierarchy-aware impact and hotspots end to end
      `node packages/cli/dist/index.js graph impact --symbol "<symbol>" --direction downstream --format json` and `node packages/cli/dist/index.js graph hotspots --format json`: manual verification — confirm inherited and overriding relationships influence blast radius and ranking.
      Approach: run the CLI against known base classes/interfaces after reindexing and verify subclasses, implementors, or overriders appear in results.
      (Req: Impact analysis, Batch hotspot scoring)

- [x] 5.4 Run package test, typecheck, and lint gates and update docs only if public output changed
      `packages/code-graph/test/run-vitest.sh`, `pnpm --filter @specd/code-graph typecheck`, `pnpm lint`, and optionally `docs/cli/cli-reference.md`: final verification and docs gate.
      Approach: treat docs as conditional — update `docs/cli/cli-reference.md` only if implementation exposes new hierarchy-specific public output fields or semantics beyond the current spec-level internal change.
      (Req: LadybugDB adapter, Graph statistics, Batch hotspot scoring)
