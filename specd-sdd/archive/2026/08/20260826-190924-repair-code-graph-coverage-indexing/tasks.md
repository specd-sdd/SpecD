# Tasks: repair-code-graph-coverage-indexing

## 1. Result evidence model

- [x] 1.1 Add coverage diagnostic value types
      `packages/code-graph/src/domain/value-objects/index-result.ts`: `IndexCoverageDiagnosticReason`, `IndexCoverageDiagnostic` — define the three stable file/missing/ambiguous outcomes and identity fields.
      Approach: use a closed string-literal union and readonly fields; diagnostics contain identities only and no source content.
      (Req: Deterministic implementation coverage projection)
- [x] 1.2 Add the run coverage summary type
      `packages/code-graph/src/domain/value-objects/index-result.ts`: `IndexRunCoverageSummary` — expose total, complete status counts, and sorted reasons.
      Approach: reuse `IndexCoverageStatus` as the `byStatus` record key so every status is always present.
      (Req: Forced indexing result completeness)
- [x] 1.3 Make coverage evidence required on `IndexResult`
      `packages/code-graph/src/domain/value-objects/index-result.ts`: `IndexResult` — add required `coverage` and `coverageDiagnostics` properties.
      Approach: keep every existing field unchanged; require producers and fixtures to supply zero-valued evidence rather than making the fields optional.
      (Req: Forced indexing result completeness)
- [x] 1.4 Export the new result types
      `packages/code-graph/src/domain/value-objects/index.ts`, `packages/code-graph/src/domain/index.ts`, `packages/code-graph/src/index.ts`, `packages/code-graph/src/public.ts` — expose the new public types beside `IndexResult`.
      Approach: preserve existing named ESM export structure and add JSDoc at the declaration source.
      (Req: Forced indexing result completeness)

## 2. Forced rebuild and logical clear

- [x] 2.1 Route force outside normal hash diffing
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph.execute()` — classify every discovered selected input for reconsideration when `options.force` is true.
      Approach: enter the full-rebuild branch for force independently of fingerprint mismatch and never read retained hashes as skip authority in that branch.
      (Req: Incremental indexing; scenario: Forced run ignores orphaned incremental state)
- [x] 2.2 Preserve provider force lifecycle and forwarding
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProviderImpl.index()` — retain lock → clear → execute ordering and forward `force: true` unchanged.
      Approach: do not change lifecycle signatures, storage generation, or lock ownership; make only the minimum code adjustment revealed by the regression test.
      (Req: Incremental indexing)
- [x] 2.3 Clear every SQLite generation-owned table
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: `SQLiteGraphDatabase.clear()` — remove physical nodes, specs, relations, logical/reference tables, index coverage, observations, latches, derivation metadata, and FTS contents.
      Approach: issue fixed `DELETE` statements in foreign-key-safe order inside the existing worker transaction while retaining schema version and physical schema.
      (Req: Complete logical clear; SQLite logical clear parity)
- [x] 2.4 Keep SQLite host clear semantics generation-stable
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `SQLiteGraphStore.clear()` — verify worker completion refreshes cached logical metadata without rotating `storage.epoch`.
      Approach: retain the existing worker RPC; change host code only if cached last-index fields remain visible after the worker clear.
      (Req: Complete logical clear; SQLite logical clear parity)
- [x] 2.5 Clarify abstract clear and coverage ID documentation
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore.clear()` and coverage query JSDoc — document complete logical reset and logical symbol parameters.
      Approach: do not add or rename abstract methods; align parameter descriptions with logical target semantics.
      (Req: Complete logical clear; Logical-symbol coverage endpoints)

## 3. Canonical spec preparation and coverage projection

- [x] 3.1 Add the prepared spec projection record
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `PreparedSpecProjection` — hold one materialized node, dependencies, persisted implementation links, and changed flag.
      Approach: import `PersistedImplementationLink` through the Core repository port and keep the interface internal to the use-case file.
      (Req: Deterministic implementation coverage projection)
- [x] 3.2 Prepare repository specs once before semantic hydration
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: spec preparation phase — materialize metadata and read persisted state once per spec before calculating coverage refresh.
      Approach: preserve per-spec error isolation and workspace counts; reuse prepared records later instead of repeating repository I/O.
      (Req: IndexCodeGraph use case; Deterministic implementation coverage projection)
- [x] 3.3 Compute the coverage reprojection predicate
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `coverageProjectionRequired` — activate projection for full rebuild, semantic file refresh, changed prepared specs, or absent persisted coverage.
      Approach: leave a fully unchanged incremental run on the existing fast path with no coverage-only hydration.
      (Req: Incremental indexing; Deterministic implementation coverage projection)
- [x] 3.4 Hydrate the complete semantic generation when projection is required
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: session hydration — load retained files, symbols, and reference facts while excluding deleted/replaced paths.
      Approach: extend the existing semantic-refresh hydration condition to coverage reprojection; analyze changed paths afterward so the session represents the pending generation.
      (Req: Deterministic implementation coverage projection; scenario: Implementation-only change reprojects coverage without code analysis)
- [x] 3.5 Implement the pure coverage projector
      `packages/code-graph/src/application/services/project-spec-coverage.ts`: `projectSpecCoverage()` — convert canonical implementation links into logical coverage relations and sorted diagnostics.
      Approach: build/use one declaration-symbol-to-logical-ID map, require exact one-target resolution, reject absent files, and never perform I/O or fallback to file coverage.
      (Req: Deterministic implementation coverage projection)
- [x] 3.6 Reproject all canonical coverage after affected code changes
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: spec relation staging — invoke the projector for every prepared spec whenever projection is required.
      Approach: remove `preservedFileCoverageRelations`; allow file-local cleanup to remove old edges and stage deterministic replacement edges before the single commit.
      (Req: Deterministic implementation coverage projection; scenario: Changed declaration reprojects canonical coverage)
- [x] 3.7 Preserve the unchanged-coverage fast path
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: spec relation staging — stage no coverage mutation when code, spec projections, fingerprints, and persisted coverage are unchanged.
      Approach: retain current relations and avoid loading all semantic facts solely to prove they are unchanged.
      (Req: Incremental indexing)
- [x] 3.8 Build complete run coverage evidence
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexResult` construction — aggregate the staged complete coverage snapshot and attach projector diagnostics.
      Approach: initialize every status count, deduplicate/sort reasons, and sort diagnostics deterministically by spec/file/symbol/reason.
      (Req: Index result; Forced indexing result completeness)

## 4. Logical coverage persistence

- [x] 4.1 Include logical IDs in SQLite endpoint sets
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: bulk relation endpoint collection — load committed/staged logical symbol IDs after reference facts are replaced.
      Approach: maintain separate physical and logical ID sets; do not parse canonical ID strings.
      (Req: Logical-symbol coverage endpoints; SQLite logical coverage integrity)
- [x] 4.2 Validate `COVERS_SYMBOL` against logical targets
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: relation endpoint validator — require existing spec source plus existing logical-symbol target.
      Approach: leave `CALLS`, hierarchy, and other symbol relation validation on physical occurrence IDs; never retarget invalid coverage.
      (Req: Logical-symbol coverage endpoints; SQLite logical coverage integrity)
- [x] 4.3 Preserve logical coverage through SQLite reads and statistics
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: relation insertion and coverage queries — verify logical IDs and metadata round-trip unchanged.
      Approach: reuse opaque relation text columns and current forward/reverse indexes; no schema-version bump unless a real schema change is discovered.
      (Req: Logical-symbol coverage endpoints; SQLite logical coverage integrity)

## 5. Graph health integrity

- [x] 5.1 Reconcile indexed coverage with persisted file nodes
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `readCoverageHealth()` — identify `indexed` coverage paths absent from `getAllFiles()`.
      Approach: perform one batch all-files read and set membership checks; exempt unsupported and excluded statuses.
      (Req: Indexed-content integrity assessment)
- [x] 5.2 Project inconsistency into every health return path
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `GetGraphHealth.execute()` — force content/coverage incomplete and aggregate non-current when indexed nodes are missing.
      Approach: add `GRAPH_CONTENT_INCONSISTENT` and `indexed-node-missing` once through a shared merge helper; do not mutate or repair storage.
      (Req: Indexed-content integrity assessment)
- [x] 5.3 Preserve current health for valid and unsupported coverage
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: coverage integrity classification — avoid false inconsistency for complete graphs and no-adapter inputs.
      Approach: require physical files only for `IndexCoverageStatus.Indexed`; retain existing partial/parse-failed logic.
      (Req: Indexed-content integrity assessment)

## 6. CLI evidence rendering

- [x] 6.1 Render coverage summary in text mode
      `packages/cli/src/commands/graph/index-graph.ts`: `formatTextIndexResult()` — add stable coverage totals, per-status counts, and reasons after existing phase/rebuild output.
      Approach: render the SDK result verbatim in deterministic status order; structured modes remain pass-through.
      (Req: Forced indexing result completeness)
- [x] 6.2 Render coverage diagnostics in text mode
      `packages/cli/src/commands/graph/index-graph.ts`: `formatTextIndexResult()` — list spec/file/symbol/reason diagnostics without treating them as fatal command errors.
      Approach: preserve exit code 0 for successful indexing and never infer reconstruction success from timestamp or exit code.
      (Req: Forced indexing result completeness; scenario: CLI preserves SDK reconstruction diagnostics)

## 7. Unit and contract regression tests

- [x] 7.1 Test forced diff bypass with retained hashes
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: incremental indexing cases — simulate cleared nodes plus stale coverage hashes and assert every selected input is reconsidered.
      Approach: use a deliberately faulty store double to prove indexer defense in depth independently of SQLite clear.
      (Req: Incremental indexing; scenario: Forced run ignores orphaned incremental state)
- [x] 7.2 Test clean file and logical-symbol coverage
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: implementation coverage cases — project a file-only link and one uniquely resolvable symbol link.
      Approach: return real persisted state from the mock repository and assert the symbol target is a logical ID.
      (Req: Deterministic implementation coverage projection; scenario: Clean generation projects file and logical-symbol coverage)
- [x] 7.3 Test implementation-only coverage reprojection
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: persisted-state-only change case — keep code hashes unchanged and change implementation links.
      Approach: prepopulate persisted semantic facts, assert hydration occurs without adapter analysis, and verify old coverage is replaced.
      (Req: Deterministic implementation coverage projection; scenario: Implementation-only change reprojects coverage without code analysis)
- [x] 7.4 Test changed declaration coverage reprojection
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: changed covered file case — replace declaration occurrences while retaining the logical target.
      Approach: assert no old occurrence ID remains and coverage targets the refreshed logical identity.
      (Req: Deterministic implementation coverage projection; scenario: Changed declaration reprojects canonical coverage)
- [x] 7.5 Test unresolved coverage diagnostics and no fallback
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: missing file, missing symbol, and ambiguous symbol cases — assert stable diagnostics and absence of guessed relations.
      Approach: cover all three reason codes and deterministic sorting while unrelated inputs commit.
      (Req: Deterministic implementation coverage projection; scenario: Unresolved and ambiguous symbol links are diagnostic)
- [x] 7.6 Extend the shared GraphStore clear contract
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`, `packages/code-graph/test/helpers/in-memory-graph-store.ts` — populate and assert removal of every generation-owned state family.
      Approach: run identical assertions for in-memory and SQLite implementations and verify storage generation is unchanged.
      (Req: Complete logical clear; scenario: Clear contract is backend-neutral)
- [x] 7.7 Extend the shared logical coverage contract
      `packages/code-graph/test/domain/ports/graph-store.contract.ts` — round-trip logical targets and reject unknown/occurrence-only targets.
      Approach: create explicit logical reference facts before coverage and assert forward/reverse reads plus statistics.
      (Req: Logical-symbol coverage endpoints)
- [x] 7.8 Test SQLite clear table completeness
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts` — assert every physical, semantic, incremental, metadata, and FTS table is empty after clear.
      Approach: use real temporary SQLite storage and verify the worker remains open with unchanged generation.
      (Req: SQLite logical clear parity; scenario: Healthy force clear empties all generation-owned tables)
- [x] 7.9 Test SQLite clear rollback
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`: injected clear failure — prove partial deletes roll back.
      Approach: use the existing database/worker test seam to fail after an early statement, then query the prior complete generation.
      (Req: SQLite logical clear parity; scenario: Logical clear rolls back atomically)
- [x] 7.10 Test SQLite logical endpoint persistence
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: bulk logical coverage cases — assert acceptance, metadata, reverse lookup, statistics, and invalid-target rejection.
      Approach: stage reference facts and relations in one bulk generation in production order.
      (Req: SQLite logical coverage integrity)
- [x] 7.11 Test graph health inconsistency projection
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`: indexed coverage over absent files — assert false freshness/completeness, non-current state, stable reasons, and no mutation.
      Approach: add separate consistent-generation and unsupported-input controls to prevent false positives.
      (Req: Indexed-content integrity assessment)
- [x] 7.12 Test provider force forwarding
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: force indexing case — assert lock, clear, and index call order plus unchanged force input.
      Approach: use existing provider/store/indexer seams; do not duplicate process-worker behavior.
      (Req: Incremental indexing)
- [x] 7.13 Test CLI text and structured evidence
      `packages/cli/test/commands/graph-index.spec.ts`: formatting cases — assert rebuild, coverage summary, diagnostics, real classifications, and structured round-trip.
      Approach: inject SDK results with nonzero unsupported/skipped and diagnostic fields; assert the CLI does not recompute them.
      (Req: Forced indexing result completeness)

## 8. Real SQLite integration and fixtures

- [x] 8.1 Make the spec repository mock accept persisted state
      `packages/code-graph/test/helpers/make-mock-spec-repository.ts`: repository factory options — replace the unconditional null implementation with optional test-supplied state while retaining null default.
      Approach: keep the mock typed against the real `SpecRepository` port and avoid raw sidecar parsing in unit tests.
      (Req: Deterministic implementation coverage projection)
- [x] 8.2 Update all required `IndexResult` fixtures
      Code Graph and SDK test files reported by TypeScript after result type changes — add complete zero or scenario-specific coverage evidence.
      Approach: centralize a typed zero-summary helper where multiple fixtures share it; do not cast around required fields.
      (Req: Index result; Forced indexing result completeness)
- [x] 8.3 Add a real spec-lock-to-SQLite coverage integration
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: temporary workspace case — index real persisted implementation links into empty SQLite.
      Approach: write canonical spec artifacts through repository-compatible fixtures, then assert nonzero file and logical-symbol coverage.
      (Req: Deterministic implementation coverage projection)
- [x] 8.3a Add persisted-sidecar-only SQLite coverage reprojection regression
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: run two ordinary incremental indexes against real SQLite while changing only `spec-lock.json` implementation links between them.
      Approach: keep all TypeScript source bytes unchanged, assert no second-run adapter analysis, and verify stale coverage is removed while the new file and logical-symbol coverage relations persist.
      (Req: Deterministic implementation coverage projection; scenario: Implementation-only change reprojects coverage without code analysis)
- [x] 8.4 Add force-then-incremental SQLite recovery integration
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: populated-store sequence — force reindex, reopen/read coverage, then run normal incremental indexing.
      Approach: assert force has zero hash skips and preserves coverage; assert the following normal run restores expected skips.
      (Req: Incremental indexing; Complete logical clear; SQLite logical coverage integrity)

## 9. Documentation and final verification

- [x] 9.1 Document Code Graph coverage and recovery semantics
      `docs/code-graph/index.md` — explain logical-symbol targets, deterministic reprojection, diagnostics, and forced logical rebuild recovery.
      Approach: describe user-visible behavior and troubleshooting, not SQLite table implementation.
      (Req: Deterministic implementation coverage projection; Complete logical clear)
- [x] 9.2 Document graph-index coverage output
      `docs/cli/cli-reference.md` — add coverage summary/diagnostic fields and forced-run interpretation for text, JSON, and TOON.
      Approach: preserve the existing command signature and examples; add one forced recovery example.
      (Req: Forced indexing result completeness)
- [x] 9.3 Run focused Code Graph and CLI tests
      Repository test commands for `@specd/code-graph`, `@specd/cli`, and affected SDK fixtures — verify all new and existing regressions.
      Approach: run focused suites first, then package-level test/typecheck/lint using existing pnpm scripts; fix strict TypeScript and JSDoc failures.
      (Req: all requirements)
- [x] 9.4 Build packages and run forced E2E indexing
      Built CLI from repository root — execute `node packages/cli/dist/index.js graph index --force --format toon` and inspect the result.
      Approach: require `fullRebuild: true`, code inputs reprocessed, zero hash-matched skips, nonzero physical graph counts, and only explainable diagnostics.
      (Req: Incremental indexing; Forced indexing result completeness)
- [x] 9.5 Verify coverage and health after force
      Built CLI from repository root — execute `graph stats --format toon` after the forced run.
      Approach: require nonzero files, symbols, `COVERS_FILE`, and `COVERS_SYMBOL`; require current health only when indexed coverage endpoints exist.
      (Req: Logical-symbol coverage endpoints; Indexed-content integrity assessment)
- [x] 9.6 Verify the following normal incremental run
      Built CLI from repository root — execute `graph index --format toon` immediately after E2E force verification.
      Approach: confirm normal unchanged inputs use incremental skips and coverage counts remain stable.
      (Req: Incremental indexing)
