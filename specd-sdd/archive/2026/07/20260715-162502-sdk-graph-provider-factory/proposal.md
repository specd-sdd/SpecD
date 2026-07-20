# Proposal: sdk-graph-provider-factory

## Motivation

Hosts that embed `@specd/sdk` need a supported way to select runtime-appropriate graph storage wiring without rebuilding SDK bootstrap themselves. This change is needed now because `createSdkContext` currently hardwires the default code-graph factory path and `@specd/code-graph` eagerly binds built-in backends, which blocks host-specific runtime adaptations such as Electron-safe SQLite backends.

## Current behaviour

`createSdkContext(config, options?)` builds the kernel and always returns `createGraphProvider: () => createCodeGraphProvider(config)`. `openSpecdHost` forwards into that bootstrap path, so SDK hosts cannot pass graph composition options through the normal bootstrap surface. Inside `@specd/code-graph`, built-in backends are imported eagerly, which means runtime-specific native dependencies such as SQLite can be pulled in even when a host intends to use a different backend registration.

The compliance audit also identified correctness gaps in the same lifecycle boundary: a stale force-index verification scenario, inconsistent multi-file impact paths, duplicated SDK cleanup after hook failure, and Ladybug persistence defects affecting generation tracking, document search refresh, and atomic file removal. These gaps make the existing provider contract unreliable for long-lived hosts and structured CLI consumers.

The final audit additionally found that `graph stats --path` treats its path as a configuration-discovery root instead of a graph-bootstrap root, and that Ladybug omits required FTS-backed document discovery and strong identity candidates for spec search. It also found that `graph stats` lacks its required explicit post-close exit, Core exposes `VcsAdapter` as a type-only export, the VCS factory does not fall through from unmatched external providers to built-ins, and the `IndexProjectGraph` spec omits its implemented `vcsRoot` input. These are functional and public-contract gaps, not runner noise.

## Proposed solution

Prepare `@specd/code-graph` and `@specd/sdk` for host-specific graph backends while tightening the graph-provider lifecycle and availability contract around that composition seam. In `@specd/code-graph`, built-in graph-store backends should be resolved lazily so that unused native backends are not loaded, and the SQLite-backed store path should be reusable by a runtime-specific external backend such as `sqlite-electron` that changes only the native module binding. `CodeGraphProvider` must become a public interface rather than a publicly constructible class: the concrete provider and its store/indexer constructor inputs remain internal, and `createCodeGraphProvider` is the only supported construction path. In `@specd/sdk`, the host-context bootstrap contract should expose SDK-owned `options` that forward graph composition options into `createCodeGraphProvider(config, compositionOptions)` while preserving current behavior when no graph options are supplied. The SDK should continue to bind graph-provider creation to the same resolved config used for kernel construction, and each provider call must still return a fresh provider instance. Provider factories should remain synchronous; asynchronous backend loading belongs in `provider.open()` so long-lived hosts such as HTTP APIs, MCP servers, and Electron can either use the helper wrapper or manage provider lifetime directly.

`openSpecdHost` will gain an opt-in `allowBootstrapFallback` flag, defaulting to `false`. Only callers that explicitly enable it may fall back from configuration discovery to a synthetic graph-capable host rooted at the detected VCS repository. `graph stats` enables it for `--path` and no-config operation while retaining direct SDK bootstrap rather than reusing the legacy shared CLI graph context. Ladybug will use its document FTS index and supplement FTS candidates for spec identities before ranking.

The CLI command will exit only after the SDK-managed provider close path completes. Core will expose the abstract `VcsAdapter` value from its supported public barrel, and `createVcsAdapter` will probe registered external providers first while retaining Git, Hg, and SVN as fall-through defaults. The index-project orchestration contract will explicitly carry and forward `vcsRoot` so its spec, use case, and lower-level index options agree.

## Specs affected

### New specs

None.

### Modified specs

- `sdk:host-context`: replace the current kernel-only bootstrap options with SDK-owned host options that keep kernel composition separate from graph composition and forward graph settings into `createCodeGraphProvider(...)`.
  - This change should instead add SDK-owned graph options that are forwarded to the default `@specd/code-graph` factory path while keeping kernel options separate.
  - Depends on (added): none
  - Depends on (removed): none

- `sdk:with-open-graph-provider`: clarify that provider lifecycle behavior applies equally to the default SDK factory and to the same factory when graph backend options are forwarded through SDK host context.
  - This change should also extend the helper lifecycle hooks so resources acquired before `open()` can be released symmetrically after `close()`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:composition`: update the code-graph composition contract so built-in graph-store backends are selected lazily and hosts can register runtime-specific backends without changing the provider contract.
  - Depends on (added): none
  - Depends on (removed): none

- `core:vcs-adapter`: verify factory-level VCS detection through `createVcsAdapter(...)`, rather than assigning concrete Git selection to the abstract port's default static method.
  - Ensure unmatched external providers fall through to the built-in Git, Hg, and SVN probe order.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:graph-store`: extend the graph-store contract so backend loading can be deferred, provider availability can detect cross-process storage replacement, and destructive reset/recreate mechanics remain internal to provider-owned indexing flows.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:sqlite-graph-store`: align the SQLite backend contract with lazy-at-open module loading, idempotent close/async-dispose semantics, provider-owned availability checks, and the shared storage-epoch invalidation rules defined by `code-graph:graph-store`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:ladybug-graph-store`: align the Ladybug backend contract with the same lazy-at-open runtime loading pattern, idempotent close/async-dispose semantics, provider-owned availability checks, and the shared storage-epoch invalidation rules defined by `code-graph:graph-store`.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:index-project-graph`: move force-rebuild semantics into `provider.index(...)` so the use case no longer drives `provider.recreate()` as a separate public step and no longer treats lock handling as an external host responsibility.
  - Clarify that `vcsRoot: string | null` is required and forwarded into provider index options.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:get-graph-health`: align graph-health orchestration with provider-owned availability checks so the use case no longer depends on externally exposed lock helpers or host-managed lock assertions.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:graph-stats`: remove host-managed pre-open lock checks and align command behavior with provider-owned graph-busy and provider-stale semantics.
  - Retain the required explicit successful exit only after provider cleanup completes.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:graph-cli-context`: remove the obsolete requirement that every graph command, including stats, uses the shared lock-precheck context; retain that context only where the command contract still requires it.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:graph-impact`: remove host-managed pre-open lock checks and align impact analysis with provider-owned graph-busy and provider-stale semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:graph-search`: remove host-managed pre-open lock checks and align search behavior with provider-owned graph-busy and provider-stale semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:graph-hotspots`: remove host-managed pre-open lock checks and align hotspot analysis with provider-owned graph-busy and provider-stale semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `core:vcs-adapter-port`: expose the `VcsAdapter` application port through Core's supported public API so typed consumers can depend on the VCS contract without recreating a narrower local interface.
  - Export the abstract class as a runtime value, not only as a type.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected code areas include `packages/core/src/public.ts`, `packages/core/src/composition/vcs-adapter.ts`, `packages/sdk/src/composition/host-context.ts`, `packages/sdk/src/composition/with-open-graph-provider.ts`, `packages/code-graph/src/composition/create-code-graph-provider.ts`, `packages/code-graph/src/composition/code-graph-provider.ts`, code-graph host use cases such as `index-project-graph` and `get-graph-health`, CLI graph commands, graph-store factory wiring, and tests covering host-context bootstrap, helper lifecycle hooks, provider availability, backend selection, VCS factory detection, and the Core public barrel. The change touches how the SDK forwards `@specd/code-graph` composition controls such as backend selection, additive graph-store factories, and additional language adapters. It also makes the public provider surface non-constructible while retaining its typed lifecycle/query API, and it aligns VCS verification with the port/adapter boundary. It also touches how `@specd/code-graph` loads built-in backends so unused native runtime dependencies are not pulled in eagerly, and how graph commands surface provider-owned busy/stale errors instead of doing lock checks manually.

## Technical context

The current lifecycle seam already exists at `ctx.createGraphProvider()` inside `withOpenGraphProvider`, and this change keeps composition anchored there while also tightening provider lifecycle guarantees around open/close, busy-state enforcement, and stale-provider detection. The immediate host problem comes from runtime-specific native storage bindings, not from a need for a second provider abstraction. `@specd/code-graph` already supports `graphStoreId`, additive `graphStoreFactories`, and additional `adapters`, but its built-in backend imports are still eager. The intent of this change is to make backend selection genuinely runtime-safe by deferring backend loading and by letting the SDK forward the graph composition options type through a SDK-owned `options` shape. As part of that work, the current `CodeGraphFactoryOptions` naming should be revisited in favor of `CodeGraphCompositionOptions`, which better reflects that the type configures provider composition rather than a generic factory contract. That keeps `@specd/core` kernel construction separate from code-graph composition, preserves source compatibility at the host boundary, and leaves the actual Electron-specific backend registration work for a follow-up branch. The intended follow-up shape for Electron is a thin backend package, tentatively `@specd/code-graph-sqlite-electron`, that would export only a `sqliteElectronGraphStoreFactory` built on shared SQLite store logic plus a Electron-specific vendored runtime loader, rather than a second full `code-graph` composition package. For example:

`VcsAdapter` is likewise a Core application port rather than an implementation detail. Its omission from the Core public barrel forced code-graph to narrow its VCS dependency locally and caused declaration builds to diverge from the intended typed composition boundary. The port should therefore be exported from the supported Core API; concrete adapter construction remains exclusively in Core composition.

```ts
import { createSqliteGraphStoreFactory, type GraphStoreFactory } from '@specd/code-graph'
import { loadVendoredElectronSqlite } from './runtime/vendored-better-sqlite3.js'

export const sqliteElectronGraphStoreFactory: GraphStoreFactory = createSqliteGraphStoreFactory({
  loadDatabaseModule: loadVendoredElectronSqlite,
})
```

Electron hosts would then register that backend through `graphStoreFactories` and select it via `graphStoreId: 'sqlite-electron'`. A fresh graph impact check shows `createSdkContext` currently has `MEDIUM` dependent risk with affected callers in SDK orchestration, `with-open-graph-provider`, CLI host bootstrap, and SDK tests, which reinforces the need to preserve source compatibility.

`withOpenGraphProvider` should evolve in this change to support a paired `afterClose` hook alongside `beforeOpen` so host-specific resources acquired before `open()` (such as graph-index locks) have a symmetric release point after `close()`. The helper should guarantee that this release hook still runs when `open()` or the operation body fails after pre-open acquisition has already happened.

That helper should remain a convenience wrapper rather than the only intended lifecycle entrypoint. Long-lived hosts such as HTTP APIs, MCP servers, and Electron processes should be able to create a provider synchronously, `await open()` it under their own lifecycle control, reuse it across operations when appropriate, and `await close()` it during shutdown or replacement. The wrapper remains useful for short-lived flows such as CLI commands and one-shot orchestration, but the underlying provider contract should stand on its own without requiring callback-style usage.

For example, a long-lived host should be able to manage provider lifetime directly along these lines:

```ts
import { openSpecdHost } from '@specd/sdk'

const host = await openSpecdHost({
  options: {
    graph: {
      graphStoreId: 'sqlite-electron',
      graphStoreFactories: {
        'sqlite-electron': sqliteElectronGraphStoreFactory,
      },
    },
  },
})

let provider = host.createGraphProvider()
await provider.open()

export async function searchGraph(query: string) {
  try {
    return await provider.search(query)
  } catch (error) {
    if (isGraphProviderStaleError(error)) {
      await provider.close()
      provider = host.createGraphProvider()
      await provider.open()
      return provider.search(query)
    }
    throw error
  }
}

export async function shutdown() {
  await provider.close()
}
```

The exact host orchestration can vary by runtime, but the intended contract is stable: synchronous factory creation, explicit async `open()`, provider reuse while healthy, and explicit `close()` during shutdown or stale-provider replacement.

Graph-index locking should move inside the provider and become part of its internal availability policy instead of remaining a host-managed concern. During an active reindex operation, no reads or writes against the graph database should proceed; callers should fail fast with the graph-busy error until the reindex completes. As part of that move, public lock helpers should become internal implementation details rather than part of the provider surface, and the force-reindex path should be absorbed into `provider.index(...)` rather than exposed as a separate public `recreate()` operation. In practice, the provider should own lock acquisition/release around `index(...)` and `clear()`, reads should perform the same internal busy guard, and store-level recreate/reset mechanics should remain internal to the indexing flow. Breaking host compilation for any remaining external lock usage or public `recreate()` usage is desirable here because it makes stale call sites obvious and prevents accidental double-locking or out-of-band destructive resets after the internal lock migration.

Provider-side availability checks should be centralized behind one internal guard helper (for example `assertAvailable()` or a more explicit `assertNotReindexing()` naming). Public read methods should call that guard before touching the store so the graph-busy policy is enforced consistently across CLI, API, MCP, and desktop hosts without duplicating host-level checks.

To make long-lived providers detect destructive cross-process rebuilds explicitly, the provider should track a persisted storage epoch sidecar (proposed path: `graph/storage.epoch`) rather than relying on incidental backend errors after `recreate()`. The epoch file can be a single-line opaque token. On `open()`, the provider/store should cache both the token value and the sidecar `mtime`. `assertAvailable()` should first compare cached versus current `mtime` as a fast path; only when the `mtime` changes should it reread `storage.epoch` and fail with a provider-stale error if the token no longer matches. Forced rebuild flows should regenerate that epoch token as part of the recreate path.

That invalidation path should use a dedicated error distinct from the graph-busy lock error. Preferred direction: introduce a provider-stale error such as `GraphProviderStaleError` with a machine-readable code like `GRAPH_PROVIDER_STALE`, meaning the provider was opened against an older storage generation and must be reopened before retrying. This should remain separate from the reindex-in-progress error used when the lock is currently active.

The async resource-management path should remain defensive: `CodeGraphProvider.close()` and any `Symbol.asyncDispose` implementations introduced for the provider or underlying stores should be idempotent and must not fail when cleanup is invoked more than once. This keeps `await using`, explicit `close()`, and helper-driven cleanup paths safe to combine during migration and in future host code.

## Resolved directions

- The SDK-owned host options shape should be:

  ```ts
  interface SdkContextOptions {
    readonly kernel?: KernelOptions
    readonly graph?: CodeGraphCompositionOptions
  }
  ```

- `openSpecdHost(...)` should reuse that same `SdkContextOptions` block via `input.options`, rather than keeping a separate `kernelOptions` field or defining a parallel graph-specific input shape.

- `createCodeGraphProvider(...)` and `SdkHostContext.createGraphProvider()` should remain synchronous. Lazy backend resolution and any native module loading should happen during `provider.open()`, not during factory creation.
- Long-lived hosts should be able to manage provider lifetime directly without `withOpenGraphProvider`; the helper remains supported as a convenience wrapper for short-lived flows.
- `@specd/code-graph` should move built-in backend composition to an async-at-open model so backend modules can be resolved lazily at selection time instead of being imported eagerly.
- The same lazy runtime-binding pattern should apply to both `SQLiteGraphStore` and `LadybugGraphStore`, because runtime-specific native loading concerns should be handled consistently across built-in backends rather than only for SQLite.
- `GetGraphHealth` should stop owning any special lock semantics. It should rely on `provider.getStatistics()` and related provider reads to surface `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` directly, rather than returning a structured busy status or keeping an `assertUnlocked` escape hatch.
- Backend-specific specs for SQLite and Ladybug should join this change so each built-in backend explicitly states how it realizes the shared `code-graph:graph-store` lifecycle, lazy-loading, and storage-epoch rules.

## Open questions

None. The user requested that every compliance finding in scope be corrected; implementation details will follow the existing workspace and package boundaries.
