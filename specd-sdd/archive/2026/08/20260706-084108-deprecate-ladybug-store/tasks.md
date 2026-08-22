# Tasks: deprecate-ladybug-store

## 1. Preserve Ladybug outside the monorepo

- [x] 1.1 Inventory the extraction source set
      `packages/code-graph/src/infrastructure/ladybug/**`, `packages/code-graph/test/infrastructure/ladybug/**`, `packages/code-graph/test/domain/ports/graph-store.contract.ts`, and the pre-retirement Ladybug spec/verify — record every file that must survive extraction
      Approach: use the implementation worktree immediately before deletion, based on `90d5682b` plus the semantic-reference work already present from `b86b81c1`; compute a SHA-256 hash for each source, schema, test, spec, and verify input
      (Req: Ladybug ownership transferred)

- [x] 1.2 Configure external spec ownership and dependencies
      `specd-plugin-graphstore-ladybug/specd.yaml` — make `ladybug` the only owned workspace and expose upstream specd specs read-only
      Approach: declare local `ladybug` specs at `specs/ladybug`; declare sibling `../specd/specs/_global`, `../specd/specs/code-graph`, and `../specd/specs/core` as `default`, `code-graph`, and `core` with `ownership: readOnly`; retain dependencies on `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`, and `code-graph:workspace-integration`
      (Req: Ladybug ownership transferred)

- [x] 1.3 Scaffold the external preservation package
      `specd-plugin-graphstore-ladybug/package.json`, `tsconfig.json`, `vitest.config.ts`, `LICENSE` — create a strict ESM package outside the specd pnpm workspace
      Approach: use named exports, strict TypeScript, Vitest, the current `@ladybugdb/core@0.19.1`, and a pinned `@specd/code-graph` dependency; keep the package unpublished/non-runtime until a stable plugin contract exists
      (Req: Ladybug ownership transferred)

- [x] 1.4 Copy the Ladybug implementation and schema
      `specd-plugin-graphstore-ladybug/src/ladybug-graph-store.ts`, `src/schema.ts`, `src/index.ts` — preserve the final adapter and physical schema
      Approach: copy the pre-deletion files verbatim except for enumerated import-path changes; keep lazy `@ladybugdb/core` loading in `open()` and export `LadybugGraphStore` by name
      (Req: Ladybug ownership transferred)

- [x] 1.5 Add the transitional Ladybug factory
      `specd-plugin-graphstore-ladybug/src/create-ladybug-graph-store-factory.ts`: `createLadybugGraphStoreFactory()` — expose a factory-shaped preservation entry point without registering a plugin
      Approach: return `GraphStoreFactory` whose `create({ storagePath })` constructs `LadybugGraphStore`; use the explicitly unstable `@specd/code-graph/internal` contract only where the concrete `GraphStore` type is required
      (Req: Ladybug ownership transferred; Factory function)

- [x] 1.6 Copy the Ladybug backend tests
      `specd-plugin-graphstore-ladybug/test/ladybug-graph-store.spec.ts` and `test/ladybug-graph-store-multi-kind.spec.ts` — preserve backend-specific coverage
      Approach: adjust imports only, retain real temporary-directory integration behavior, and keep cleanup after every test
      (Req: Ladybug ownership transferred)

- [x] 1.7 Copy the graph-store contract harness required by Ladybug
      `specd-plugin-graphstore-ladybug/test/graph-store.contract.ts` — make the extracted adapter's abstract contract coverage self-contained
      Approach: copy the current harness and only remove cases that provably depend on monorepo-private test utilities that cannot be copied; any such omission must be listed in provenance
      (Req: Ladybug ownership transferred)

- [x] 1.8 Recreate the Ladybug normative specification
      `specd-plugin-graphstore-ladybug/specs/ladybug/graph-store/spec.md` — preserve every pre-retirement Ladybug requirement as `ladybug:graph-store`
      Approach: copy the complete merged spec before the retirement delta, including schema, persistence, FTS, semantic references, coverage, source search, generation, and bulk transaction requirements; retain its four canonical upstream dependencies
      (Req: Ladybug ownership transferred)

- [x] 1.9 Recreate the Ladybug verification specification
      `specd-plugin-graphstore-ladybug/specs/ladybug/graph-store/verify.md` — preserve every pre-retirement Ladybug scenario
      Approach: copy the complete merged verify document before retirement and retain requirement headings and scenario ordering exactly
      (Req: Ladybug ownership transferred)

- [x] 1.10 Document repository status and provenance
      `specd-plugin-graphstore-ladybug/README.md` and `PROVENANCE.md` — explain the preservation boundary and make the extraction auditable
      Approach: record source URL, exact commit, extraction date, original paths, `@ladybugdb/core` version, input/output hashes, and every import-only edit; state clearly that runtime plugin loading and a stable public `GraphStore` API are deferred
      (Req: Ladybug ownership transferred)

- [x] 1.11 Validate the external copy before any monorepo deletion
      `specd-plugin-graphstore-ladybug` — prove the preserved source, tests, and specs are usable or faithfully frozen
      Approach: compare provenance hashes; run specd project status and spec validation to prove upstream workspaces are external/read-only and all four dependencies resolve; then run install, build, typecheck, lint, and Vitest; if the internal API prevents a build, mark the package non-publishable and verify exact source/spec preservation instead of redesigning the plugin API
      (Req: Ladybug ownership transferred, scenario: Core package contains no Ladybug backend)

## 2. Make SQLite the sole built-in store

- [x] 2.1 Remove the Ladybug built-in factory
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: `LADYBUG_GRAPH_STORE_FACTORY`, `BUILTIN_GRAPH_STORE_FACTORIES` — remove the Ladybug import, constant, and registry entry
      Approach: initialize the per-provider registry with exactly `{ sqlite: createSqliteGraphStoreFactory() }`; do not change overloads, storage-root derivation, health wiring, or language adapter registration
      (Req: Factory function; Default backend role)

- [x] 2.2 Preserve additive external factory selection
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: `createGraphStoreRegistry()` and `createCodeGraphProvider()` — retain selection of caller-provided backend ids
      Approach: merge `Object.entries(graphStoreFactories ?? {})` after SQLite, select `graphStoreId ?? 'sqlite'`, and call exactly the selected factory with `{ storagePath }`
      (Req: Factory function, scenario: External graph-store factory remains selectable)

- [x] 2.3 Preserve deterministic registry errors
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: `createGraphStoreRegistry()` — keep built-in collision and unknown-id failures before store creation
      Approach: reject an external `sqlite` id with `GraphStoreRegistryError.alreadyRegistered(id)` and absent selection with `GraphStoreRegistryError.notFound(id)`; never override or fall back
      (Req: Factory function, scenarios: Duplicate graph-store id is rejected; Unknown graph-store id is rejected)

- [x] 2.4 Clarify the public factory JSDoc
      `packages/code-graph/src/composition/graph-store-factory.ts`: `GraphStoreFactory`, `CodeGraphCompositionOptions`, `CodeGraphOptions` — document SQLite default and additive external factories
      Approach: retain the existing signatures and internal `GraphStore` return dependency; do not promote the port to a new public plugin API
      (Req: Factory function; Package exports)

- [x] 2.5 Verify the curated barrels contain no Ladybug export
      `packages/code-graph/src/public.ts` and `src/index.ts` — remove any surviving Ladybug export while retaining factory/provider/semantic exports
      Approach: keep `GraphStoreFactory`, `GraphStoreFactoryOptions`, composition options, `createSqliteGraphStoreFactory`, provider types, and semantic-resolution types available at their existing entry points
      (Req: Package exports; Public and internal entry points)

## 3. Update graph-store composition coverage

- [x] 3.1 Replace the built-in Ladybug construction test
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` — remove the `graphStoreId: 'ladybug'` happy path and assert SQLite-only built-ins
      Approach: construct without overrides, verify SQLite opens/closes, and assert no Ladybug backend is registered
      (Req: Factory function, scenario: SQLite is the only built-in registration; Default backend role)

- [x] 3.2 Test external factory selection and storage-root forwarding
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` — prove an `external-test` factory becomes the single active store
      Approach: inject a typed test store, capture `GraphStoreFactoryOptions.storagePath`, select its id, and assert the SQLite factory is not instantiated
      (Req: Factory function, scenario: External graph-store factory remains selectable)

- [x] 3.3 Test collision with the SQLite id
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` — cover an external `sqlite` registration
      Approach: assert synchronous `GraphStoreRegistryError`, code `GRAPH_STORE_REGISTRY_ERROR`, the existing already-registered message, and zero store constructions
      (Req: Factory function, scenario: Duplicate graph-store id is rejected)

- [x] 3.4 Retain factory-only public construction coverage
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` — prove consumers cannot construct the provider or a built-in store directly from the public package
      Approach: keep compile-time/barrel assertions for type-only `CodeGraphProvider`, public factory types, and hidden concrete store implementations
      (Req: Factory function, scenario: Provider construction is factory-only; Package exports)

- [x] 3.5 Test unknown backend selection
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` — verify an unregistered id cannot construct a provider
      Approach: assert `GraphStoreRegistryError.notFound(id)` and no SQLite fallback
      (Req: Factory function, scenario: Unknown graph-store id is rejected)

- [x] 3.6 Retain the application-level external factory integration
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`: `session-only` provider setup — keep non-built-in composition coverage green
      Approach: leave the `session-only` factory path intact and run it as a regression after registry changes
      (Req: Factory function; Default backend role)

- [x] 3.7 Replace Ladybug ids in SDK forwarding tests
      `packages/sdk/test/composition/host-context.spec.ts` — keep graph option forwarding examples backend-neutral
      Approach: use `sqlite` or a neutral external id plus a factory mock; continue asserting the exact options object is passed to `createCodeGraphProvider`
      (Req: Factory function; Lifecycle management)

## 4. Remove Ladybug from the monorepo

- [x] 4.1 Delete the Ladybug infrastructure after the preservation gate
      `packages/code-graph/src/infrastructure/ladybug/index.ts`, `ladybug-graph-store.ts`, `schema.ts` — remove the built-in adapter implementation
      Approach: perform deletion only after task 1.10 passes; do not modify `GraphStore`, SQLite, semantic value objects, or shared indexing services as part of deletion
      (Req: Ladybug ownership transferred, scenario: Core package contains no Ladybug backend)

- [x] 4.2 Delete Ladybug-specific monorepo tests
      `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts` and `ladybug-graph-store-multi-kind.spec.ts` — remove tests now owned externally
      Approach: delete only after their external copies and hashes are verified; retain the shared contract harness for SQLite
      (Req: Ladybug ownership transferred)

- [x] 4.3 Remove the native Ladybug dependency
      `packages/code-graph/package.json`: `dependencies` — remove `@ladybugdb/core`
      Approach: preserve `better-sqlite3` and all language parser dependencies; do not add a dependency on the external preservation repository
      (Req: Ladybug ownership transferred)

- [x] 4.4 Regenerate the workspace lockfile
      `pnpm-lock.yaml` — remove unreachable Ladybug core and platform packages
      Approach: run pnpm lockfile resolution after editing `packages/code-graph/package.json`; confirm no `@ladybugdb/core` package or importer entry remains
      (Req: Ladybug ownership transferred)

- [x] 4.5 Update the native test-runner comment
      `packages/code-graph/vitest.config.ts` — remove Ladybug-specific rationale without changing safe worker behavior
      Approach: retain `maxWorkers: 1` for SQLite native/filesystem tests and update the comment only
      (Req: Default backend role)

## 5. Remove Ladybug-specific CLI lifecycle behavior

- [x] 5.1 Remove graph-store signal interception
      `packages/cli/src/commands/graph/with-provider.ts`: `withProvider()` — delete `SIGINT`/`SIGTERM` registration and listener cleanup
      Approach: keep SDK context construction, optional `host` and `beforeOpen`, callback delegation, and format-aware `handleError`
      (Req: withProvider delegates to withOpenGraphProvider, scenario: Successful command returns after cleanup)

- [x] 5.2 Remove forced successful and signal exits
      `packages/cli/src/commands/graph/with-provider.ts`: `withProvider()` — remove `process.exit(0)`, `process.exit(130)`, and Ladybug-specific JSDoc
      Approach: resolve normally after `withOpenGraphProvider` closes; do not change the existing error path or SDK helper
      (Req: withProvider delegates to withOpenGraphProvider, scenario: Successful command returns after cleanup)

- [x] 5.3 Route graph stats through the shared graph context
      `packages/cli/src/commands/graph/stats.ts`: `registerGraphStats()` action — replace independent `openSpecdHost` bootstrap with `resolveGraphCliContext`
      Approach: pass `{ configPath: opts.config, repoPath: opts.path }`, reuse configured kernel or bootstrap synthetic workspace semantics, and preserve mutually exclusive flag validation
      (Req: Graph command platform imports; Statistics retrieval)

- [x] 5.4 Route graph stats through `withProvider`
      `packages/cli/src/commands/graph/stats.ts`: `registerGraphStats()` action — replace direct `withOpenGraphProvider` use and final `process.exit(0)`
      Approach: call `withProvider(context.config, opts.format, callback, { host })`, call `provider.getGraphHealth()` exactly once, and leave text/JSON/TOON projection logic unchanged
      (Req: Graph command platform imports; Statistics retrieval, scenarios: Command delegates health through shared graph context; Successful stats returns after provider cleanup)

## 6. Update CLI lifecycle tests

- [x] 6.1 Test normal wrapper return without process control
      `packages/cli/test/commands/graph-cli-context.spec.ts` — replace success-exit spies with lifecycle assertions
      Approach: assert `withOpenGraphProvider` opens/closes, the callback completes, no `SIGINT`/`SIGTERM` listener is installed, and `process.exit` is not called on success
      (Req: withProvider delegates to withOpenGraphProvider, scenarios: Provider lifecycle via SDK; Successful command returns after cleanup)

- [x] 6.2 Retain wrapper error translation coverage
      `packages/cli/test/commands/graph-cli-context.spec.ts` — verify provider/open errors still use format-aware CLI handling
      Approach: reject the SDK wrapper, assert `handleError` behavior and ensure no graph-store-specific listener remains registered
      (Req: withProvider delegates to withOpenGraphProvider)

- [x] 6.3 Update graph stats lifecycle mocks
      `packages/cli/test/commands/graph-stats.spec.ts` — replace `openSpecdHost`/direct wrapper mocks with shared context and `withProvider` mocks
      Approach: preserve explicit config, explicit path, no-config bootstrap, mutually exclusive flags, and single health call assertions
      (Req: Statistics retrieval, scenarios: Command delegates health through shared graph context; Path and no-config stats use shared bootstrap fallback)

- [x] 6.4 Test stats cleanup and normal return
      `packages/cli/test/commands/graph-stats.spec.ts` — remove the successful `process.exit(0)` expectation
      Approach: resolve the shared wrapper after its callback, assert rendering occurred after health retrieval, and assert the action completes without forced exit
      (Req: Statistics retrieval, scenario: Successful stats returns after provider cleanup)

- [x] 6.5 Run read-only graph command regression suites
      `packages/cli/test/commands/graph-search.spec.ts`, `graph-impact.spec.ts`, `graph-hotspots.spec.ts` — verify the HIGH-impact wrapper simplification changes no command behavior
      Approach: run the existing backend-neutral suites unchanged and fix only lifecycle-mock assumptions that directly reference removed signal/exit behavior
      (Req: Graph command platform imports; graph-search, graph-impact, and graph-hotspots existing requirements)

## 7. Keep SQLite behavior authoritative

- [x] 7.1 Run the SQLite graph-store contract suite
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` and `test/domain/ports/graph-store.contract.ts` — prove SQLite satisfies current storage semantics independently
      Approach: run persistence, relations, FTS/ranking, transactions, bulk indexing, schema/generation, semantic references, coverage, and source-search cases without Ladybug comparison assertions
      (Req: SQLite-backed implementation; Default backend role, scenario: SQLite satisfies current Code Graph consumers directly)

- [x] 7.2 Add explicit SQLite-only default coverage
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` or composition tests — verify supported flows require no Ladybug fallback
      Approach: exercise indexing, references, coverage, search, stats, traversal, impact, and hotspots through the SQLite-backed provider and assert no Ladybug module is loaded
      (Req: Default backend role, scenarios: SQLite is the sole built-in default backend; SQLite satisfies current Code Graph consumers directly)

- [x] 7.3 Verify full re-index recovery
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` — cover rebuilding derived graph state without migration
      Approach: start from absent or deliberately incompatible derived storage, invoke the supported force/full-index path, and assert SQLite recreates usable graph state without reading Ladybug files
      (Req: Default backend role, scenario: Re-index is the recovery boundary; Destructive recreation)

## 8. Update documentation and active spec ownership

- [x] 8.1 Update the Code Graph package README
      `packages/code-graph/README.md` — remove Ladybug built-in examples and describe the retained registry
      Approach: show SQLite as the sole built-in and use a neutral `graphStoreFactories` example for external selection; state that plugin loading is not implemented
      (Req: Factory function; Default backend role)

- [x] 8.2 Update the Code Graph documentation
      `docs/code-graph/index.md` — make persistence and semantic identity language SQLite-based or backend-neutral
      Approach: remove the claim that SQLite and Ladybug are both built-ins while retaining the current semantic identity, schema compatibility, and rebuild behavior
      (Req: Default backend role)

- [x] 8.3 Amend the logical-symbol ADR
      `docs/adr/0024-logical-symbol-resolution.md` — record the later ownership change without rewriting history
      Approach: add an amendment noting Ladybug moved to `specd-plugin-graphstore-ladybug`, SQLite is the sole integrated backend, and Ladybug-specific semantics remain owned externally
      (Req: Ladybug ownership transferred; Default backend role)

- [x] 8.4 Confirm the local Ladybug spec is only a retirement record
      `specs/code-graph/ladybug-graph-store/spec.md` and `verify.md` after archival — verify no operational backend requirement or scenario remains active here
      Approach: rely on the validated removal deltas; retain only the ownership-transfer tombstone because whole-spec deletion is not supported by the archive model
      (Req: Ladybug ownership transferred)

- [x] 8.5 Preserve historical changelog records
      `packages/code-graph/CHANGELOG.md`, `packages/cli/CHANGELOG.md`, and other historical changelogs — ensure removal sweeps do not rewrite past release history
      Approach: exclude changelogs from mechanical Ladybug-reference deletion; historical mentions are expected
      (Req: Ladybug ownership transferred)

## 9. Validate the complete change

- [x] 9.1 Run focused Code Graph quality gates
      `packages/code-graph` — validate the CRITICAL composition change and SQLite-only package
      Approach: run build, typecheck, lint, and Vitest for `@specd/code-graph`; require zero Ladybug imports or native dependency resolution
      (Req: Factory function; Default backend role; Ladybug ownership transferred)

- [x] 9.2 Run focused SDK and CLI quality gates
      `packages/sdk` and `packages/cli` — validate option forwarding and transient provider lifecycle
      Approach: run SDK and CLI tests plus their available build/typecheck/lint commands; require implementation-review and long-lived-host lifecycle tests to remain green
      (Req: Lifecycle management; withProvider delegates to withOpenGraphProvider; Graph command platform imports; Statistics retrieval)

- [x] 9.3 Run workspace-wide quality gates
      repository root — detect cross-workspace regressions from the CRITICAL factory and HIGH-impact wrapper changes
      Approach: run `pnpm build`, `pnpm lint`, and `pnpm test` using the repository's normal scripts; do not reduce worker safety or skip native SQLite coverage
      (Req: all affected requirements)

- [x] 9.4 Audit remaining Ladybug references
      `packages/`, `docs/`, and `pnpm-lock.yaml` — distinguish forbidden active references from allowed history/provenance
      Approach: search case-insensitively for `ladybug`, `lbug`, and `@ladybugdb/core`; allow only historical changelogs, the ADR amendment, external-repository provenance, and the retirement record
      (Req: Ladybug ownership transferred, scenario: Core package contains no Ladybug backend)

- [x] 9.5 Re-index with SQLite
      repository graph storage — rebuild derived state using the only integrated backend
      Approach: run `node packages/cli/dist/index.js graph index --format toon`; treat destructive SQLite rebuild as supported and require successful completion without Ladybug files or migration
      (Req: Default backend role, scenario: Re-index is the recovery boundary)

- [x] 9.6 Exercise read-only graph commands end to end
      built CLI: `graph stats`, `graph search`, `graph impact`, `graph hotspots` — confirm transient lifecycle and output behavior
      Approach: run each command against the rebuilt SQLite graph, verify expected results, normal process return, and absence of hanging native threads
      (Req: Graph command platform imports; Statistics retrieval; graph-search, graph-impact, and graph-hotspots existing requirements)

- [x] 9.7 Exercise registry errors and external selection end to end
      Code Graph composition test harness — verify the retained future-plugin seam outside isolated unit branches
      Approach: construct with a neutral external factory and verify selection, then try a `sqlite` collision and an unknown id and require `GRAPH_STORE_REGISTRY_ERROR` with no fallback
      (Req: Factory function, scenarios: External graph-store factory remains selectable; Duplicate graph-store id is rejected; Unknown graph-store id is rejected)

- [x] 9.8 Exercise long-lived provider ownership
      SDK host integration harness — ensure removing short-lived CLI workarounds does not affect reusable providers
      Approach: create one provider synchronously, await `open()`, perform repeated reads, call `close()`, and verify post-close operations retain existing failure behavior and `Symbol.asyncDispose` remains unchanged
      (Req: Lifecycle management)

- [x] 9.9 Validate all change artifacts
      `deprecate-ladybug-store` — confirm proposal, eight spec deltas, eight verify deltas, design, and tasks remain consistent
      Approach: run change validation in text mode and review any merged-delta notes; do not transition while drift or review blockers remain
      (Req: all affected requirements)

## 10. Reconcile archived shared-context overlap

- [x] 10.1 Align shared graph-context and stats deltas with the archived explicit-config fix
      `deltas/cli/graph-cli-context/*`, `deltas/cli/graph-stats/*`, and `design.md` — preserve configured non-VCS context while documenting the SQLite-only shared lifecycle
      Approach: rebase the merged requirements on `fix-graph-cli-context-explicit-config`; route stats through `resolveGraphCliContext` and `withProvider`, remove direct host-bootstrap/forced-exit assertions, and retain VCS-only bootstrap semantics
      (Req: resolveGraphCliContext uses SDK imports; Graph command platform imports; Command signature; Statistics retrieval)

- [x] 10.2 Clarify external workspace ownership
      `../specd-plugin-graphstore-ladybug/README.md` — distinguish the owned `ladybug` workspace from read-only sibling workspaces
      Approach: identify `default` as the `_global` read-only workspace and state that `code-graph` and `core` are also read-only; do not describe any of them as writable plugin workspaces
      (Req: Ladybug ownership transferred)

## 11. Resolve full-verification findings

- [x] 11.1 Preserve resolved graph context and canonical health output
      `packages/cli/src/commands/graph/{with-provider,stats,search,impact,hotspots}.ts` and CLI tests — reuse the resolved kernel, preserve structured health, and explain incomplete-coverage limits
      Approach: pass the resolved kernel into the shared provider host, render JSON/TOON from the provider health object unchanged, add the text proof-limit message, and extend focused assertions
      (Req: withProvider delegates to withOpenGraphProvider; Statistics retrieval)
