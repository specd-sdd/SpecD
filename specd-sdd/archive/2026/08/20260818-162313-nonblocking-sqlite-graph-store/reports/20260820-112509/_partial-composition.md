# Spec Compliance Partial Report — `code-graph:composition`

- **Change:** `nonblocking-sqlite-graph-store`
- **Spec audited:** `code-graph:composition`
- **Mode:** change (active change spec, merged preview)
- **Audit date:** 2026-08-20
- **Auditor mode:** read-only (no code or spec files modified)

---

## Scope & Method

- Spec content read via `node packages/cli/dist/index.js changes spec-preview nonblocking-sqlite-graph-store code-graph:composition` (merged spec.md + verify.md with deltas applied).
- Base (unmerged) spec read from `specs/code-graph/composition/spec.md` to confirm delta application.
- Deltas inspected directly at `specd-sdd/changes/20260818-162313-nonblocking-sqlite-graph-store/deltas/code-graph/composition/spec.md.delta.yaml` and `verify.md.delta.yaml`.
- Implementation inspected under `packages/code-graph/src/` (composition, public barrel, errors, runtime descriptor, package.json).
- Tests run:
  ```
  pnpm --filter @specd/code-graph exec vitest run test/barrel.spec.ts test/composition/ test/application/use-cases/get-change-spec-coverage.spec.ts
  ```
  Result: **5 test files passed, 38 tests passed** (barrel 10, host-use-case-factories 4, create-sqlite-graph-store-factory 5, code-graph-provider 17, get-change-spec-coverage 2). No ERR_IPC_CHANNEL_CLOSED unhandled rejection appeared in this run.
- Dependency specs existence verified via `specs list`; global project context via `project context`.

---

## Requirements Summary

### Requirement 1: CodeGraphProvider facade

**Verdict: SATISFIED**

The `CodeGraphProvider` interface in `packages/code-graph/src/composition/code-graph-provider.ts:104-193` declares the full public surface: indexing (`index`), querying (`getSymbol`, `findSymbols`, `getFile`, `getDocument`, `findFilesByConfigRelativePath`, `findDocumentsByConfigRelativePath`, `getSpec`, `getSpecDependencies`, `getSpecDependents`, `getCoveredFiles`, `getCoveringSpecsForFile`, `getCoveredSymbols`, `getCoveringSpecsForSymbol`, `getStatistics`), search (`searchSymbols`, `searchSpecs`, `searchDocuments`), maintenance (`clear`), traversal (`getUpstream`, `getDownstream`), impact (`analyzeImpact`, `analyzeFileImpact`, `analyzeFilesImpact`, `analyzeSpecImpact`, `detectChanges`, `getHotspots`), selector normalization (`resolveFileSelector`, `resolveSymbolSelector`), and lifecycle (`open`, `close`).

- Delegation to `GraphStore` confirmed: `code-graph-provider.ts:315-318` (`findSymbols` → `this.store.findSymbols`), `478-481` (`getSpec` → `this.store.getSpec`), etc. All query methods delegate to `this.store.*`.
- `getSpec` returns `Promise<SpecNode | undefined>` (`code-graph-provider.ts:118`), satisfying "returns undefined when spec not indexed".
- `index` runs `IndexCodeGraph` (`this.indexer.execute`) and owns force-reset/lock policy via `withIndexLock` + `store.recreate()` when `options.force` (`code-graph-provider.ts:288-298`).
- `clear()` preserves lifecycle contract, wrapped in the index lock (`code-graph-provider.ts:788-794`).
- `CodeGraphProvider` is a type-only public interface; `CodeGraphProviderImpl` (concrete class, constructor, `GraphStore`, `IndexCodeGraph` inputs) stays internal to the package (`code-graph-provider.ts:198`, exported only within composition, never from `public.ts`).

**Test coverage:** `test/composition/code-graph-provider.spec.ts` — instantiation with SQLite default (41), Ladybug (52), explicit sqlite (64), `StoreNotOpenError` before open (78), indexing delegation (119), SpecdConfig factory (154), idempotent close (169), clear keeps store ready (180), stale generation error (202), async disposal (223), batch resolution (236), exact binding lookup (257), unified search (334), file-filter normalization (371), schema-incompatible repair (407). **Coverage adequate.**

---

### Requirement 2: Factory function

**Verdict: SATISFIED**

`createCodeGraphProvider` in `packages/code-graph/src/composition/create-code-graph-provider.ts:49-101`:

1. Derives storage root from `config.configPath` (line 53) when `SpecdConfig`, else `options.storagePath`.
2. Resolves backend id via `options.graphStoreId ?? DEFAULT_GRAPH_STORE_ID` (`'sqlite'`, line 22/57).
3. Merges registry: `createGraphStoreRegistry` (lines 119-130) merges `BUILTIN_GRAPH_STORE_FACTORIES` (ladybug + sqlite, lines 32-35) with additive `graphStoreFactories`, rejecting collisions with `GraphStoreRegistryError`.
4. Creates the concrete `GraphStore` from the registry (line 63).
5. Creates `AdapterRegistry` and registers built-in adapters TypeScript, Python, Go, PHP (lines 65-69).
6. Registers additive `options.adapters` (lines 71-73).
7. Creates `IndexCodeGraph` with store + registry (line 75).
8. Returns `CodeGraphProvider` (line 100).

- Overload detection via `isSpecdConfig` (`'configPath' in options && 'workspaces' in options`, lines 108-110).
- Default backend id is `sqlite`; `ladybug` only when explicitly selected — confirmed.
- Factory creation is synchronous — the function returns a provider without `await`; native loading/worker startup happens in `open()` (verified: `createSqliteGraphStoreFactory` returns a plain factory object, `create-sqlite-graph-store-factory.ts:21-32`; `SQLiteGraphStore` constructor is sync, `open()` is the async boundary).
- Runtime SQLite config crosses the worker boundary as a serializable descriptor `SqliteRuntimeDescriptor` (`modulePath`), `sqlite-runtime-descriptor.ts:7-10`.
- `CodeGraphProvider` type-only; no provider constructor exported from `"."` (barrel test asserts `'CodeGraphProvider' in publicModule` is false, `barrel.spec.ts:77-83`).
- `CodeGraphCompositionOptions` supports the same additive model as `CodeGraphOptions` (`graph-store-factory.ts:28-35`).

**Test coverage:** `code-graph-provider.spec.ts:41-117` (default/sqlite/ladybug/custom store factory), `154-167` (SpecdConfig factory derives storage root). `create-sqlite-graph-store-factory.spec.ts:23-72` (openable default store, runtime `modulePath` plumbed through to worker during `open`, invalid `maxPendingOperations` rejects with `InvalidGraphStoreConfigurationError` at open, non-loadable module fails open, worker path resolution). Factory-only construction covered by `barrel.spec.ts:77-83`. **Coverage adequate.**

---

### Requirement 3: Package exports

**Verdict: SATISFIED**

`packages/code-graph/src/public.ts` exports the curated surface; verified against the merged spec's list:

- **Composition & wiring:** `createCodeGraphProvider` (line 2), type-only `CodeGraphProvider` (18), `CodeGraphCompositionOptions` (12), `CodeGraphOptions` (13), `GraphStoreFactory` (14), `GraphStoreFactoryOptions` (15), `createSqliteGraphStoreFactory` (4), `SqliteRuntimeDescriptor` (8), **`SQLiteGraphStoreOptions` (line 9, capital L)**. ✅
- **Host use cases:** `GetGraphHealth` (26), `GetGraphHealthInput` (27), `GetGraphHealthResult` (28), `createGetGraphHealth` (31), `IndexProjectGraph` (33), `IndexProjectGraphInput` (34), `createIndexProjectGraph` (36), `GetSpecCoverage` (38), `GetSpecCoverageInput` (39), `GetSpecCoverageResult` (40), `createGetSpecCoverage` (42), `GetChangeSpecCoverage` (44), `GetChangeSpecCoverageInput` (45), `GetChangeSpecCoverageResult` (46), `createGetChangeSpecCoverage` (48). ✅
- **VCS & Config:** `buildProjectGraphConfig` (191), `createBootstrapGraphConfig` (188), `GraphConfigOverrides` (192). ✅
- **Indexer & Discovery:** `IndexOptions` (111), `IndexProgressCallback` (112), `ProjectGraphConfig` (113), `WorkspaceIndexTarget` (114), `DiscoveredSpec` (115), `IndexResult` (118), `IndexError` (119), `WorkspaceIndexBreakdown` (120), `DiscoverFilesOptions` (169), `DEFAULT_EXCLUDE_PATHS` (168). ✅
- **Traversal & Impact:** `TraversalOptions` (126), `TraversalResult` (127), `ImpactResult` (131), `FileImpactResult` (132), `ChangeDetectionResult` (134), `RiskLevel` (135), `analyzeFilesImpact` (176). ✅
- **Hotspots:** `DEFAULT_HOTSPOT_KINDS` (137), `HotspotEntry` (138), `HotspotOptions` (139), `HotspotResult` (140). ✅
- **Search:** `SearchOptions` (144), `expandSymbolName` (173), `expandSearchQuery`/`expandSearchToken` (174). ✅
- **Staleness & Fingerprint:** `isGraphStale` (175), `computeGraphFingerprint` (178), `computeRootFingerprint` (179), `computeWorkspaceFingerprint` (180), `parseFingerprintMap` (181), `serializeFingerprintMap` (182), `detectFingerprintMismatch` (183), `GraphFingerprintInput` (184). ✅
- **Language Adapter:** `LanguageAdapter` (71). ✅
- **Model/Vocabulary:** `FileNode` (62), `DocumentNode` (63), `SymbolNode` (64), `SpecNode` (65), `Relation` (66), `SymbolKind` (67), `RelationType` (68), `SymbolQuery` (69), `GraphStatistics` (70), `ImportDeclaration` (72), `ImportDeclarationKind` (73), `SourceLocation` (74), `BindingScopeKind` (98), `BindingSourceKind` (99), `BindingScope` (100), `BindingFact` (101), `CallForm` (104), `CallFact` (105), `ResolvedDependency` (106). ✅
- **Errors:** `SpecdCodeGraphError` (195) and subclasses incl. `StoreNotOpenError` (201), `InvalidSymbolKindError` (196), `InvalidRelationTypeError` (197), `DuplicateSymbolIdError` (198), `SpecNotFoundError` (202), `GraphProviderStaleError` (200), `StoreOverloadError` (203), `StoreWorkerError` (204), **`BulkSessionStateError` (205), `InvalidGraphStoreConfigurationError` (206), `GraphSchemaIncompatibleError` (207)**. ✅
- **Version:** `CODE_GRAPH_VERSION` (212). ✅

- Lock-management helpers (`acquireGraphIndexLock`, `getGraphIndexLockPath`) and provider-internal recreation/reset helpers are **NOT** exported from `"."` — they appear only in `src/index.ts:227` (internal barrel). ✅
- The following are exported only from `"./internal"` (`src/index.ts`), not `"."`: `InMemoryIndexSession` (index.ts:139), `SQLiteGraphStore` (25), `LadybugGraphStore` (26), `AdapterRegistry` (27), built-in language adapters (28-31), `ResolveSymbolReference` (58), `normalizeFileSelectorPath` (193), lock helpers (227). ✅ Verified by `barrel.spec.ts:43-75`.
- `public.ts` uses explicit named exports only — no unrestricted `export *` of infrastructure modules. ✅

**Test coverage:** `test/barrel.spec.ts` — 10 tests covering CODE_GRAPH_VERSION (35), `InMemoryIndexSession` internal-only (43), concrete store adapters internal-only (49), `ResolveSymbolReference` internal-only (69), `CodeGraphProvider` type-only (77), logical-symbol types (85), graph-store composition surface incl. `SQLiteGraphStoreOptions` (98), language adapter + model vocabulary (117), host use-case factories named exports (125), typed SQLite errors with stable codes (144). **Coverage adequate.**

---

### Requirement 4: Public and internal entry points

**Verdict: SATISFIED**

`packages/code-graph/package.json` `exports` (lines 22-31):

- `"."` → `./dist/public.js` / `./dist/public.d.ts`
- `"./internal"` → `./dist/index.js` / `./dist/index.d.ts`

`src/public.ts` is the curated `"."` barrel; `src/index.ts` is the full `"./internal"` barrel (includes indexer internals, store adapter symbols, `InMemoryIndexSession`). The `"."` barrel uses explicit re-exports, not unrestricted `export *`.

**Test coverage:** `barrel.spec.ts:43-75` (InMemoryIndexSession + concrete adapters only on internal), and package.json exports inspected directly (no automated test asserts the exports map beyond the barrel smoke tests — acceptable as a package-manifest fact verified in this audit). **Coverage adequate.**

---

### Requirement 5: Lifecycle management

**Verdict: SATISFIED**

- Explicit lifecycle: no auto-open/auto-close. `CodeGraphProviderImpl.open()` (code-graph-provider.ts:233-241) and `close()` (266-274) are guarded by `_isOpen`; `close()` is idempotent (returns early when already closed). `[Symbol.asyncDispose]` delegates to `close()` (279-281).
- Methods call `assertAvailable()`/`assertProviderOpen()` and throw `StoreNotOpenError` when not open (lines 906-935).
- `open()` is the async boundary where backend readiness happens (`store.open()`), consistent with deferred worker startup / schema preparation.
- Provider-owned indexing locks (`withIndexLock`, lines 942-952) and `recreate()`/force-reset remain internal.

**Test coverage:** `code-graph-provider.spec.ts:78` (method before open → `StoreNotOpenError`), `169-178` (close idempotent — double close resolves without error), `223-234` (async dispose → subsequent call throws `StoreNotOpenError`). `sqlite-graph-store.spec.ts` and `sqlite-worker-lifecycle.spec.ts` (outside this run) cover worker/connection termination. The verify scenario "method after close throws (`analyzeImpact`)" is not tested by a literal `analyzeImpact` call, but the same availability gate (`assertAvailable`) is exercised via `getStatistics` after close (line 86) and after dispose (233). **Minor gap:** no direct post-close `analyzeImpact` test; indirect coverage only. Rated adequate overall.

---

### Requirement 6: Dependency on @specd/core

**Verdict: SATISFIED**

- `packages/code-graph/package.json:17` lists `"@specd/core": "workspace:*"` as a runtime dependency.
- `createCodeGraphProvider` accepts `SpecdConfig` from `@specd/core` (`create-code-graph-provider.ts:1, 50, 108-110`) and derives `storagePath` only; the provider is stateless (does not cache config).
- `SpecdError` from `@specd/core` is the base of `SpecdCodeGraphError` (`specd-code-graph-error.ts:1,6`).

**Test coverage:** `code-graph-provider.spec.ts:154-167` (factory from `SpecdConfig`, open + query + close). Dependency declaration verified in package.json. **Coverage adequate.**

---

### Requirement 7: Host use cases

**Verdict: SATISFIED**

- Composition factories exist for all four: `createGetGraphHealth` (`composition/use-cases/get-graph-health.ts:9-11`), `createIndexProjectGraph` (`index-project-graph.ts:8-10`), `createGetSpecCoverage` (`get-spec-coverage.ts:8-10`), `createGetChangeSpecCoverage` (`get-change-spec-coverage.ts:11-15`).
- All four are named exports of `"."` (`public.ts:31,36,42,48`) and of `"./internal"` (`index.ts:40,45,51,57`).
- Each factory returns stateless instances; use cases accept an already-open provider and do not open/close it (verified against dependent specs `code-graph:get-graph-health`, `index-project-graph`, `get-spec-coverage`, `get-change-spec-coverage`).
- Use cases do not replace provider search/hotspot/impact/traversal methods — those remain facade delegates.

**Test coverage:** `host-use-case-factories.spec.ts` (4 tests: statelessness of each factory + delegation of injected `GetSpecCoverage` in `createGetChangeSpecCoverage`), `barrel.spec.ts:125-142` (named exports), `get-change-spec-coverage.spec.ts` (2 tests: manifest-order aggregation + `ChangeNotFoundError`). **Coverage adequate.**

---

### Requirement 8: Symbol-reference provider surface

**Verdict: SATISFIED**

- `CodeGraphProvider` exposes single + batch resolution (`resolveSymbolReference`, `resolveSymbolReferences` — `code-graph-provider.ts:127-134, 598-654`) delegating to `ResolveSymbolReference` under `assertAvailable()`.
- Exact public-binding lookup `getExactPublicBinding(ExactPublicBindingSelector)` returns binding + declarations via `store.findPublicBindings` + `store.findDeclarations` — bypasses ranked/paginated search (`code-graph-provider.ts:135-137, 661-680`).
- Selector resolution distinguishes resolved/ambiguous/missing outcomes via `ResolvedSymbolSelectorResult` union and bounds ambiguity candidates (`MAX_AMBIGUITY_CANDIDATES = 10`, `resolve-graph-selector.ts:35-44`).
- Curated `"."` surface exports resolver input/result/status/reason/provenance types and factories (logical-symbol, public-binding, coverage vocabulary): `SymbolSpace`, `MemberForm`, `createLogicalSymbol`, `createPublicBinding`, `ResolutionStatus`, `SymbolResolutionResult`, etc. (`public.ts:75-95`).
- Concrete `ResolveSymbolReference` implementation is **not** exported from `"."` (only `index.ts:58` internal). Verified by `barrel.spec.ts:69-75`.

**Test coverage:** `code-graph-provider.spec.ts:236` (batch resolution under open provider), `257-332` (exact public binding lookup across 25 pages of same-name bindings; asserts `searchSymbols` spy NOT called). `barrel.spec.ts:69` (resolver internal-only). **Coverage adequate.**

---

### Requirement 9: Code Graph-orchestrated search surface

**Verdict: SATISFIED**

- `CodeGraphProvider.search(input: SearchCodeGraphInput)` — one multi-category operation (symbols/files/specs/documents, filters, limit, snippet) delegating to `SearchCodeGraph` (`code-graph-provider.ts:178, 852-868`).
- Exact file-filter normalization: provider resolves config-relative/absolute selectors to one canonical file and sets `exactFile: true`; wildcard patterns stay patterns (`hasWildcard`, `code-graph-provider.ts:852-868, 1027-1029`).
- Application use case `SearchCodeGraph` executes the unified lanes, suppresses duplicates, groups, ranks, caps, applies limits (implementation in `application/use-cases/search-code-graph.js`).
- Curated `"."` exports unified search input/result and source-match value objects: `SearchCategory`, `SearchCodeGraphInput`, `SearchCodeGraphResult`, `SourceContentMatch`, `SourceFileSearchResult`, `SourceSearchMatchKind`, `SourceSearchSnippet` (`public.ts:145-160`). Backend candidate helpers remain internal.

**Test coverage:** `code-graph-provider.spec.ts:334-369` (unified search across categories — returns one deterministic projection), `371-405` (exact config-relative file filter returns every retained occurrence — 15/15 matches). **Coverage adequate.**

---

## Implementation Status

Overall: **9 of 9 requirements satisfied.** No requirement is partial or unsatisfied at the code level. The change's implementation (`createSqliteGraphStoreFactory`, `SQLiteGraphStoreOptions`, typed errors, host use-case factories, public/internal barrels, StubChangeRepository tests) is present, exported, and tested.

---

## Discrepancies

### D1 — Spec signature drift: `resolveSymbolSelector` return type (minor, pre-existing)

- **Spec (merged + base):** `resolveSymbolSelector(selector: string): Promise<ResolvedSymbolSelector[]>` (`specs/code-graph/composition/spec.md:21`).
- **Code:** `resolveSymbolSelector(input: string): Promise<ResolvedSymbolSelectorResult>` (`code-graph-provider.ts:117`), where `ResolvedSymbolSelectorResult` is a status-tagged union `resolved | ambiguous | missing` (`resolve-graph-selector.ts:35-42`).
- **Assessment:** The code is richer and satisfies the separate "Selector resolution SHALL distinguish unique, ambiguous, and missing outcomes" requirement (Requirement 8) better than the literal facade signature. This drift pre-dates the current delta (the delta does not modify the facade section). Recommendation: align the facade line in the spec to `Promise<ResolvedSymbolSelectorResult>` for accuracy. **Not a blocking discrepancy for this change** — the new implementation does not regress it.

### D2 — `SqliteGraphStoreFactoryOptions` is exported from `"."` but not named in the spec's export list (minor)

- **Code:** `public.ts:5` exports `type SqliteGraphStoreFactoryOptions` from `create-sqlite-graph-store-factory.ts:8`.
- **Spec:** The Composition & wiring list names `GraphStoreFactoryOptions` and `SQLiteGraphStoreOptions` but not `SqliteGraphStoreFactoryOptions`.
- **Assessment:** The spec's wording "plus any other types explicitly required by dependent specifications" and the composition types being integral to `createSqliteGraphStoreFactory` make this a reasonable additive export; the factory's own options type being public is coherent. Either document it in the spec list or note it as an intentional additive export. **Non-blocking; flagging for completeness.**

### D3 — `verify.md` uses `SqliteRuntimeDescriptor` naming in scenario (consistent), but `spec-preview` shows capital-L consistency only in `SQLiteGraphStoreOptions` — no lower-case `SqliteGraphStoreOptions` anywhere in code or merged spec. ✅ Confirmed the audit-fix objective: no code change to lowercase `SqliteGraphStoreOptions` is needed; the code and merged spec both use `SQLiteGraphStoreOptions`. (Not a discrepancy — recorded for audit-fix verification.)

---

## Recent Audit Fixes — Verification

1. **`SQLiteGraphStoreOptions` (capital L):** ✅ Confirmed. Interface defined at `infrastructure/sqlite/sqlite-runtime-descriptor.ts:15`; re-exported as `SQLiteGraphStoreOptions` from `public.ts:9` and `index.ts:9`. No lowercase `SqliteGraphStoreOptions` exists in `src/` or `test/` (grep verified). Merged spec delta list uses `SQLiteGraphStoreOptions` (`spec.md.delta.yaml:56`). Code was NOT changed to lowercase; spec was corrected to match.
2. **"SHALL export only" clarified:** ✅ Confirmed. Base spec line 73 reads "SHALL export only:"; the delta (`spec.md.delta.yaml:54`) replaces it with "SHALL export the listed public surface, **plus any other types explicitly required by dependent specifications**". Merged preview reflects the clarified wording.
3. **Errors export list includes the three new typed errors:** ✅ Confirmed. Delta `spec.md.delta.yaml:66` lists `BulkSessionStateError`, `InvalidGraphStoreConfigurationError`, `GraphSchemaIncompatibleError`; `public.ts:205-207` and `index.ts:224-226` export them with codes `BULK_SESSION_STATE` / `INVALID_GRAPH_STORE_CONFIGURATION` / `GRAPH_SCHEMA_INCOMPATIBLE` (`bulk-session-state-error.ts:13-15`, `invalid-graph-store-configuration-error.ts:12-14`, `graph-schema-incompatible-error.ts:12-14`). Tested in `barrel.spec.ts:144-151`.
4. **Public-barrel smoke tests:** ✅ Confirmed. `test/barrel.spec.ts` asserts importability of `GraphStoreFactory`, `GraphStoreFactoryOptions`, `CodeGraphOptions`, `CodeGraphCompositionOptions`, `SqliteRuntimeDescriptor`, `SQLiteGraphStoreOptions`, `createSqliteGraphStoreFactory`, `LanguageAdapter`, `SymbolKind`, `RelationType`, `SpecNotFoundError` (`SPEC_NOT_FOUND` code — `barrel.spec.ts:150`; `specId` getter covered separately in `sqlite-worker-lifecycle.spec.ts:356-369`), and host use-case factories as named exports (`barrel.spec.ts:125-142`).
5. **ADR-0025:** ✅ Confirmed. `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md` exists (MADR format, `### Confirmation`, `### Spec` links); linked from the merged spec's ADRs section (`spec.md.delta.yaml:97-99`); relative link resolves correctly from `specs/code-graph/composition/` to `docs/adr/0025-nonblocking-worker-sqlite-graph-store.md`.
6. **`as unknown as Port` removal:** ✅ Confirmed. No `as unknown as` remains in `test/composition/host-use-case-factories.spec.ts` or `test/application/use-cases/get-change-spec-coverage.spec.ts` (grep over `test/` shows matches only in other files: `make-mock-spec-repository.ts`, `sqlite-worker-lifecycle.spec.ts`, tree-sitter adapter specs, `ladybug-graph-store.spec.ts`, `get-spec-coverage.spec.ts`, `index-project-graph.spec.ts`, `get-graph-health.spec.ts`, `workspace-indexing.spec.ts`). Both target files use the typed `StubChangeRepository` (`test/helpers/stub-change-repository.ts`) implementing the full `ChangeRepository` abstract port.

---

## Test Coverage

| Area                                                     | Test file                                                     | Tests | Verdict                       |
| -------------------------------------------------------- | ------------------------------------------------------------- | ----- | ----------------------------- |
| Public barrel exports / internal-only surface            | `test/barrel.spec.ts`                                         | 10    | Adequate                      |
| Factory + SQLite store construction / runtime descriptor | `test/composition/create-sqlite-graph-store-factory.spec.ts`  | 5     | Adequate                      |
| Provider facade / lifecycle / resolver / unified search  | `test/composition/code-graph-provider.spec.ts`                | 17    | Adequate                      |
| Host use-case factories                                  | `test/composition/host-use-case-factories.spec.ts`            | 4     | Adequate                      |
| Change-scoped coverage use case                          | `test/application/use-cases/get-change-spec-coverage.spec.ts` | 2     | Adequate                      |
| Typed ChangeRepository port stub                         | `test/helpers/stub-change-repository.ts`                      | —     | Adequate (no `as unknown as`) |

Executed: `pnpm --filter @specd/code-graph exec vitest run test/barrel.spec.ts test/composition/ test/application/use-cases/get-change-spec-coverage.spec.ts` → **5 files, 38 tests passed** (~3.7s).

### Missing / weak tests

1. **Post-close `analyzeImpact` scenario** (verify.md Lifecycle "Method after close throws") — no literal test; only `getStatistics`/`getSpec` after close are exercised. The shared `assertAvailable` gate is covered, but a literal `analyzeImpact`-after-close assertion would close the gap.
2. **`resolveFileSelector` on the provider facade** — verify.md facade scenario "Provider normalizes file selectors" is tested indirectly through `resolve-graph-selector.spec.ts` (service-level) and through `search` exact-file normalization (`code-graph-provider.spec.ts:371`); no direct provider-level `resolveFileSelector` test. Low risk.
3. **`SpecNotFoundError.specId`** — asserted in `barrel.spec.ts` only for `.code`; the `specId` getter is tested in `sqlite-worker-lifecycle.spec.ts:356-369` (not in this run's file set). Acceptable.

---

## Spec Dependency Chain Consistency

Dependencies declared in merged spec (`## Spec Dependencies`) and the change's `specDependsOn` (from `changes status`):

| Dependency spec                       | Exists in project | Consistent with composition                                                                                                               |
| ------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:symbol-model`             | ✅                | SymbolKind/RelationType/model types exported from `"."`                                                                                   |
| `code-graph:graph-store`              | ✅                | `GraphStore` internal; store adapter symbols internal-only                                                                                |
| `code-graph:indexer`                  | ✅                | `IndexOptions`/`IndexResult`/`IndexCodeGraph` wiring as specified                                                                         |
| `code-graph:traversal`                | ✅                | `getUpstream`/`getDownstream`/`analyzeFilesImpact` delegated                                                                              |
| `default:_global/architecture`        | ✅                | Hexagonal layering: composition/ imports infrastructure only; curated `"."`/`"./internal"` barrels; no concrete adapters in public barrel |
| `code-graph:get-graph-health`         | ✅                | `createGetGraphHealth` factory + exported types                                                                                           |
| `code-graph:index-project-graph`      | ✅                | `createIndexProjectGraph` factory + exported types                                                                                        |
| `code-graph:get-spec-coverage`        | ✅                | `createGetSpecCoverage` factory + exported types                                                                                          |
| `code-graph:get-change-spec-coverage` | ✅                | `createGetChangeSpecCoverage` factory + exported types                                                                                    |
| `code-graph:resolve-symbol-reference` | ✅                | Resolver types exported from `"."`; concrete resolver internal                                                                            |

- Change status `specDependsOn["code-graph:composition"]` lists exactly these 10 specs — matches the merged spec's `## Spec Dependencies` verbatim. ✅
- Project-wide globals reviewed: `_global/architecture` (barrel + layering), `_global/testing` (`no as unknown as Port` — satisfied via StubChangeRepository), `_global/error-handling-conventions` (typed errors extend `SpecdError`, UPPER_SNAKE_CASE codes, `specId` metadata), `_global/conventions` (named exports, explicit return types, kebab-case files). No contradictions found.
- Dependency spec consistency: the dependent use-case specs (`get-graph-health`, `index-project-graph`, `get-spec-coverage`, `get-change-spec-coverage`) each reference `code-graph:composition` for `CodeGraphProvider`, and their factory-wiring requirements match the implemented factories exactly. `resolve-symbol-reference` does not depend on composition (only symbol-model/graph-store/language-adapter/workspace-integration), so no cycle is introduced by the resolver additions.

---

## Summary Counts

- **Requirements in spec:** 9
- **Satisfied:** 9
- **Partial:** 0
- **Not satisfied:** 0
- **Discrepancies (minor, non-blocking):** 2 (D1 spec signature drift `ResolvedSymbolSelectorResult`; D2 undocumented additive export `SqliteGraphStoreFactoryOptions`)
- **Audit fixes verified:** 6/6 confirmed
- **Tests run:** 5 files / 38 tests — all passed
- **Missing-test gaps:** 3 minor (post-close `analyzeImpact`, provider-level `resolveFileSelector`, `SpecNotFoundError.specId` in barrel)
