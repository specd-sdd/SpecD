# Spec Compliance Report — suggest-implementation-and-spec-deps

- Mode: change
- Timestamp: 20260824-211638
- Change state audited: verifying
- Specs audited: 12
- Requirements audited: 119
- Verification scenarios reviewed: 321
- Code correctness defects: 0
- Spec-level contradictions: 1 HIGH
- Test suites: Core, CLI, Code Graph, and SDK passed

## Executive summary

The implementation conforms to the intended design and all executed test suites pass. One actionable artifact contradiction remains in `sdk:composition`: the historical layer-structure requirement prohibits `application/` and `infrastructure/`, while the newly added suggestion-composition requirement explicitly requires application use cases and permits filesystem infrastructure assembled by composition. This must return to design before lifecycle completion.

## Detailed Findings

# Compliance Audit — CLI and SDK suggestion surfaces

## Scope and method

Change: `suggest-implementation-and-spec-deps`  
Specs: `cli:spec-implementation`, `cli:spec-deps`, `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`, `sdk:composition`.

The audit used each change spec's merged `changes spec-preview`, the project-wide directives (especially `default:_global/architecture`, `_global/testing`, `_global/conventions`, and `_global/error-handling-conventions`), and the declared direct dependencies at depth 1. Code discovery was graph-first (`graph stats`, `graph search`) and then confirmed against the implementation and tests. The graph was current and complete. No code or spec was modified.

## Requirements Summary

| Spec                               | Requirements | Verification scenarios | Status                                                                                 |
| ---------------------------------- | -----------: | ---------------------: | -------------------------------------------------------------------------------------- |
| `cli:spec-implementation`          |            9 |                     15 | Implemented                                                                            |
| `cli:spec-deps`                    |           10 |                     16 | Implemented                                                                            |
| `sdk:suggest-implementation-links` |            6 |                     17 | Implemented                                                                            |
| `sdk:suggest-spec-dependencies`    |            4 |                     14 | Implemented                                                                            |
| `sdk:composition`                  |            8 |                     16 | Implemented according to the new composition requirement, but internally contradictory |
| **Total**                          |       **37** |                 **78** | **37 implemented; 1 spec-level contradiction**                                         |

## Implementation Status

### `cli:spec-implementation`

All nine requirements are implemented in `packages/cli/src/commands/spec/implementation.ts`:

- `list`, `add`, `remove`, and `suggest` are registered as leaf commands, reject excess arguments, and accept structured formats.
- The persisted-state commands delegate to `kernel.specs.getPersistedImplementation` and `kernel.specs.updatePersistedImplementation`; the CLI passes raw file values and does not perform filesystem observation or canonical link mutation.
- Uninitialized output is distinct in text and includes `initialized` in structured output.
- `suggest` resolves the SDK composition facade, forwards all target/apply/cache/confidence options, renders confidence and `[already included]`/`[new]`, and documents the JSON/TOON response without executing the use case.
- Typed failures flow through the shared CLI error mapper, consistent with `cli:entrypoint` and the global machine-readable error convention.

### `cli:spec-deps`

All ten requirements are implemented in `packages/cli/src/commands/spec/deps.ts`:

- `list`, `add`, `remove`, `set`, `clear`, and `suggest` exist, reject excess arguments, and expose structured formats.
- Mutation commands map directly to the persisted dependency use case, including empty-set clearing and uninitialized remove no-op behavior.
- `suggest` calls the SDK facade and forwards `--apply`, `--create-change`, cache and targeting options.
- Text and structured results include existing/new status, mutation totals, canonical post-apply validation entries, and created alignment-change information.
- The alignment flag does not write exploration files in the CLI; creation and optional exploration content are delegated through the SDK/Core `CreateChange` contract.

### `sdk:suggest-implementation-links`

All six requirements are implemented in `packages/sdk/src/application/use-cases/suggest-implementation-links.ts`:

- Canonical input validation and typed errors cover target selection, workspace, spec identity, and confidence normalization.
- The three-tier analysis preserves Tier 1 when Tier 2 adds candidates and uses Tier 3 only as fallback; scoring, cache invalidation/rebuild, symbol differentiation, and path/token affinity are implemented.
- Existing links are marked using canonical files from persisted state.
- `apply` performs additive mutations only and propagates mutation failures.
- The application factory requires resolved ports, including a file observer; the module has no filesystem/config/composition imports.
- Progress events are emitted throughout discovery and analysis.

### `sdk:suggest-spec-dependencies`

All four requirements are implemented in `packages/sdk/src/application/use-cases/suggest-spec-dependencies.ts`:

- Target validation, workspace/spec errors, cache warm-up, import tracing, directional validation, transitive reduction, and cache ownership invalidation are present.
- Apply is additive and mutation failures propagate.
- Post-apply validation consumes canonical `ValidateSpecsResult.entries`, selects `!passed` entries, preserves failures and warnings, and propagates validator errors rather than fabricating `all-valid`.
- Missing validator dependencies fail before mutation.
- At most one optional alignment change is created through injected `CreateChange`; exploration content is passed into that use case and is not written directly by the SDK.
- The canonical dependency-injected factory and progress events are present.

### `sdk:composition`

The implementation satisfies the newly added suggestion-composition requirement:

- Each application use case has its own file under `src/application/use-cases/`.
- Concrete filesystem observers/caches are assembled only in `src/composition/` and the config facade delegates to the canonical `createX(deps)` application factory.
- The application modules have no `node:fs`, concrete cache, or config-path dependency.
- The SDK root exports curated use cases, types, ports, and composition factories, but not `FsImplementationSuggestionCache` or `FsSpecDepsSuggestionCache`.
- Package dependencies remain limited to Core and Code Graph, and the pre-existing curated barrel/import-policy requirements remain satisfied.

## Discrepancies

### D-1 — HIGH — `sdk:composition` contains mutually exclusive layer requirements

**Evidence**

- The merged pre-existing **Layer structure** requirement says the SDK source directories are limited to composition/orchestration/presentation/shared plus `index.ts`, and explicitly says the package “MUST NOT contain ... application ports, or infrastructure adapters” (`specs/sdk/composition/spec.md:13-23`). Its merged verification scenario still requires that no `infrastructure/` directory exist.
- The newly merged **Suggestion use-case composition** requirement requires the normal hexagonal topology, places each use case under `src/application/use-cases/`, and explicitly permits composition to construct SDK filesystem infrastructure and concrete caches.
- The implementation necessarily contains `src/application/use-cases/` and `src/infrastructure/fs/`; for example `packages/sdk/src/composition/suggest-implementation-links.ts:13-19` imports the concrete cache and application use case.
- `packages/sdk/test/composition/package-boundary.spec.ts:24-49` correctly tests the new topology, but does not and cannot satisfy the older “no infrastructure/application” scenario.

**Code interpretation**

The code follows the latest design decision and the global hexagonal architecture: application behavior is separate from composition, and filesystem details remain at the edge. Under that interpretation the old layer requirement/scenario is stale and should be replaced, not implemented.

**Spec interpretation**

If the historical Layer structure requirement remains authoritative, the current SDK directory structure and concrete infrastructure are non-compliant. Meeting it would undo the explicit new requirement and the agreed design. Therefore this cannot be repaired safely in code; the merged spec and verify artifact need reconciliation in design.

**Recommended resolution**

Update `sdk:composition` so its Layer structure requirement includes `application/` and `infrastructure/` with explicit dependency-direction constraints, and replace the obsolete “No infrastructure in SDK source tree” verification scenario with checks that infrastructure is not imported by application use cases and is not exported from the root barrel.

No other correctness discrepancy was found.

## Test Coverage

### Executed suites

- SDK: **13 files, 122 tests passed**.
- CLI: **80 files, 888 tests passed**.

The package scripts executed their complete package suites even when file arguments were supplied. There were no failures.

### Coverage assessment by spec

- `cli:spec-implementation`: strong behavioral coverage for delegation, uninitialized rendering, structured help, structured format, suggest forwarding, status tags, typed errors, and mutation/result rendering.
- `cli:spec-deps`: strong behavioral coverage for all persisted mutations, no-op semantics, structured help, suggest forwarding, status tags, validation rendering, uninitialized rendering, and read-only errors.
- `sdk:suggest-implementation-links`: strong unit coverage with mocked ports for targeting/errors, cache hashing/rebuild, additive mutation, propagation, existing marking, Tier 1/Tier 2 preservation, confidence normalization, and progress.
- `sdk:suggest-spec-dependencies`: strong unit coverage for warm-up/tracing, apply and failure propagation, canonical validation entries, optional change creation with exploration content, validator failure, cache ownership changes, directional validation, transitive reduction, targeting errors, and progress.
- `sdk:composition`: focused package-boundary tests prove concrete assembly stays in composition, application modules have no filesystem/composition imports, and concrete caches are absent from the root. Broader pre-existing SDK composition tests cover exports and host surfaces elsewhere in the package suite.

## Missing Tests

The following are coverage improvements, not observed implementation defects:

1. **MEDIUM / spec contradiction:** there is no passing test for the old `sdk:composition` scenario “No infrastructure in SDK source tree”; such a test would necessarily fail and conflict with the new scenario. This is resolved only by updating the spec/verify artifact (D-1).
2. **LOW:** CLI command tests do not individually exercise every typed error listed by both command specs at each leaf. Shared `handle-error` tests cover `ArtifactConflictError`, and leaf tests demonstrate the shared mapping path, but explicit per-command retry-message and workspace-boundary assertions would improve traceability.
3. **LOW:** the implementation-suggestion suite exercises cache rebuild and real content stamps, but an explicitly named assertion for the complete “fast-path without reindex when fresh” branch would map more directly to the scenario wording.
4. **LOW:** dependency cache tests cover persisted reuse, rebuild, and ownership invalidation; an explicit fixture with an obsolete cache schema/version would make the “version mismatch” scenario independently obvious.
5. **LOW:** a CLI test should assert `--create-change` forwarding plus rendering of the returned `createdChange` block in the same end-to-end command scenario. The SDK creation behavior itself is directly tested.

## Dependency Consistency

- `default:_global/architecture`: the new application/composition/infrastructure separation is consistent with the global hexagonal rule. The old `sdk:composition` layer prohibition is the inconsistent artifact (D-1).
- `_global/testing`: SDK application logic is unit-tested with injected/mocked ports; filesystem cache infrastructure has separate real-filesystem tests. CLI adapter behavior is tested at the command boundary.
- `_global/error-handling-conventions` and `cli:entrypoint`: command failures route through the shared formatter/error mapper; structured output/help is registered and leaf commands reject excess arguments.
- Core persisted implementation/dependency use-case dependencies: CLI does not duplicate normalization, validation, or persistence and delegates through Kernel/SDK boundaries.
- Code Graph symbol/traversal/language-adapter dependencies: SDK consumes the provider and graph port; application code does not instantiate filesystem or config infrastructure.
- `core:create-change`: dependency suggestions pass optional `explorationContent` to `CreateChange`; there is no SDK/CLI direct write, preserving repository-specific persistence behavior.
- `sdk:suggest-implementation-links` → `sdk:suggest-spec-dependencies`: the latter consumes the injected implementation-suggestion use case and retains application-layer dependency direction.
- Package dependency policy: `@specd/sdk` has only `@specd/core` and `@specd/code-graph` platform runtime dependencies; CLI consumes SDK rather than parallel Core/Code Graph runtime dependencies.

## Summary counts

| Category                        |  Count |
| ------------------------------- | -----: |
| Requirements audited            |     37 |
| Verification scenarios reviewed |     78 |
| Requirements implemented        |     37 |
| Code correctness defects        |      0 |
| Spec-level contradictions       | 1 HIGH |
| Additional test improvements    |  4 LOW |
| SDK tests passed                |    122 |
| CLI tests passed                |    888 |

**Overall:** The CLI and SDK implementation is functionally compliant with the intended new design and all executed tests pass. Verification should not silently dismiss D-1: `sdk:composition` must return to design so its old layer requirement/scenario is reconciled with the newly required application/infrastructure topology.

---

# Compliance Audit — Code Graph batch

Change: `suggest-implementation-and-spec-deps`  
Specs audited: `code-graph:language-adapter`, `code-graph:graph-store`  
Mode: full, merged spec/verification previews reviewed  
Result: **COMPLIANT**

## Requirements Summary

| Spec                          | Change requirement                                                | Expected behavior                                                                                                                                                                                                                                                               | Status      |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `code-graph:language-adapter` | Built-in Adapter Registry Composition Factory & Keyword Discovery | Composition factory registers TypeScript, Python, Go and PHP adapters; accepts custom adapters and `SpecdConfig`; all overloads return `AdapterRegistryPort`; composition and curated package entrypoints export it; adapters may expose keywords and registry aggregates them. | Implemented |
| `code-graph:graph-store`      | Symbol Query Workspace Scope                                      | `SymbolQuery.workspace` is optional and `findSymbols` restricts results to an exact, case-sensitive `<workspace>:` file-path prefix while treating `%` and `_` literally.                                                                                                       | Implemented |

Requirements reviewed: **2**. Merged verification scenarios reviewed: **3**.

## Implementation Status

### `code-graph:language-adapter`

- `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts` provides both required public overloads and the implementation signature as `AdapterRegistryPort`.
- The factory registers `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, and `PhpLanguageAdapter`, then registers each supplied custom adapter.
- `packages/code-graph/src/composition/index.ts` exports the factory. The curated `src/public.ts` and package `src/index.ts` surfaces also export it through the composition provider surface.
- `LanguageAdapter.keywords?(): readonly string[]` exists in the domain contract.
- `AdapterRegistryPort.getReservedKeywords(): Set<string>` exists in the port; the concrete registry aggregates unique keyword values from every registered adapter.
- Built-in extension and keyword behavior is exercised through the composition factory test, including `.ts`, `.py`, `.go`, `.php`, `class`, `def`, `func`, `interface`, and `async`.

### `code-graph:graph-store`

- `packages/code-graph/src/domain/value-objects/symbol-query.ts` declares `readonly workspace?: string`.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` adds a parameterized `substr(file_path, 1, length(?)) = ?` predicate with the exact `${workspace}:` prefix supplied as parameters.
- This implementation is case-sensitive and avoids SQL `LIKE`, so `%` and `_` retain literal meaning as required.
- The test-only in-memory GraphStore applies the equivalent JavaScript `startsWith(workspace + ':')` behavior, keeping the shared GraphStore contract backend-neutral.

## Discrepancies

No actionable discrepancies found.

| Severity | Evidence                                                                                                                   | Spec interpretation                                                                            | Code interpretation                                                                                | Assessment |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| None     | Factory overload declarations and implementation all return `AdapterRegistryPort`; composition/public exports are present. | Consumers depend on the registry port, not the concrete implementation.                        | The concrete instance remains internal to construction; the public static return type is the port. | Aligned.   |
| None     | SQLite uses `substr(...)=?`; contract and SQLite tests cover workspace separation, case, `_`, and `%`.                     | Workspace means an exact case-sensitive canonical prefix with SQL wildcards treated literally. | Equality on a parameterized substring supplies exactly those semantics.                            | Aligned.   |

The factory unit test checks `toBeInstanceOf(AdapterRegistry)` internally. This does not violate the public contract: the factory's declared type is still `AdapterRegistryPort`, and the assertion is confined to the package's internal test suite.

## Test Coverage

### Merged scenarios

1. **Built-in adapter registry factory creation and extension/keyword lookup — PASS**
   - `create-builtin-adapter-registry.spec.ts` statically assigns the factory result to `AdapterRegistryPort`.
   - It verifies built-in extensions, required representative keywords, custom adapter registration, and keyword deduplication.

2. **Factory is available from composition — PASS**
   - The test imports `createBuiltinAdapterRegistry` from `src/composition/index.ts`.
   - Static typing and the implementation imports confirm callers need no concrete registry import to use the returned value.

3. **Querying symbols scoped by workspace — PASS**
   - The reusable GraphStore contract inserts `core` and another workspace and verifies `findSymbols({ name: 'create*', workspace: 'core' })` returns only `core:` symbols.
   - SQLite-specific tests additionally verify exact case and literal underscore/percent behavior.

### Executed verification

Command:

`pnpm --filter @specd/code-graph test -- create-builtin-adapter-registry.spec.ts sqlite-graph-store.spec.ts graph-store.contract.ts`

The package test script executed the complete Code Graph suite: **55 test files passed, 682 tests passed**.

## Missing Tests

No scenario-level tests are missing.

Two low-priority strengthening opportunities exist, neither constituting a compliance defect:

- Add a direct factory unit test invoking the `SpecdConfig` overload. Existing composition/provider coverage and TypeScript checking exercise compatibility, but a named test would make this overload explicit.
- Add a package-boundary import test for the curated package entrypoint in addition to the existing composition-entrypoint import test. The export is present and compile-checked today.

## Dependency Consistency

### `code-graph:language-adapter`

- The new API respects the general adapter contract: language-specific data remains adapter-owned, while aggregation and construction occur at the registry/composition boundary.
- Returning `AdapterRegistryPort` is consistent with the global hexagonal architecture and with `code-graph:composition`: infrastructure instantiation occurs in composition, while consumers receive a domain port.
- No language-specific branch was added to generic resolution. Built-in adapter registration is a composition responsibility and does not weaken the adapter determinism or capability contracts.

### `code-graph:graph-store`

- Workspace filtering operates on the canonical workspace-prefixed `SymbolNode.filePath`, consistent with `code-graph:symbol-model` identity semantics.
- The change extends the storage-neutral `SymbolQuery` contract and implements matching semantics in both the SQLite backend and the in-memory contract fixture.
- It does not conflict with `default:_global/architecture`: the query type remains in domain/value objects and SQL remains in infrastructure.
- It does not alter staleness/generation semantics from `code-graph:staleness-detection` or node-family behavior from `code-graph:document-model`.
- One pre-existing prose detail in the base Graph Store query-method description lists other `SymbolQuery` fields but does not enumerate `workspace`; the merged change adds an explicit authoritative workspace-scope requirement, so there is no behavioral contradiction.

## Summary Counts

| Category                                      | Count |
| --------------------------------------------- | ----: |
| Requirements audited                          |     2 |
| Scenarios audited                             |     3 |
| Requirements implemented                      |     2 |
| Scenarios passing                             |     3 |
| Actionable discrepancies                      |     0 |
| Critical                                      |     0 |
| High                                          |     0 |
| Medium                                        |     0 |
| Low                                           |     0 |
| Missing scenario tests                        |     0 |
| Non-blocking test-strengthening opportunities |     2 |

**Batch conclusion:** both Code Graph change specs are implemented, tested, and consistent with their global and depth-1 dependency contracts.

---

# Core compliance audit

## Scope and method

Change: `suggest-implementation-and-spec-deps`

Audited merged previews for:

- `core:fs-spec-repository` — 8 requirements, 33 scenarios
- `core:spec-repository-port` — 19 requirements, 63 scenarios
- `core:create-change` — 13 requirements, 35 scenarios
- `core:change-repository-port` — 29 requirements, 82 scenarios
- `core:fs-change-repository` — 11 requirements, 27 scenarios

Total reviewed surface: **80 requirements and 240 verification scenarios**. The review used merged `spec-preview` output, the current graph (fresh, complete, schema-compatible), implementation diffs and graph-resolved symbols. Direct dependency consistency was checked against `default:_global/architecture`, `core:composition`, `core:storage`, `core:spec-lock`, `core:spec-metadata`, `core:spec-optimization`, `core:change-list-entry`, and the mutual port/adapter dependencies in this batch.

Targeted execution:

```text
pnpm --filter @specd/core exec vitest run \
  test/application/use-cases/create-change.spec.ts \
  test/infrastructure/fs/change-repository.spec.ts \
  test/infrastructure/fs/spec-repository.spec.ts

Test Files  3 passed (3)
Tests       216 passed (216)
```

## Requirements Summary

### `core:fs-spec-repository`

All eight merged requirements are implemented: constructor/schema validation; storage factory; `FsSpecIndexCache` delegation and freshness; complete indexed list projection; metadata-only `get`; aggregate persisted-state serialization; metadata snapshot persistence; and physical Meta/fingerprint observations. The change-specific additions are present: `get()` supplies artifact `size`, and `artifactMeta()` returns `lastModified` plus `size` while keeping `hash` opt-in. Both use the same `_observeArtifact` path.

### `core:spec-repository-port`

All nineteen port requirements remain represented in the abstract port/domain model. `SpecArtifactEntry.size` is optional at the cross-adapter boundary, while `ArtifactMeta.size` is required for a returned observation. This matches the merged language: adapters without cheap metadata may omit the former, while `artifactMeta` observations include size. Existing repository operations, confinement, conflict, persisted-state and metadata-snapshot contracts remain intact.

### `core:create-change`

All thirteen requirements are represented. `CreateChangeInput` accepts optional `explorationContent`; `CreateChange.execute` forwards only non-empty content as semantic creation data to `ChangeRepository.create`; it performs no filesystem/path work. Existing identity, schema, history, dependency seeding, persistence/scaffolding and overlap behavior remain unchanged.

### `core:change-repository-port`

All twenty-nine requirements are represented by the abstract `ChangeRepository` and domain `Change`. The port accepts optional first-create exploration data and exposes lazy `readExploration`/`writeExploration`. `Change.explorationMeta` exposes only a defensive metadata snapshot (`lastModified`, `size`), not content or a filesystem filename. Existing mutation, listing, path-confinement and artifact contracts remain compatible.

### `core:fs-change-repository`

All eleven requirements are implemented. The adapter stores exploration at the private `.specd-exploration.md` path, atomically writes non-empty content, lazily reads it, stats it during aggregate hydration, and removes the first-created change on exploration-write failure. Existing index, manifest, mutation/reconciliation and `saveArtifact` rules remain in place.

## Implementation Status

| Spec                          | Status      | Primary evidence                                                                                                                |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `core:fs-spec-repository`     | Implemented | `packages/core/src/infrastructure/fs/spec-repository.ts`: `artifactMeta`, `_buildSpec`, `_observeArtifact`                      |
| `core:spec-repository-port`   | Implemented | `packages/core/src/application/ports/spec-repository.ts`; `packages/core/src/domain/entities/spec.ts`                           |
| `core:create-change`          | Implemented | `packages/core/src/application/use-cases/create-change.ts`: `CreateChangeInput`, `execute`                                      |
| `core:change-repository-port` | Implemented | `packages/core/src/application/ports/change-repository.ts`; `packages/core/src/domain/entities/change.ts`                       |
| `core:fs-change-repository`   | Implemented | `packages/core/src/infrastructure/fs/change-repository.ts`: `create`, `readExploration`, `writeExploration`, `_explorationMeta` |

## Discrepancies

**No actionable specification/implementation discrepancies found.**

The two plausible interpretations checked most closely were:

1. **“First-create failure semantics” could require one physical transaction.** The code first persists the manifest, then exploration, and compensates by calling `delete` if exploration fails. The merged spec defines the observable guarantee—creation fails and `get` cannot observe a partial change—not a single filesystem syscall/transaction. The failure test confirms the required observable outcome. Therefore this is compliant, not a discrepancy.
2. **“Non-empty content” could mean non-whitespace after trimming.** Both use case and adapter treat any `length > 0` string as non-empty. The spec says absent, `undefined`, or empty content; it does not require trimming. The implementation follows the literal contract. If product intent later treats whitespace-only content as absent, the spec and code should change together.

Severity counts: Critical 0, High 0, Medium 0, Low 0.

## Test Coverage

Change-specific coverage is strong:

- `CreateChange` verifies forwarding non-empty exploration content to the repository and reading it back through the semantic port.
- `FsChangeRepository` verifies initial persistence, metadata-only hydration, explicit lazy read, absence/empty behavior, and cleanup after an injected exploration-write failure.
- `FsSpecRepository` verifies `get()` byte size, default `artifactMeta` without hash, opt-in hash, and absence.
- The targeted Core suite passed all 216 tests, preserving coverage of the substantial pre-existing merged port/adapter requirements.

The implementation itself provides direct structural evidence for constraints not easy to observe from black-box tests: `_explorationMeta` calls `fs.stat` rather than `readFile`; `_observeArtifact` performs one `stat` and reads only when `includeHash` is true; the application use case imports and calls only the repository port; the private exploration filename exists solely in the FS adapter.

## Missing Tests

No missing test blocks completion, but three narrow assertions would improve regression precision:

1. **Low — exact no-read assertion for change hydration.** The FS change test checks that the aggregate lacks `explorationContent`, but does not spy on `fs.readFile` to prove `get()` never reads `.specd-exploration.md`. Code inspection confirms `_explorationMeta` uses only `fs.stat`.
2. **Low — direct `writeExploration` behavior.** Initial-create persistence exercises it indirectly; there is no focused test that a later `writeExploration` atomically replaces content, rejects a missing change, and no-ops for empty content. The implementation is straightforward and uses `writeFileAtomic`.
3. **Low — exact single-stat assertion for spec metadata.** Tests validate the resulting `size`, but do not instrument `fs.stat` to prove `lastModified` and `size` came from exactly one call. Code inspection confirms both derive from the single local `stat` result in `_observeArtifact`.

These are test-hardening opportunities, not observed correctness defects.

## Dependency Consistency

- **Global architecture:** compliant. `CreateChange` uses the application port only; filesystem behavior stays in infrastructure. The domain remains I/O-free. Manual constructor injection is preserved.
- **Composition:** no new adapter construction or public concrete-adapter exposure is introduced. `CreateChange` remains a use case wired through existing composition semantics.
- **Port ↔ FS adapter:** consistent. The semantic exploration contract does not expose `.specd-exploration.md`; the filename is adapter-private. `ExplorationMeta` is cheap observation data only.
- **Storage/index contracts:** cleanup calls repository deletion, so a failed exploration write does not leave an active manifest or stale observable list entry. Exploration writes themselves do not alter manifest/list projections.
- **Spec lock / metadata / optimization contracts:** adding artifact byte size does not alter persisted semantic state, fingerprints, lock serialization or generated metadata freshness. Hash remains opt-in and generated metadata remains excluded from `specFingerprint`.
- **Change list entry contracts:** exploration metadata/content is not projected into list entries, consistent with lazy aggregate loading.

No dependency contradictions or package-direction violations were found.

## Summary counts

| Measure                         | Count |
| ------------------------------- | ----: |
| Specs audited                   |     5 |
| Requirements reviewed           |    80 |
| Verification scenarios reviewed |   240 |
| Fully implemented specs         |     5 |
| Partially implemented specs     |     0 |
| Unimplemented specs             |     0 |
| Correctness discrepancies       |     0 |
| Dependency inconsistencies      |     0 |
| Targeted tests passed           |   216 |
| Test-hardening opportunities    |     3 |

**Conclusion:** the five Core specs are compliant with the current implementation. There are no actionable correctness defects; only three low-priority opportunities to make the tests prove internal I/O-efficiency properties more directly.
