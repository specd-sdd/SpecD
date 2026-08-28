# Specs Compliance Audit — suggest-implementation-and-spec-deps

## Executive Summary

The audit covers all 12 specs in the change and their relevant global/direct dependency constraints. The implementation is not compliant: one critical integration defect causes real Core validation failures to be reported as valid, and the remaining findings include architecture, public-boundary, repository, cache, and test-coverage discrepancies. All requested suites pass, showing that the current tests do not expose every contract mismatch.

## Aggregate Totals

- Change specs audited: 12
- Findings: 13 total — 1 critical, 3 high, 6 medium, 3 low
- Core: 2,374 tests passed
- CLI: 888 tests passed
- SDK: 117 tests passed
- Code Graph: 682 tests passed
- Overall suite result: all listed suites pass
- Compliance verdict: **NOT COMPLIANT**

## Detailed Findings

# CLI + SDK Compliance Audit

Scope: `cli:spec-implementation`, `cli:spec-deps`, `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`, and `sdk:composition`, using the merged change previews. Direct dependencies checked include `default:_global/architecture`, `core:composition`, `code-graph:composition`, `cli:entrypoint`, and the real `core:ValidateSpecs` contract. Audit date: 2026-08-24. The code graph was current (`stale: false`, full indexed coverage).

## Requirements Summary

### `cli:spec-implementation`

The merged spec defines persisted implementation list/add/remove commands, direct Kernel delegation, raw-path semantics, typed error mapping, the SDK-backed `suggest` command, inclusion tags, additive apply behavior, and discoverable JSON/TOON help on every structured-output leaf.

### `cli:spec-deps`

The merged spec defines persisted dependency list/add/remove/set/clear commands, direct Kernel delegation, typed error mapping, the SDK-backed `suggest` command, post-apply validation, optional alignment-change creation, noninteractive structured output, and JSON/TOON response help.

### `sdk:suggest-implementation-links`

The merged spec defines input validation, progress events, a three-tier suggestion cascade, cache freshness and rebuild semantics, token affinity and symbol scoring, already-included marking, additive application, and a canonical dependency-injected orchestration factory. Concrete filesystem observation and caches belong at composition.

### `sdk:suggest-spec-dependencies`

The merged spec defines input validation, implementation-cache warm-up, import traversal, directional pruning, transitive reduction, cache ownership fingerprints, additive mutation, mandatory post-apply `ValidateSpecs`, fail-open validator handling, optional single alignment-change creation through `CreateChange`, and a canonical dependency-injected factory.

### `sdk:composition`

The merged spec defines the SDK package dependency boundary, a purportedly restricted source topology, curated public exports, host import policy, version exports, review orchestration, and config-based suggestion composition that delegates to canonical dependency factories. It also inherits the global hexagonal rule that packages containing business logic use `domain`, `application`, `infrastructure`, and optionally `composition`, with only composition importing infrastructure and no concrete adapter exposed from the public root.

## Implementation Status

### `cli:spec-implementation` — substantially implemented

- `packages/cli/src/commands/spec/implementation.ts` registers list/add/remove/suggest leaves with `.allowExcessArguments(false)` and format/config options.
- Mutation handlers map parsed flags directly to Kernel inputs; suggestion construction comes from `@specd/sdk`.
- Text output marks `[already included]` and `[new]`; structured output forwards the SDK result.
- Suggest help is registered before the action and therefore does not execute the use case.
- Existing command tests exercise delegation, initialization distinction, inclusion tags, TOON, help-without-execution, and representative typed error mapping.

### `cli:spec-deps` — substantially implemented

- `packages/cli/src/commands/spec/deps.ts` registers list/add/remove/set/clear/suggest leaves and maps mutations to Kernel use cases.
- Suggest delegates to `createSuggestSpecDependencies(config)`, maps `--create-change` to `createAlignmentChange`, never prompts, renders validation diagnostics, and forwards machine-readable results.
- Existing tests exercise all mutation leaves, initialization/no-op behavior, suggestion delegation/rendering, structured help, TOON, and read-only error presentation.

### `sdk:suggest-implementation-links` — implemented with boundary weakness

- The orchestration module has the requested canonical `createSuggestImplementationLinks(deps)` factory and no `node:fs`, filesystem-adapter, cache-constructor, or config-path import.
- Composition constructs `FsImplementationSuggestionCache`, the graph provider, Core use cases, and an FS-backed `SuggestionFileObserver`, then delegates to the canonical factory.
- The main algorithm, scoring reason `exact-primary-symbol-match`, cache port, progress events, inclusion marking, and additive update calls exist.
- The file observer is typed optional and silently falls back to “exists”/empty content, so direct orchestration construction can bypass the injected observation contract.

### `sdk:suggest-spec-dependencies` — structurally implemented but functionally broken for real validation

- The canonical dependency factory, composition facade, cache warm-up, graph traversal, pruning, cache fingerprint, preflight checks, exploration delegation to `CreateChange`, fail-open result, and progress events exist.
- However, the orchestration decodes a non-existent `ValidateSpecsResult.issues` property. The actual Core result is `{ entries, totalSpecs, passed, failed }`, with each entry `{ spec, passed, failures, warnings }`. Consequently the real composed validator reports every completed validation as `all-valid`, even when `failed > 0`; alignment changes cannot be triggered from real Core failures.

### `sdk:composition` — nonconformant and internally contradictory

- The two suggestion cases are correctly split into separate composition files and both delegate to their canonical orchestration factories.
- Runtime workspace dependencies are limited to Core and Code Graph; CLI/MCP/plugins are absent.
- The real source tree and root barrel violate explicit merged requirements: `src/application`, `src/domain`, and `src/infrastructure` exist, additional root files exist, and concrete `FsImplementationSuggestionCache` / `FsSpecDepsSuggestionCache` classes are exported from `src/index.ts`.

## Discrepancies

### CRITICAL — Real `ValidateSpecs` failures are treated as valid

Evidence:

- `packages/core/src/application/use-cases/validate-specs.ts:52` defines `ValidateSpecsResult.entries`, `totalSpecs`, `passed`, and `failed`; it has no `issues` field.
- `packages/core/src/application/ports/validation-result-cache.ts:9` defines each entry with `spec`, `passed`, `failures`, and `warnings`.
- `packages/sdk/src/orchestration/suggest-spec-dependencies.ts:787-849` checks only `valResObj.issues`. With the real result, `invalidSpecs` remains empty and the code selects `status: 'all-valid'`.
- SDK tests mock `{ issues: [...] }` instead of Core's public result, so all 117 SDK tests pass while the real integration is broken.

Impact: the core promise of post-apply validation and conditional alignment-change creation is not met. Invalid specs are silently classified as valid, no change is created, and CLI users receive false reassurance.

Interpretation: the implementation is wrong relative to both the merged SDK spec and the direct Core dependency contract. If the intended validator API truly is `issues`, then the Core spec/API and composition must be deliberately redesigned together; the current change cannot assume it.

### HIGH — SDK public root exports concrete infrastructure adapters

Evidence:

- `packages/sdk/src/index.ts` explicitly exports `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` from `./infrastructure/fs/index.js`.
- Merged `sdk:composition` says the root barrel MUST NOT export infrastructure adapters.
- `default:_global/architecture` says concrete adapter classes are never exported from public entry points.
- `packages/sdk/test/barrel.spec.ts` claims to test absence of infrastructure implementations but does not assert these two newly exported classes are absent.

Impact: delivery hosts can couple directly to SDK filesystem details, undermining storage substitution and the curated facade.

Interpretation: code and coverage are wrong if the architectural contract stands. If public construction of caches is intentional, both global and SDK specs need an explicit exception rather than an accidental export.

### HIGH — `sdk:composition` source-topology requirements contradict both code and the global dependency spec

Evidence:

- Merged `sdk:composition` says `src/` is limited to `composition`, `orchestration`, `presentation`, `shared`, and `index.ts`, and says the SDK MUST NOT contain `domain`, `application`, or `infrastructure` layers.
- The actual tree contains `src/application/ports`, `src/domain/errors`, `src/domain/value-objects`, `src/infrastructure/fs`, plus root `core-reexports.ts`, `ports.ts`, and `extensions.ts`.
- The same merged spec's new suggestion-composition requirement authorizes composition to construct concrete filesystem caches, which are implemented in the prohibited `src/infrastructure` directory.
- `default:_global/architecture` requires any package containing business logic to have `domain`, `application`, and `infrastructure`; SDK now contains nontrivial algorithms, cache ports, and value objects. Thus the SDK-local prohibition conflicts with its global dependency.

Impact: no implementation can simultaneously satisfy the merged SDK layer-list prohibition, the new concrete-cache composition requirement as currently located, and the global layering rule.

Interpretation: this is primarily an artifact/design defect, not merely an implementation bug. The likely correction is to acknowledge SDK as a business-logic package with hexagonal layers and revise the SDK topology requirement; alternatively, move all domain/application/infrastructure concerns out of SDK and narrow it back to a facade.

### MEDIUM — Injected file observation is bypassable

Evidence:

- Merged `sdk:suggest-implementation-links` says candidate existence is validated through an injected file-observation dependency and orchestration operates exclusively through it.
- `SuggestImplementationLinksDeps.fileObserver` is optional.
- `_fileExists()` returns `true` when absent and `_readText()` returns `''` when absent.

Impact: direct use of the canonical factory with a superficially accepted deps object may emit nonexistent candidates and silently disable Tier 2 content inspection.

Interpretation: make the observer required in the canonical deps contract, or document and specify an explicit non-FS observer behavior. The current silent fallback is not the stated contract.

### MEDIUM — Apply-time domain errors are silently swallowed

Evidence:

- `SuggestImplementationLinks` catches every `UpdatePersistedSpecImplementation.execute` error and ignores it.
- `SuggestSpecDependencies` catches every `UpdatePersistedSpecDeps.execute` error and ignores it.
- The CLI and global error contracts expect typed errors to be actionable and consistently mapped; swallowing prevents `SpecNotFoundError`, read-only, conflict, and storage errors from reaching the host.

Impact: `--apply` can exit successfully after failing to persist suggestions; dependency validation may then run against unchanged lock state.

Interpretation: the specs are not explicit about partial-apply error policy, so either implementation should propagate/aggregate typed failures or the SDK specs must define best-effort semantics and expose per-item failures in the result.

### MEDIUM — Tier wording is internally inconsistent

Evidence:

- `sdk:suggest-implementation-links` first states that Tier 2 refines/extends Tier 1 and “does not short-circuit it.”
- The following Tier 2 bullet says “If Tier 2 produces matching candidates, the algorithm short-circuits and returns.”

Impact: reviewers cannot determine whether the implementation should rank a combined Tier 1/2 set or immediately return at Tier 2.

Interpretation: this requires spec clarification. Tests should then lock the chosen behavior.

### LOW — Structured help is locally hard-coded and not fully contract-tested

Evidence:

- Both CLI leaves call `.addHelpText()` directly with embedded response text. This satisfies the observable help requirement, but no shared schema-builder abstraction is used despite the phrase “shared structured-output help mechanism.”
- Tests assert key strings and non-execution but do not compare the documented schema against the exported SDK result types.

Impact: future result-field changes can make help stale without failing tests.

Interpretation: either clarify that Commander's shared convention is the mechanism, or introduce a reusable typed schema helper/test fixture.

## Test Coverage

Executed in this audit:

- SDK package: 13 files, 117 tests passed.
- CLI package: 80 files, 888 tests passed.

Covered well:

- CLI delegation and output for persisted implementation/dependency operations.
- Suggest command delegation, text tags, basic structured-help availability, and no execution during help.
- SDK input validation, MED normalization, primary-symbol reason, inclusion marking, additive call shape, progress events.
- Dependency directional pruning, transitive reduction, ownership-fingerprint invalidation, preflight missing collaborators, fail-open result, and exploration content passed to `CreateChange`.
- Composition config facades instantiate concrete caches and orchestration source has no direct FS/config imports.

Coverage weakness: several passing tests assert implementation-specific mock shapes rather than the public dependency contracts. Most importantly, the validator tests construct `issues`, which the real Core use case never returns.

## Missing Tests

1. A real or contract-faithful `ValidateSpecsResult.entries` integration test proving that failed entries produce `invalid-specs-detected` and one alignment change.
2. A test that valid real `entries` produces `all-valid` and never calls `CreateChange`.
3. A composition topology test for the merged directory restriction. The named scenario exists in `verify.md`, but `package-boundary.spec.ts` does not implement it.
4. A barrel test asserting `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` are not exported from `@specd/sdk` root.
5. A canonical factory test proving missing `fileObserver` is rejected, or an explicit test specifying the intended fallback.
6. Tests that update-use-case errors during both apply flows are propagated or represented, rather than silently ignored.
7. Direct Tier 2 hierarchical/subtoken scenario and Tier 3 fallback co-occurrence scenario tests matching the merged verification artifact; current orchestration tests do not name or construct those end-to-end cases.
8. Cache size/mtime/hash precedence tests at orchestration level for all three freshness branches and `rebuildCache` bypass.
9. CLI tests for every declared typed-error mapping, especially dependency unknown-spec/conflict and implementation boundary/conflict/read-only cases individually.
10. A typed/help snapshot or schema conformance test preventing documented JSON/TOON shapes from drifting from SDK result interfaces.

## Spec Dependency Chain

- `cli:spec-implementation` -> `sdk:suggest-implementation-links` -> Code Graph symbol/traversal/language-adapter specs and Core persisted implementation query/update specs.
- `cli:spec-deps` -> `sdk:suggest-spec-dependencies` -> `sdk:suggest-implementation-links`, Code Graph traversal, Core persisted dependency query/update, and `core:create-change`.
- Both CLI specs -> `cli:entrypoint` for formatting, help, exit, and host-boundary behavior.
- `sdk:composition` -> `default:_global/architecture`, `core:composition`, `code-graph:composition`, both suggestion specs, and host/presentation/review specs.

Consistency assessment:

- CLI-to-SDK dependency direction is correct; CLI package runtime platform dependency is SDK-only.
- Suggestion orchestration-to-composition dependency direction is correct for the new split.
- `sdk:suggest-spec-dependencies` is inconsistent with its direct Core validator dependency at the result-shape boundary.
- `sdk:composition` is inconsistent with global architecture and internally inconsistent about whether SDK may have hexagonal layers/infrastructure.
- SDK public exports violate both the SDK-local and global curated-entrypoint constraints.

## Summary Counts

- Specs audited: 5 change specs plus relevant global/direct dependencies.
- Top-level requirements reviewed: 36.
- Fully/substantially implemented: 30.
- Partially implemented or underspecified: 3.
- Nonconformant/contradictory: 3.
- Findings: 7 total — 1 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW.
- Missing or materially insufficient test areas: 10.
- Test execution: 1,005 passing tests across SDK and CLI; passing status does not clear the contract mismatches above.

Overall verdict: **NOT COMPLIANT**. The real `ValidateSpecs` integration failure is release-blocking. The `sdk:composition` topology/export contradictions require design/spec resolution before a clean compliance signoff is possible.

# Compliance Audit — Code Graph and Global Constraints

Scope: `code-graph:language-adapter`, `code-graph:graph-store`, relevant project-wide architecture/conventions/testing constraints, and direct dependencies at depth 1 (`code-graph:symbol-model`, `code-graph:staleness-detection`, `code-graph:document-model`, `default:_global/architecture`). The change's merged `spec.md` and `verify.md` previews were used. Navigation began with the fresh code graph (`state: current`, `stale: false`, full coverage), followed by symbol search and impact analysis. This was a read-only audit; only this report was written.

## Requirements Summary

### `code-graph:language-adapter`

The change adds one composite requirement:

1. Provide a standalone `createBuiltinAdapterRegistry` composition factory in `@specd/code-graph`.
2. Populate it with TypeScript/JavaScript, Python, Go, and PHP adapters.
3. Register optional custom adapters.
4. Support overloads for `extraAdapters?: readonly LanguageAdapter[]` and `config: SpecdConfig`.
5. Add optional `LanguageAdapter.keywords?(): readonly string[]`.
6. Add `AdapterRegistryPort.getReservedKeywords(): Set<string>` and the concrete aggregation behavior.
7. Re-export the factory through composition entrypoints.

The merged verification scenario additionally requires `.ts`, `.py`, `.go`, and `.php` discovery and the aggregated keywords `class`, `def`, `func`, `interface`, and `async`.

### `code-graph:graph-store`

The change adds one requirement:

1. `SymbolQuery` has optional `workspace?: string`.
2. `GraphStore.findSymbols()` scopes results to the exact, case-sensitive `'<workspace>:'` file-path prefix.
3. `%` and `_` in workspace names are literals rather than SQL wildcard characters.
4. The prefix comparison is parameterized.

The merged scenario combines the workspace filter with `name: 'create*'` and requires all returned symbols to belong only to `core`.

### Relevant global and dependency constraints

- Hexagonal architecture requires composition factories to expose application/domain contracts rather than concrete infrastructure types; public `"."` barrels must not export concrete adapters.
- Composition is the permitted layer for concrete construction and manual dependency injection.
- TypeScript is strict, ESM-only, named-export-only, with explicit public return types and kebab-case source/test names.
- Application/domain behavior needs unit coverage; infrastructure behavior needs integration coverage against real resources where relevant; mocks must implement full ports.
- `code-graph:symbol-model` makes `SymbolNode.filePath` a canonical workspace-prefixed identity, which is consistent with filtering by `'<workspace>:'`.
- The reviewed graph-store change is orthogonal to staleness and document persistence. No contradiction was found with `code-graph:staleness-detection` or `code-graph:document-model`.

## Implementation Status

### `code-graph:language-adapter` — PARTIAL / behavior implemented

- `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts:16-52` defines both required overloads, constructs `AdapterRegistry`, registers all four built-ins, and adds array-supplied custom adapters.
- `packages/code-graph/src/domain/value-objects/language-adapter.ts:70` defines `keywords?(): readonly string[]`.
- TypeScript, Python, Go, and PHP adapters each implement `keywords()`.
- `packages/code-graph/src/domain/ports/adapter-registry-port.ts:20` exposes `getReservedKeywords(): Set<string>`.
- `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts:90-101` deduplicates keyword values across unique adapters into a `Set`.
- `packages/code-graph/src/public.ts:2-5` and `src/index.ts:2-5` expose the factory indirectly via `create-code-graph-provider.ts`, which re-exports it.
- `packages/code-graph/src/composition/index.ts` does not re-export the factory.

### `code-graph:graph-store` — IMPLEMENTED

- `packages/code-graph/src/domain/value-objects/symbol-query.ts:9` declares `readonly workspace?: string`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts:1178-1183` uses a parameterized `substr(file_path, 1, length(?)) = ?` comparison. This is exact, case-sensitive in SQLite for the reviewed values, and treats `%`/`_` literally.
- The worker/store façade forwards the complete `SymbolQuery` without dropping the workspace property.
- `packages/code-graph/test/helpers/in-memory-graph-store.ts:732-735` mirrors the contract with `startsWith(workspace + ':')`.

## Discrepancies

### HIGH — Changed factory contract conflicts with the global architecture contract

**Spec evidence:** The merged language-adapter delta explicitly requires `createBuiltinAdapterRegistry` to return an `AdapterRegistry`. The global architecture spec requires standalone composition factories to return application-layer contracts and says composition factories must expose application/domain contracts, not concrete infrastructure types.

**Implementation evidence:** `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts:16-38` explicitly annotates every overload and implementation with the concrete infrastructure class `AdapterRegistry`; the file imports that class from `../../infrastructure/tree-sitter/adapter-registry.js`. Because `createBuiltinAdapterRegistry` is exported from the public root, its generated public declaration exposes the concrete return type even though the concrete class itself is intentionally absent as a named export from `src/public.ts`.

**Assessment:** The implementation follows the changed package spec literally, while that changed spec is not conformant to the binding global architecture spec. Either (a) the language-adapter delta should require/return `AdapterRegistryPort`, preserving the concrete registry internally, or (b) the global architecture rule needs an explicit, justified exception. As written, both cannot be simultaneously satisfied.

### MEDIUM — Factory is absent from the dedicated composition barrel

**Spec evidence:** The merged language-adapter requirement says the factory is “re-exported in composition entrypoints.”

**Implementation evidence:** `packages/code-graph/src/composition/index.ts:1-8` exports `createCodeGraphProvider`, `createSqliteGraphStoreFactory`, and graph-store types, but not `createBuiltinAdapterRegistry`. The factory reaches the package root only because `src/composition/create-code-graph-provider.ts:109` re-exports it and the roots re-export from that file.

**Assessment:** Runtime/public-root access works, but the dedicated composition entrypoint is incomplete relative to the plural “composition entrypoints” requirement. This is most likely an implementation omission; alternatively, the spec should name only the supported public package entrypoints if `src/composition/index.ts` is intentionally not part of the contract.

## Test Coverage

### Covered

- `packages/code-graph/test/composition/create-builtin-adapter-registry.spec.ts` verifies construction, the four required built-in extensions, custom-adapter registration, keyword aggregation/deduplication, and all five keywords named by the merged scenario.
- `packages/code-graph/test/domain/ports/graph-store.contract.ts:926` exercises the exact merged graph-store scenario: `{ name: 'create*', workspace: 'core' }` and exclusion of non-core symbols.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts:855-942` verifies SQLite case sensitivity and literal `_`/`%` behavior.
- The in-memory test store implements equivalent workspace-prefix filtering, so contract tests exercise both the abstract behavior and SQLite adapter.
- Executed `pnpm --filter @specd/code-graph test -- create-builtin-adapter-registry.spec.ts sqlite-graph-store.spec.ts`; the package runner executed the full suite: **55 files, 682 tests, all passed**.

### Coverage quality

Behavioral coverage for the two merged verification scenarios is strong. The graph-store test goes beyond the scenario by testing case variants and SQL wildcard characters. The factory test covers both required lookup families and extension through a custom adapter.

## Missing Tests

1. **MEDIUM:** No package-boundary/composition-barrel test imports `createBuiltinAdapterRegistry` through `src/composition/index.ts` (or the built equivalent). Such a test would have caught the missing re-export.
2. **MEDIUM:** No architectural type test asserts that the public factory returns `AdapterRegistryPort` and does not leak a concrete infrastructure type. This gap mirrors the spec/global contradiction and cannot be resolved cleanly until the intended contract is chosen.
3. **LOW:** The `SpecdConfig` overload is not explicitly invoked in `create-builtin-adapter-registry.spec.ts`. The implementation accepts the value and deterministically builds the defaults, but only the zero-argument and custom-adapter-array paths have direct behavioral assertions.

## Dependency Chain

```text
default:_global/architecture
  ├─ constrains composition factories and public package boundaries
  └─ conflicts with the changed concrete AdapterRegistry return contract

code-graph:symbol-model
  └─ defines SymbolNode.filePath as workspace-prefixed canonical identity
       └─ code-graph:graph-store SymbolQuery.workspace filters that identity

code-graph:staleness-detection
  └─ depends on graph-store metadata/freshness APIs; unaffected by workspace symbol filtering

code-graph:document-model
  └─ depends on graph-store persistence/search; document workspace semantics remain separate

code-graph:language-adapter
  ├─ LanguageAdapter.keywords?()
  ├─ AdapterRegistryPort.getReservedKeywords()
  └─ composition factory -> concrete AdapterRegistry -> four built-in adapters
```

Graph impact confirms the registry factory is HIGH risk with five affected files and direct use from code-graph provider construction and SDK suggestion orchestration. The SQLite database file is CRITICAL blast-radius infrastructure; its workspace-filter implementation is nevertheless narrowly parameterized and covered by both contract and integration tests.

## Summary Counts

| Category                             |                Count |
| ------------------------------------ | -------------------: |
| Change specs audited                 |                    2 |
| Added composite requirements audited |                    2 |
| Requirement clauses checked          |                   11 |
| Fully implemented clauses            |                   10 |
| Partially implemented clauses        |                    1 |
| High discrepancies                   |                    1 |
| Medium discrepancies                 |                    1 |
| Low discrepancies                    |                    0 |
| Missing/insufficient test items      |                    3 |
| Relevant tests executed              | 682 passed, 0 failed |

Overall result: **not fully compliant**. Graph-store workspace scoping is compliant and well tested. Language-adapter keyword behavior is implemented and tested, but the factory surface has one missing composition export and, more importantly, the changed concrete return contract contradicts the project-wide architecture contract.

# Core compliance audit

Change: `suggest-implementation-and-spec-deps`  
Scope: `core:fs-spec-repository`, `core:spec-repository-port`, `core:create-change`, `core:change-repository-port`, `core:fs-change-repository`  
Method: merged `changes spec-preview` artifacts, graph-first symbol discovery, implementation/test inspection, dependency consistency review, and the complete Core test suite. The code graph reported `stale: false` before inspection.

## Requirements Summary

### `core:fs-spec-repository`

Eight merged requirements and 33 scenarios cover constructor validation, storage-factory registration, the `FsSpecIndexCache` boundary and freshness model, full `SpecListEntry` cache materialization, metadata-only `get()` stamps, canonical persisted-state serialization, metadata snapshots, physical `*Meta` observations, and `specFingerprint`. The change specifically requires filesystem `SpecArtifactEntry` and `artifactMeta` observations to expose byte `size` from the same `stat` observation as `lastModified`, while retaining opt-in hashing.

### `core:spec-repository-port`

Nineteen merged requirements and 63 scenarios define workspace-bound repository identity; `get`, `list`, artifact access/confinement/debug logging, save/delete/path resolution, metadata snapshots, aggregate persisted state, search, count/reindex, and optional filesystem capability. The changed contract makes `SpecArtifactEntry.size` optional across adapter families but mandatory for filesystem-backed observations, and makes `ArtifactMeta.size` part of every present `artifactMeta` response while keeping `hash` conditional on `includeHash`.

### `core:create-change`

Thirteen merged requirements and 35 scenarios cover input/schema resolution, uniqueness, actor/history construction, dependency seeding, invalidation policy, persistence/scaffolding, composition dependencies, optional overlap detection, and optional initial exploration. The new requirement makes `explorationContent` semantic input: non-empty content is delegated to `ChangeRepository.create`; application code must perform no filesystem I/O; absent/undefined/empty content creates no exploration.

### `core:change-repository-port`

Twenty-nine merged requirements and 82 scenarios cover active/draft/discarded reads and lists, serialized mutation, drift invalidation, counts/reindex/projection, first create, artifact I/O/confinement/concurrency, storage paths, scaffolding, and the abstract surface. The added exploration contract comprises optional create data, metadata-only `Change.explorationMeta`, lazy `readExploration`, and semantic `writeExploration`, with no storage-layout exposure.

### `core:fs-change-repository`

Eleven merged requirements and 27 scenarios cover constructor/factory behavior, per-bucket index helpers and atomic mutation, freshness/index maintenance, revision compatibility, first persist, post-mutation reconcile, mutate-window artifact writes, and filesystem exploration persistence. The exploration file is the adapter-private `.specd-exploration.md`; initial persistence must clean up on failure, `get` may only stat it, reads are lazy, and writes are atomic.

## Implementation Status

### `core:fs-spec-repository` — substantially implemented, one structural discrepancy

- `SpecArtifactEntry.size?: number` is present in `packages/core/src/domain/entities/spec.ts:4-9`, correctly allowing non-filesystem adapters to omit it.
- `FsSpecRepository._buildSpec` performs one `fs.stat` per artifact and derives `filename`, `lastModified`, and `size` from that observation (`packages/core/src/infrastructure/fs/spec-repository.ts:1016-1024`).
- `artifactMeta` returns `{ lastModified, size }` without `includeHash` and adds `hash` only with `includeHash` (`packages/core/src/infrastructure/fs/spec-repository.ts:579-610`).
- Existing persisted-state, metadata-snapshot, index and fingerprint behavior is exercised by the broad repository suite and remained green.
- The implementation does not, however, visibly reuse a shared artifact stat/hash path; see discrepancy CORE-2.

### `core:spec-repository-port` — implemented

- The port-level `ArtifactMeta` shape requires `lastModified`, `size`, and optional `hash` (`packages/core/src/application/ports/spec-repository.ts:22-27`).
- `SpecArtifactEntry` exposes optional `size`, matching the merged cross-adapter rule.
- The abstract method roster still expresses semantic aggregate operations and does not reintroduce hash-only/field-wise methods.
- Direct and transitive consumers compiled and all Core tests passed.

### `core:create-change` — implemented

- `CreateChangeInput.explorationContent?: string` is public semantic input (`packages/core/src/application/use-cases/create-change.ts:26-43`).
- `execute` delegates non-empty content to `ChangeRepository.create(change, { explorationContent })`; otherwise it calls the one-argument form (`packages/core/src/application/use-cases/create-change.ts:149-154`).
- The application use case imports no filesystem module and never references `.specd-exploration.md`.
- The existing sequence (create, then scaffold, then optional best-effort overlap check) and all prior creation behavior remain intact.

### `core:change-repository-port` — implemented

- `CreateChangeStorageOptions`, `create(change, options?)`, `readExploration`, and `writeExploration` are declared on the port (`packages/core/src/application/ports/change-repository.ts:31-40,234-240`).
- `ChangeProps` and `Change` expose immutable metadata-only `explorationMeta`, returning a defensive copy (`packages/core/src/domain/entities/change.ts:214-223,273,317,353-356`).
- The port contains no filesystem filename or path knowledge.

### `core:fs-change-repository` — implemented

- The adapter alone owns `EXPLORATION_FILENAME = '.specd-exploration.md'` (`packages/core/src/infrastructure/fs/change-repository.ts:98`).
- `create` persists the manifest, writes non-empty exploration through `writeExploration`, and invokes repository deletion before rethrowing on exploration failure (`:661-675`).
- `readExploration` is lazy and returns `null` on ENOENT; `writeExploration` ignores empty content and uses `writeFileAtomic` (`:678-695`).
- `_manifestToChange` obtains exploration metadata through `_explorationMeta`; that helper only calls `fs.stat`, returns ISO mtime plus byte size, and returns `null` on ENOENT (`:1388,1507,1613-1630`).
- The filename remains absent from application/orchestration code in the audited Core scope.

## Discrepancies

### CORE-1 — MEDIUM — merged verification contradicts the merged `FsSpecRepository` requirement

Evidence:

- The merged `core:fs-spec-repository` requirement “SpecListEntry materialization in index” says the cached/public projection is `summary` plus Meta fields, that callers use `includeSummary` / `includeMeta`, and explicitly states: “`includeMetadataStatus` MUST NOT exist.”
- In the same merged spec's verification artifact, scenario “Index stores full CLI-usable SpecListEntry payload” still expects `metadataStatus`, and scenario “include flags project cached fields without extra reads” still invokes `list({ includeSummary: false, includeMetadataStatus: false })` and expects `metadataStatus` omission.
- Current code consistently uses `includeMeta` (`packages/core/src/application/ports/spec-repository.ts:65-66`; `packages/core/src/infrastructure/fs/spec-repository.ts:276,322`) and contains no production `includeMetadataStatus` surface.

Assessment: the implementation appears aligned with the normative requirement and newer dependency contracts; the verification artifact is stale spec drift. If `metadataStatus` was actually intended, then both the normative requirement and current implementation would need revision. As written, the two artifact sections cannot both be satisfied. This should be corrected in design before treating every merged scenario as passing.

### CORE-2 — MEDIUM — `artifactMeta` appears to implement a second stat/hash routine

Evidence:

- Both merged `core:fs-spec-repository` and `core:spec-repository-port` require `artifactMeta` to reuse the existing artifact stat/hash path and explicitly prohibit a second hashing implementation.
- `FsSpecRepository.artifactMeta` independently resolves the path, performs `fs.stat`, conditionally performs `fs.readFile`, and calls `sha256` inline (`packages/core/src/infrastructure/fs/spec-repository.ts:579-610`).
- `_buildSpec` separately performs `fs.stat` (`:1016-1024`), while normal artifact loading/hash consumers use other paths. No shared artifact observation helper is invoked by `artifactMeta`.
- Existing tests assert returned values but do not establish shared-path reuse.

Assessment: behavior is functionally correct, but the code structure conflicts with the explicit “reuse / not a second implementation” constraint. The likely implementation fix is one internal artifact observation primitive used by `_buildSpec`, `artifactMeta`, and hash-bearing access as appropriate. Alternatively, if behavioral equivalence rather than structural reuse is intended, the two specs should soften that wording.

### CORE-3 — LOW — tests do not prove the no-read/single-stat properties added for size stamps

Evidence:

- `packages/core/test/infrastructure/fs/spec-repository.spec.ts:193-198` checks the correct byte size from `get`, but the assertion/comment does not spy on file operations or prove that `lastModified` and `size` came from exactly one `stat` and no content read.
- `artifactMeta` tests validate shape/hash values (`:1243-1265`) but do not prove reuse of the same stat/hash path.

Assessment: source inspection shows `_buildSpec` currently satisfies the operational part, so this is a coverage weakness rather than a demonstrated runtime bug.

### CORE-4 — LOW — exploration tests incompletely prove laziness and atomic semantics

Evidence:

- `packages/core/test/infrastructure/fs/change-repository.spec.ts:140-169` verifies persisted content, metadata size, absence/empty behavior, and cleanup after a simulated write failure.
- The “lazily” test checks that the returned aggregate has no `explorationContent` property, but does not instrument `fs.readFile` to prove `get` never reads `.specd-exploration.md`.
- No direct test calls `writeExploration` and observes atomic replacement/failure behavior. Atomicity is inferred from its delegation to the already-used `writeFileAtomic` helper.
- `packages/core/test/application/use-cases/create-change.spec.ts:63-80` proves non-empty delegation, but does not explicitly exercise empty-string delegation behavior at the use-case boundary (ordinary no-exploration creation covers the absent case).

Assessment: implementation inspection supports compliance; targeted negative/instrumented tests would make the scenario evidence complete.

## Test Coverage

- Executed `pnpm --filter @specd/core test` during this audit: **195 test files passed, 2,374 tests passed**.
- `packages/core/test/application/use-cases/create-change.spec.ts` covers creation, schema identity, actor/history, uniqueness, seeding, overlap behavior, persistence/scaffolding, and the new non-empty exploration delegation.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts` covers the broad active/draft/discarded repository behavior plus exploration persistence, absence/empty handling, metadata exposure, lazy explicit read, and first-create cleanup on failure.
- `packages/core/test/infrastructure/fs/spec-repository.spec.ts` covers constructor/factory, index/list/get, persisted state, metadata snapshots, `artifactMeta`, fingerprinting, and the newly exposed byte sizes.
- Composition tests cover `createCreateChange` dependency/config wiring; port behavior is additionally exercised through use-case stubs and filesystem integration tests.
- All historical Core requirements remained regression-green, but a green suite cannot resolve CORE-1 because the contradictory scenario uses an API intentionally absent from current code.

## Missing Tests

1. Instrument `FsSpecRepository.get` to assert one `stat` observation supplies both `lastModified` and `size`, and that no artifact content read occurs while building stamps.
2. Refactor to a shared artifact observation primitive, then test `artifactMeta` through that seam (or otherwise prove shared stat/hash-path reuse) to cover CORE-2.
3. Instrument `FsChangeRepository.get`/`_manifestToChange` to prove exploration content is not read while metadata is populated.
4. Add a direct `writeExploration` integration test for non-empty atomic replacement and empty-content no-op behavior.
5. Add an application-level `CreateChange.execute({ explorationContent: '' })` test verifying the repository receives no exploration option.
6. After resolving CORE-1, replace the stale `metadataStatus/includeMetadataStatus` verification cases with `includeMeta`/public Meta assertions and ensure cached projection performs no extra I/O or hashing.

## Spec Dependency Chain

- All five specs depend on `default:_global/architecture`. The new code respects the dependency direction: the application use case and abstract ports contain no filesystem I/O; `.specd-exploration.md`, `fs.stat`, `fs.readFile`, and atomic writes remain in the filesystem adapter.
- `core:fs-spec-repository` directly depends on `core:spec-repository-port`, `core:composition`, `core:storage`, `core:spec-lock`, `core:spec-metadata`, and `core:spec-optimization`. The changed size contract is consistent between the port (cross-adapter optional `SpecArtifactEntry.size`, required present `ArtifactMeta.size`) and FS adapter (always populated from `stat`). CORE-2 is the sole implementation-level inconsistency with this chain.
- `core:create-change` directly depends on `core:change-repository-port`, `core:change`, `core:get-active-schema`, `core:spec-overlap`, and `core:composition-resolver`. It delegates exploration semantics through the port and preserves existing schema/overlap/composition contracts.
- `core:fs-change-repository` directly depends on `core:change-repository-port`, `core:composition`, `core:storage`, and `core:change-list-entry`. Exploration metadata is not serialized into list rows or manifests, so existing storage/index/list-entry contracts remain isolated.
- `core:change-repository-port` depends on repository/change/view/storage/manifest/list-entry/logging contracts. The added APIs are semantic and storage-neutral; loaded content remains opt-in, consistent with the pre-existing artifact-loading model.
- Project-wide `_global/testing` expects application/domain unit tests with mocked ports and filesystem adapter integration tests with real temporary storage. Both forms exist; CORE-3/CORE-4 identify assertion-depth gaps rather than missing test layers.
- No direct dependency contradiction was found apart from the internal merged verification drift in CORE-1.

## Summary counts

- Specs audited: **5**
- Normative requirements inspected: **80**
- Verification scenarios inspected: **240**
- Fully/substantially implemented specs: **5**
- Findings: **4** total
  - Critical: **0**
  - High: **0**
  - Medium: **2**
  - Low: **2**
- Demonstrated implementation discrepancy: **1** (CORE-2)
- Artifact/spec discrepancy: **1** (CORE-1)
- Test-coverage gaps: **2** (CORE-3, CORE-4)
- Core test result: **195/195 files and 2,374/2,374 tests passed**
