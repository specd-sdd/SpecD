# Tasks: sdk-graph-provider-factory

## 6. Compliance follow-up

- [x] 6.1 Clean up after provider open failures
      `packages/sdk/src/composition/with-open-graph-provider.ts`: `withOpenGraphProvider` — close and run `afterClose` after every post-creation failure while preserving the original error.
      Approach: use a single cleanup path that records the primary operation error before attempting `close()` and `afterClose`.
      (Req: Error propagation)

- [x] 6.2 Test SDK lifecycle error cleanup
      `packages/sdk/test/composition/with-open-graph-provider.spec.ts`: lifecycle failure tests — cover rejected `open()` without `beforeOpen` and `afterClose` ordering.
      Approach: mock a provider whose `open()` rejects, assert `close()` and `afterClose` execution, then assert the original rejection is returned.
      (Req: Error propagation)

- [x] 6.3 Export CodeGraphProvider at runtime
      `packages/code-graph/src/public.ts`: public barrel — export `CodeGraphProvider` as a value.
      Approach: replace its type-only export with a value export while retaining type exports for type-only symbols.
      (Req: Package exports)

- [x] 6.4 Test the runtime public export
      `packages/code-graph/test/barrel.spec.ts`: public-barrel regression — assert the package root exposes `CodeGraphProvider` at runtime.
      Approach: import the public barrel as a runtime module and check the class binding, while retaining the internal-symbol exclusion assertions.
      (Req: Package exports)

## 1. SDK host bootstrap

- [x] 1.1 Add `SdkContextOptions` and switch `createSdkContext` to SDK-owned options
      `packages/sdk/src/composition/host-context.ts`: `createSdkContext`, `SdkContextOptions` — replace the kernel-only `options?: KernelOptions` input with an SDK-owned `{ kernel?, graph? }` shape and keep `createGraphProvider()` fresh per call
      Approach: define `SdkContextOptions` beside `SdkHostContext`; call `createKernel(config, options?.kernel)` and close over `createCodeGraphProvider(config, options?.graph)` so graph composition stays outside `@specd/core`
      (Req: createSdkContext)

- [x] 1.2 Rework `OpenSpecdHostInput` to reuse the same SDK-owned options block
      `packages/sdk/src/composition/host-context.ts`: `OpenSpecdHostInput`, `openSpecdHost` — replace `kernelOptions` with `options?: SdkContextOptions` while preserving `configPath` / `startDir` bootstrap rules
      Approach: keep the three bootstrap modes intact, reject `configPath + startDir`, and delegate to `createSdkContext(config, input.options)` without splitting kernel and graph paths again
      (Req: openSpecdHost)

- [x] 1.3 Update SDK host-context tests for graph option forwarding and fresh providers
      `packages/sdk/test/composition/host-context.spec.ts`: host-context spec coverage — add assertions for `options.graph` forwarding, `openSpecdHost({ options })`, and fresh provider instances on repeated `createGraphProvider()` calls
      Approach: spy or mock the code-graph factory boundary so tests verify the exact forwarded composition object and preserve the existing no-options behavior
      (Req: SdkHostContext shape, createSdkContext, openSpecdHost)

## 2. SDK lifecycle helper

- [x] 2.1 Add `afterClose` to the helper lifecycle contract
      `packages/sdk/src/composition/with-open-graph-provider.ts`: `WithOpenGraphProviderOptions` — extend the helper options with a post-close cleanup hook
      Approach: keep the helper signature stable, add `afterClose?: (provider) => Promise<void>`, and use it only for host-local orchestration so the provider contract itself stays unchanged
      (Req: withOpenGraphProvider signature, Optional beforeOpen hook)

- [x] 2.2 Make `withOpenGraphProvider` run symmetric cleanup on success and failure
      `packages/sdk/src/composition/with-open-graph-provider.ts`: `withOpenGraphProvider` — ensure cleanup runs after callback failure and after `open()` failure when `beforeOpen` already succeeded
      Approach: track whether `beforeOpen` ran, always attempt `provider.close()`, then await `afterClose`, suppress close errors during error cleanup when `fn` already failed, and let close/afterClose failures surface only on otherwise successful paths
      (Req: withOpenGraphProvider signature, Error propagation, Optional beforeOpen hook)

- [x] 2.3 Update helper tests for `afterClose` and error masking rules
      `packages/sdk/test/composition/with-open-graph-provider.spec.ts`: helper lifecycle coverage — add tests for success, callback error, `open()` error after `beforeOpen`, and terminal close/afterClose failures
      Approach: use controllable fake providers to assert exact call order and that callback errors win over cleanup failures during error paths
      (Req: Error propagation)

## 3. Code-graph composition surface

- [x] 3.1 Rename `CodeGraphFactoryOptions` to `CodeGraphCompositionOptions`
      `packages/code-graph/src/composition/graph-store-factory.ts`: `CodeGraphCompositionOptions`, `CodeGraphOptions` — rename the public composition type and keep the standalone `CodeGraphOptions` extension model
      Approach: preserve the existing fields (`graphStoreId`, `graphStoreFactories`, `adapters`), move the renamed type into the public barrel, and update imports across SDK and code-graph to the new identifier
      (Req: Factory function, Package exports)

- [x] 3.2 Introduce reusable SQLite graph-store factory construction
      `packages/code-graph/src/composition/create-sqlite-graph-store-factory.ts` and public exports — add `createSqliteGraphStoreFactory(...)` as the shared SQLite backend builder
      Approach: wrap the existing SQLite store implementation behind a configurable `loadDatabaseModule` option so the built-in `sqlite` backend and a future `sqlite-electron` backend can share store logic and differ only in loader binding
      (Req: Factory function, Package exports)

- [x] 3.3 Make built-in store registration lazy-at-open instead of eager-at-import
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: built-in store registry and provider composition — stop importing concrete runtime-specific bindings eagerly when constructing the registry
      Approach: keep `createCodeGraphProvider(...)` synchronous, register built-in factories that create stores whose `open()` does the runtime/native loading work, and preserve the default backend selection and additive registry merge semantics
      (Req: Factory function)

- [x] 3.4 Update code-graph public exports for renamed options and new factory helpers
      `packages/code-graph/src/index.ts` and any export barrels — export `CodeGraphCompositionOptions`, `createSqliteGraphStoreFactory`, and `GraphProviderStaleError`, and stop exporting lock/recreate internals
      Approach: align the public barrel exactly with the spec export list and keep concrete adapters/internal-only symbols behind `"./internal"`
      (Req: Package exports, Constraints)

## 4. Graph-store contract and concrete stores

- [x] 4.1 Extend the abstract `GraphStore` contract for lazy readiness and storage generation
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore` — codify idempotent `close()`, lazy work in `open()`, and the backend capability needed for generation tracking around `recreate()`
      Approach: keep the port backend-agnostic, retain `recreate()` as the destructive reset capability, and add the minimum abstract behavior needed for provider-side epoch caching without introducing `@specd/core` dependencies
      (Req: Connection lifecycle, Store recreation, Storage generation tracking, Constraints)

- [x] 4.2 Add storage-epoch support to the SQLite backend
      `packages/code-graph/src/infrastructure/sqlite/*`: SQLite store implementation — defer runtime loading to `open()`, make `close()` idempotent, and rotate/read the storage generation marker during destructive recreate/open
      Approach: persist a marker such as `graph/storage.epoch`, initialize or cache it on `open()`, rotate it in `recreate()`, and expose enough store behavior for provider-side stale detection while keeping backend-specific filenames internal
      (Req: sqlite-graph-store connection lifecycle, destructive recreation, storage generation sidecar)

- [x] 4.3 Add storage-epoch support to the Ladybug backend
      `packages/code-graph/src/infrastructure/ladybug/*`: Ladybug store implementation — mirror the SQLite lifecycle and generation semantics for lazy open, idempotent close, and destructive recreate
      Approach: follow the same sidecar-based generation contract as SQLite so runtime-specific concerns are handled consistently across built-in backends
      (Req: ladybug-graph-store connection lifecycle, destructive recreation, storage generation sidecar)

- [x] 4.4 Add backend-focused tests for lazy open, idempotent close, and epoch rotation
      `packages/code-graph/test/infrastructure/sqlite-graph-store*.spec.ts` and Ladybug equivalents — verify open-time loader behavior, repeated close safety, and generation rotation on recreate
      Approach: use temporary graph roots, exercise open/close/recreate directly, and assert sidecar rotation plus reopen readiness without relying on provider helpers
      (Req: Storage generation tracking, sqlite-graph-store, ladybug-graph-store)

## 5. Provider lifecycle, locking, and stale detection

- [x] 5.1 Internalize provider lock helpers and remove public `recreate()`
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProvider` public surface — stop exposing `assertGraphIndexUnlocked`, `acquireGraphIndexLock`, and `recreate()`
      Approach: keep lock acquisition and destructive reset as provider-private helpers used only from `index(...)` / `clear()` maintenance flows so compile failures reveal any stale external callers
      (Req: CodeGraphProvider facade, Constraints)

- [x] 5.2 Add provider-owned availability checks for busy and stale states
      `packages/code-graph/src/composition/code-graph-provider.ts`: internal availability helpers — gate reads/search/traversal/maintenance through open-state, index-lock, and storage-epoch validation
      Approach: implement a private `assertAvailable()` fast path that checks open state, compares cached epoch `mtime`, rereads `graph/storage.epoch` only when needed, and throws `GraphProviderStaleError` on generation mismatch or the existing busy error when reindexing is active
      (Req: Lifecycle management, CodeGraphProvider facade)

- [x] 5.3 Make provider lifecycle idempotent and async-dispose safe
      `packages/code-graph/src/composition/code-graph-provider.ts`: `open`, `close`, `[Symbol.asyncDispose]` — support repeated cleanup and long-lived host shutdown/replacement flows
      Approach: treat `open()` as the only async backend-readiness boundary, make `close()` a no-op after the first successful cleanup, and implement async-dispose as a thin call into the same idempotent close path
      (Req: Lifecycle management)

- [x] 5.4 Introduce `GraphProviderStaleError`
      `packages/code-graph/src/domain/errors/graph-provider-stale-error.ts` plus export barrels — add the provider-stale error with code `GRAPH_PROVIDER_STALE`
      Approach: model it as a `SpecdCodeGraphError` subclass, export it from `"."`, and use it only for storage-generation mismatch so it remains distinct from busy/reindex errors
      (Req: Package exports, Lifecycle management)

- [x] 5.5 Update provider tests for internalized lifecycle and stale detection
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: provider behavior coverage — add tests for removed public helpers, provider-owned busy/stale guards, idempotent close, async-dispose, and stale reopen flows
      Approach: use fake or temp-root stores to simulate epoch rotation and active-lock conditions and assert that every public read path passes through the same availability policy
      (Req: CodeGraphProvider facade, Lifecycle management)

## 6. Host use cases

- [x] 6.1 Remove lock assertion logic from `GetGraphHealth`
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `GetGraphHealth.execute()` — stop owning any explicit pre-read lock checks and let provider errors propagate unchanged
      Approach: call provider statistics/fingerprint reads directly, preserve existing staleness and fingerprint orchestration, and map `GRAPH_BUSY` / `GRAPH_PROVIDER_STALE` purely through provider behavior
      (Req: Provider-owned availability and error propagation)

- [x] 6.2 Move recreate/lock orchestration fully inside `IndexProjectGraph` provider calls
      `packages/code-graph/src/application/use-cases/index-project-graph.ts`: `IndexProjectGraph.execute()` — stop treating recreate or lock handling as host-managed work
      Approach: prepare index inputs exactly as before but rely on `provider.index(...)` to own force-reset and lock policy internally
      (Req: index-project-graph execution semantics)

- [x] 6.3 Update host use-case tests for busy/stale propagation and provider-owned indexing
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`, `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`, `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts` — realign expectations with provider-owned lifecycle
      Approach: replace lock-assertion tests with propagation tests for `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE`, and add integration coverage for recreate rotating the storage epoch
      (Req: get-graph-health, index-project-graph, graph-store storage generation tracking)

## 7. CLI graph commands

- [x] 7.1 Update graph CLI context/bootstrap wiring to the new SDK host options
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts` and any shared CLI host helpers — consume `openSpecdHost({ options })` / `createSdkContext(..., { graph })` and remove any dependency on public provider lock helpers
      Approach: keep existing config/bootstrap mode semantics and error mapping unchanged while switching the underlying SDK API shape
      (Req: openSpecdHost, cli graph context integration)

- [x] 7.2 Remove pre-open lock probing from `graph stats`
      `packages/cli/src/commands/graph/stats.ts`: graph stats command — rely on provider-opened `GetGraphHealth` behavior and surface `GRAPH_BUSY` / `GRAPH_PROVIDER_STALE` through the standard infrastructure error path
      Approach: open the provider normally via SDK helper/context, do not inspect any lock state before open, and preserve exit code `3` for infrastructure failures
      (Req: Concurrent indexing guard, Error cases)

- [x] 7.3 Remove pre-open lock probing from `graph impact`
      `packages/cli/src/commands/graph/impact.ts`: impact command — treat busy/stale provider failures as normal infrastructure errors after open
      Approach: preserve selector validation and canonical file resolution exactly as today, but drop any separate lock preflight and let provider availability checks govern read access
      (Req: Concurrent indexing guard, Error cases)

- [x] 7.4 Remove pre-open lock probing from `graph search`
      `packages/cli/src/commands/graph/search.ts`: search command — stop checking host-managed lock state and map provider busy/stale errors to exit code `3`
      Approach: keep the existing search delegation and ranking output intact, replace only the lock semantics with provider-owned post-open availability handling
      (Req: Search behaviour, Error cases)

- [x] 7.5 Remove pre-open lock probing from `graph hotspots`
      `packages/cli/src/commands/graph/hotspots.ts`: hotspots command — let provider availability checks govern busy/stale behavior
      Approach: preserve current filter parsing and output, but remove the explicit lock preflight and rely on the existing infrastructure error pipeline for `GRAPH_BUSY` / `GRAPH_PROVIDER_STALE`
      (Req: Concurrent indexing guard, Error cases)

- [x] 7.6 Update CLI tests for provider-owned busy/stale semantics
      `packages/cli/test/commands/graph-stats.spec.ts`, `graph-impact.spec.ts`, `graph-search.spec.ts`, `graph-hotspots.spec.ts`, and `graph-cli-context.spec.ts` as needed — replace old lock-preflight assertions with provider-raised busy/stale assertions
      Approach: keep invalid-input exit-code-1 tests, add exit-code-3 cases for `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE`, and verify context wiring still uses the SDK bootstrap path
      (Req: cli:graph-stats, cli:graph-impact, cli:graph-search, cli:graph-hotspots)

## 8. Documentation and verification

- [x] 8.1 Update CLI reference for busy/stale semantics
      `docs/cli/cli-reference.md`: graph command documentation — explain that read commands now surface provider-owned `GRAPH_BUSY` / `GRAPH_PROVIDER_STALE` semantics rather than a separate pre-open lock probe
      Approach: document observable command behavior only, keep exit-code semantics aligned with the CLI entrypoint contract, and avoid leaking internal provider implementation details
      (Req: cli graph command docs)

- [x] 8.2 Add short-lived and long-lived host usage examples to public docs
      `packages/code-graph/README.md`, `docs/code-graph/*`, SDK-facing docs/README, or the existing public doc locations for these packages — document both helper-based and direct lifecycle host patterns
      Approach: include one example using `withOpenGraphProvider(...)` and one example using `openSpecdHost(...)`, `createGraphProvider()`, `await provider.open()`, stale reopen, and shutdown `close()`, while stating that factory creation is sync and runtime loading happens in `open()`
      (Req: host usage documentation)

- [x] 8.3 Run targeted package tests and manual graph command verification
      workspace test commands and local graph command runs — verify the implementation end-to-end after code changes land
      Approach: run `pnpm test --filter @specd/sdk`, `pnpm test --filter @specd/code-graph`, `pnpm test --filter @specd/cli`, then manually exercise `graph stats`, `graph impact`, `graph search`, and `graph hotspots` during normal, busy, and stale-provider flows
      (Req: Testing)

## 9. Compliance remediation follow-up

- [x] 9.1 Normalize aggregate multi-file impact paths
      `packages/cli/src/commands/graph/impact.ts`: `handleFilesImpact` — convert aggregate structured affected paths to display paths.
      Approach: apply the existing `toDisplayPath` conversion to every user-facing aggregate field before JSON/TOON output.
      (Req: cli:graph-impact output format)

- [x] 9.2 Repair SDK cleanup and host bootstrap divergences
      `packages/sdk/src/composition/with-open-graph-provider.ts` and `packages/cli/src/commands/graph/stats.ts` — guarantee a single close/afterClose pass and use the specified SDK host entry point.
      Approach: isolate primary-operation failure from cleanup-hook failure; route configured stats through `openSpecdHost` or update its contract consistently.
      (Req: Error propagation, cli:graph-stats host context)

- [x] 9.3 Restore curated code-graph public and application boundaries
      `packages/code-graph/src/public.ts` and `src/application/use-cases/get-graph-health.ts` — remove unlisted root exports and inject VCS/ref work through a typed port.
      Approach: keep concrete factories at composition boundaries and replace partial `as unknown as` mocks with complete typed helpers.
      (Req: Package exports, global architecture, global testing)

- [x] 9.4 Repair Ladybug generation, document FTS, and atomic removal
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts` — recreate generation metadata after migration, rebuild the Document FTS index, and wrap file deletion in a transaction.
      Approach: ensure the sidecar after migration, include Document in FTS rebuild lists, and commit/rollback the full delete sequence atomically.
      (Req: Storage generation sidecar, graph-store atomic removal)

- [x] 9.5 Add compliance regression coverage
      SDK, CLI impact, graph-health, public-barrel, and Ladybug test suites — cover all findings and correct the stale schema-version assertion.
      Approach: add direct error identity, path-namespace, export exclusion, migration-sidecar, document-refresh, and failure-atomicity tests.

## 10. Final audit corrections

- [x] 10.1 Internalize `CodeGraphProvider` construction and export a type-only public interface.
- [x] 10.2 Align GraphStore reverse-coverage API names and SQLite identity-candidate search behavior.
- [x] 10.3 Keep graph stats outside the shared CLI graph context and correct VCS detection tests.
- [x] 10.4 Add regression tests for the corrected public surface, storage queries, CLI bootstrap, and VCS factory behavior.
      (Req: Testing)

## 11. Post-audit bootstrap and Ladybug corrections

- [x] 11.1 Add `allowBootstrapFallback?: boolean` to `OpenSpecdHostInput` in `packages/sdk/src/composition/host-context.ts`.
      Implementation contract: retain the `configPath`/`startDir` mutual-exclusion guard; attempt configured-host loading first; recover only from discovery-mode absence of configuration when the flag is exactly `true`; resolve the selected start directory through the VCS adapter; construct the existing synthetic graph-capable config at that VCS root; call the same `createSdkContext` seam; and return `configFilePath: null` for that synthetic host. Never recover explicit `configPath` errors or missing VCS roots, and preserve the configuration-required behavior when the flag is absent or false.
      Tests: assert omitted and false flags fail as before; true produces the synthetic host at the detected root; explicit config does not invoke fallback; and kernel/graph options reach both configured and synthetic context creation.

- [x] 11.2 Update `packages/cli/src/commands/graph/stats.ts` to own only graph-stats host bootstrap.
      Routing contract: call `openSpecdHost({ configPath })` for `--config`; call `openSpecdHost({ startDir: path, allowBootstrapFallback: true })` for `--path`; and call `openSpecdHost({ allowBootstrapFallback: true })` with neither flag. Do not import or call `resolveGraphCliContext`; obtain the provider from the opened SDK host, execute `createGetGraphHealth` within the existing SDK lifecycle helper, and preserve the configured-host workspace list versus the synthetic default workspace behavior.
      Tests in `packages/cli/test/commands/graph-stats.spec.ts` must assert these exact inputs and the normal rendering path. Add concrete `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` fixtures through the command error boundary, retaining infrastructure error handling and exit code 3. In `graph-cli-context.spec.ts`, assert stats is excluded from that shared resolver.

- [x] 11.3 Repair Ladybug search candidate construction in `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts` and its schema/query constants.
      Document discovery must query `document_fts` via `QUERY_FTS_INDEX`; spec discovery must retain its FTS query. Before any ranking or limiting, union FTS rows with canonical-path/config-relative-path identity candidates for documents and with `specId`/path candidates for specs, deduplicate by graph node id, and apply the existing workspace/exclusion filters. Reuse the shared identity-aware ranker and snippet generation, bind all Cypher/query parameters (never interpolate user text), and apply the requested limit only after filtering and ranking. Ensure the bulk-load/rebuild lifecycle refreshes `document_fts` consistently with the other FTS indexes.

- [x] 11.4 Add regression coverage for the post-audit boundaries.
      In `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts`, cover a spec-id suffix/component miss in FTS that succeeds by identity, document retrieval through `document_fts`, identity ordering, deduplication, and workspace filters/limits after the candidate union. In `packages/code-graph/test/barrel.spec.ts`, add a compile/type assertion that `CodeGraphProvider` is type-importable but cannot be value-constructed from `@specd/code-graph`. In `packages/core/test/composition/vcs-adapter.spec.ts`, cover Git/Hg/SVN detection order, unmatched external providers, `NullVcsAdapter` fallback, and explicit versus omitted cwd. Keep the known Vitest/tinypool IPC warning explicitly out of scope: no test-runner workaround belongs in this change.

## 10. Core VCS port public contract follow-up

- [x] 10.1 Export the VCS application port from Core
      `packages/core/src/public.ts`: public barrel — export `VcsAdapter` from the existing application port module without exporting concrete VCS adapters.
      Approach: add a type-safe named export at the supported Core boundary; preserve composition-only construction through `createVcsAdapter`.
      (Req: Public port export)

- [x] 10.2 Cover the Core public VCS port export
      `packages/core/test/barrel.spec.ts`: Core barrel regression — assert `VcsAdapter` is available from `@specd/core`.
      Approach: import the public module and assert the abstract class export identity rather than an internal module path.
      (Req: Public port export, scenario: VcsAdapter is available from the Core public API)

- [x] 10.3 Use the public VCS port in graph health
      `packages/code-graph/src/application/use-cases/get-graph-health.ts` and its tests: inject a `Promise<VcsAdapter>` resolver instead of a local narrowed interface.
      Approach: depend only on the Core public port type and retain composition-supplied adapter construction.
      (Req: Public port export)

- [x] 10.4 Re-run affected package and root validation
      Core, code-graph, SDK, and CLI tests; root typecheck, lint, and build.
      Approach: verify public declarations and compiled ESM exports in addition to unit scenarios.
      (Req: Testing)

## 12. Verification audit remediation follow-up

- [x] 12.1 Forward `vcsRoot` through project indexing
      `packages/code-graph/src/application/use-cases/index-project-graph.ts`: `IndexProjectGraph.execute` — retain `vcsRoot: string | null` in the input and copy it unchanged to `provider.index` options.
      Approach: preserve both `null` and absolute-root values without deriving or normalizing them in the use case.
      (Req: Accepts open provider and prepared inputs, scenario: VCS root is forwarded to provider indexing)

- [x] 12.2 Test project-index VCS-root forwarding
      `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`: add provider-spy cases for a non-null VCS root and `null`.
      Approach: execute the use case with prepared inputs and assert the exact `vcsRoot` reference/value received by `provider.index`.
      (Req: Accepts open provider and prepared inputs)

- [x] 12.3 Exit graph stats after lifecycle cleanup
      `packages/cli/src/commands/graph/stats.ts`: successful command handler — invoke `process.exit(0)` only after the awaited `withOpenGraphProvider` completion path.
      Approach: keep all non-zero errors on the existing error boundary; do not exit from inside the provider callback or before close resolves.
      (Req: Statistics retrieval, scenario: Successful stats exits after provider cleanup)

- [x] 12.4 Test graph-stats cleanup-to-exit ordering
      `packages/cli/test/commands/graph-stats.spec.ts`: add an ordered lifecycle/exit test.
      Approach: spy on provider close completion and `process.exit`, then assert close occurs before the successful exit call.
      (Req: Statistics retrieval)

- [x] 12.5 Export VcsAdapter as a Core runtime value
      `packages/core/src/application/ports/index.ts` and the supported Core public barrel: replace the type-only re-export of `VcsAdapter` with a value re-export.
      Approach: expose only the abstract port class; retain concrete adapter construction exclusively in Core composition.
      (Req: Public port export, scenario: VcsAdapter is available from the Core public API)

- [x] 12.6 Restore external VCS-provider fall-through
      `packages/core/src/composition/vcs-adapter.ts`: `createVcsAdapter` — combine registered external providers as an ordered prefix before built-in Git, Hg, and SVN providers.
      Approach: return immediately for a matching external provider; otherwise continue every built-in probe and create `NullVcsAdapter` only after all fail.
      (Req: External providers run before built-in probes, scenario: Unmatched external providers fall through to built-ins)

- [x] 12.7 Add Core VCS public-export and fall-through regression tests
      `packages/core/test/barrel.spec.ts` and `packages/core/test/composition/vcs-adapter.spec.ts`: cover runtime public import, matching external precedence, unmatched fallback to Git, and all-miss null fallback.
      Approach: use ordered provider doubles so tests prove built-in probes remain reachable after external misses.
      (Req: Public port export, External providers run before built-in probes)

## 13. Post-verify compliance cleanup

- [x] 13.1 Propagate GetGraphHealth busy/stale provider errors in tests
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`: assert `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` from `provider.getStatistics()` propagate unchanged from `GetGraphHealth.execute()`.
      Approach: reject with the package error types/codes and expect the same instance or code to surface without wrapping.
      (Req: Provider-owned availability and error propagation)
