---
title: SDK
sidebar_position: 3
---

# @specd/sdk

`@specd/sdk` is the **single import** for specd delivery hosts (CLI, MCP, API, IPC). It wires `@specd/core` and `@specd/code-graph` so hosts do not duplicate config loading, kernel construction, or graph provider lifecycle.

> **Hosts:** import `@specd/sdk` only. Do not mix `@specd/core` and `@specd/code-graph` in host code.
>
> **Plugin authors:** use `@specd/core` (and `@specd/core/ports`, `@specd/core/extensions`) for storage contracts and kernel extension registration.

## When to use the SDK

Use `@specd/sdk` when building a host that needs:

- Project config + kernel bootstrap
- Code graph provider lifecycle
- Cross-package orchestration (`project status --graph`, `graph index`)
- Delivery-neutral implementation review with Code Graph resolution

## Bootstrap

```typescript
import { openSpecdHost, createSdkContext } from '@specd/sdk'

// Forced-file bootstrap when the host already knows the exact config file
const host = await openSpecdHost({ configPath: '/path/to/specd.yaml' })

// Discovery-root bootstrap when the host chooses a directory at runtime
const selectedHost = await openSpecdHost({ startDir: '/path/to/project/subdir' })

const config = await host.kernel.project.getConfig.execute()

// Kernel-only when you already have a resolved SpecdConfig
const { kernel } = await createSdkContext(config)
```

Choose exactly one bootstrap input:

- `configPath` for forced-file mode
- `startDir` for discovery-root mode
- neither field to fall back to discovery from `process.cwd()`

Do not pass `configPath` and `startDir` together.

`openSpecdHost` returns:

- `config` — resolved `SpecdConfig`
- `configFilePath` — absolute path to `specd.yaml`, or `null`
- `kernel` — wired specd kernel
- `createGraphProvider()` — factory bound to the same config

Bootstrap warnings remain on `config.warnings`. `openSpecdHost` does not expose a
duplicate top-level `warnings` field, so hosts should consume diagnostics from the
resolved config and decide how to present them.

Config **reads** go through `kernel.project.getConfig`. Config **writes** (`initProject`, `addPlugin`, `removePlugin`) use `createConfigWriter()` from `@specd/sdk` — not the kernel.

## Graph lifecycle

```typescript
import { withOpenGraphProvider } from '@specd/sdk'

await withOpenGraphProvider(host, async (provider) => {
  const stats = await provider.getStatistics()
})
```

`withOpenGraphProvider` is the short-lived host helper. It opens the provider,
runs your callback, and always closes it. Optional hooks are available when the
host needs setup or teardown around the provider lifecycle:

```typescript
import { withOpenGraphProvider } from '@specd/sdk'

await withOpenGraphProvider(host, async (provider) => provider.getStatistics(), {
  beforeOpen: async () => {
    // host-local setup
  },
  afterClose: async () => {
    // host-local cleanup
  },
})
```

For long-lived hosts, keep the provider instance explicitly and reopen it when a
stale generation error is raised:

```typescript
import { GraphProviderStaleError, openSpecdHost } from '@specd/sdk'

const host = await openSpecdHost({ startDir: process.cwd() })
const provider = host.createGraphProvider()

await provider.open()

try {
  await provider.search({
    query: 'openSpecdHost',
    categories: ['symbols', 'files', 'specs', 'documents'],
  })
} catch (error) {
  if (error instanceof GraphProviderStaleError) {
    await provider.close()
    await provider.open()
  } else {
    throw error
  }
}

await provider.close()
```

Provider creation is synchronous. Runtime-native backend loading happens in
`provider.open()`, not when `createGraphProvider()` is called.

## Presentation

| Function                   | Purpose                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `changeContextToMarkdown`  | Renders agent-facing markdown for compiled change context (`CompileContextResult`) with source-aware load hints |
| `projectContextToMarkdown` | Renders agent-facing markdown for project context (`GetProjectContextResult`) with `specs context` load hints   |

Both are pure synchronous functions: no I/O, no kernel access, no process side effects. Delivery hosts (CLI, MCP, API) consume them for text-mode presentation while structured formats (JSON/TOON) remain the host's responsibility.

## Orchestration

| Function                     | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `buildProjectStatusSnapshot` | `GetProjectSummary` + optional `GetGraphHealth` / hotspots   |
| `runIndexProjectGraph`       | `listWorkspaces` + VCS ref + `IndexProjectGraph`             |
| `runIsolatedGraphIndex`      | Code Graph-owned isolated child execution for a trusted task |
| `buildImplementationReview`  | Core raw tracking + one Code Graph resolution batch          |

All return structured data — formatting stays in delivery presenters.

`runIsolatedGraphIndex` is the SDK re-export for a host that needs to run a trusted,
installed graph-index task in a child process. The host supplies a graph storage root,
an absolute task path or `file:` URL, JSON-serializable input, and optionally receives
ordered progress values. Code Graph acquires and releases the shared writer lock,
launches and supervises the child, validates IPC, and forwards `SIGINT`/`SIGTERM` only
for the active run. Typed worker failures are re-exported alongside the function.

The task itself can call `runIndexProjectGraph` after reconstructing the intended SDK
context. This separates parent-side isolation from child-side project orchestration.
The SDK intentionally does not expose raw lock acquisition, lock paths or leases,
handoff tokens, child bootstrap controls, or raw IPC envelopes.

For a transient `runIndexProjectGraph({ force: true })` call, the SDK may repair a
typed `GraphStorageRecoveryRequiredError` exactly once: it closes the failed transient
provider, recreates closed derived storage, and retries open. Healthy force runs are
logical full rebuilds and do not physically recreate storage. Non-forced calls,
explicit providers, recovery failures, second-open failures, and unrelated errors do
not retry or receive deletion authority.

### Unified graph operations

Hosts open one provider through the SDK lifecycle and call Code Graph's curated
operations. `provider.search(input)` receives all selected categories, filters,
limits, and snippet preference once. Code Graph owns expansion, semantic ranking,
candidate paging, source occurrence ranges, declaration-name suppression,
deduplication, grouping, and post-suppression limit refill. A host may render
`--files` as a category selector and `--file` as a path filter, but must not run and
merge lower-level searches.

Graph health is likewise a Code Graph projection. It exposes aggregate and workspace
states for VCS, filesystem, and hybrid visibility scopes, including monotonic stale
latches and stable reasons. Hosts render those values without rescanning repositories
or files. Targeted freshness assessment belongs to Code Graph and is reused by symbol
resolution; the SDK does not invent missing/stale policy.

### Implementation review

```typescript
import { buildImplementationReview, openSpecdHost } from '@specd/sdk'

const host = await openSpecdHost({ startDir: process.cwd() })
const result = await buildImplementationReview(host, { changeName: 'my-change' })
```

`buildImplementationReview` reads Core's raw implementation tracking once, opens one
Code Graph provider lifecycle, reads one health snapshot, and resolves all symbol
links in one batch. File-only links bypass resolution. The result contains the raw
review, canonical `graphHealth`, and deterministic reviewed links with the original
stored values, status/reason, targeted freshness/coverage, target, candidates, and
provenance path.

The operation is read-only: it does not rewrite the manifest, sidecars, paths, or
symbol strings. Expected graph unavailability is represented by the documented
unavailable diagnostics; incompatible schema/generation and storage failures propagate
as infrastructure errors rather than being converted to a link status. Link status is
`resolved`, `ambiguous`, `unresolved`, or `missing`: stale or unknown input evidence
stays `unresolved`, while `missing` requires current targeted evidence and complete
coverage. Staleness remains visible in graph health and freshness fields.

Resolution policy remains in `@specd/code-graph`. Core remains the graph-agnostic
source of raw tracking, SDK owns cross-package orchestration, and CLI/MCP hosts only
present the returned projection.

### Indexing repair

`runIndexProjectGraph` uses the shared `withOpenGraphProvider` lifecycle with the
indexing-specific open operation. Its `IndexResult` passes through `fullRebuild` and
`fullRebuildReason`: `null` for a compatible incremental run, or the stable reason for
recreating incompatible derived storage. Normal
`withOpenGraphProvider` reads never repair a store. After recreation, old long-lived
providers fail generation validation and must be reopened.

Code Graph performs the write through one bulk index session: bounded chunks share one
atomic generation, relation endpoints are validated in batches, and semantic/source
search indexes are rebuilt once. The SDK preserves progress and repair diagnostics but
does not split the transaction, write graph facts, or clear freshness latches itself.
It also passes through Code Graph's named phase counts and timings without recomputing
them in the SDK or CLI.

## Subpaths

| Import                  | Audience | Purpose                                      |
| ----------------------- | -------- | -------------------------------------------- |
| `@specd/sdk`            | Hosts    | Bootstrap, orchestration, curated re-exports |
| `@specd/sdk/ports`      | Plugins  | Port contracts (`ChangeRepository`, etc.)    |
| `@specd/sdk/extensions` | Plugins  | `KernelBuilder`, storage factory contracts   |

## CLI and MCP hosts

`@specd/cli` and `@specd/mcp` depend on `@specd/sdk` only — no direct `@specd/core` or `@specd/code-graph` runtime imports in delivery hosts.

| CLI surface                            | SDK entry                                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| `resolveCliContext`                    | `openSpecdHost` + `buildCliKernelOptions`                        |
| `project status`                       | `buildProjectStatusSnapshot`                                     |
| `graph stats`                          | `withOpenGraphProvider` + `createGetGraphHealth`                 |
| `graph index`                          | `runIsolatedGraphIndex` → packaged task → `runIndexProjectGraph` |
| `graph search` / `hotspots` / `impact` | `withOpenGraphProvider` via `withProvider`                       |
| `changes implementation` / status      | `buildImplementationReview`                                      |

## Re-exports

The SDK root exports explicit symbols from the curated `@specd/core` and `@specd/code-graph` public barrels, including:

- `createDefaultConfigLoader`, `createConfigWriter`, `createKernel`, kernel-equivalent `createX` factories, and repository factories
- Standalone `createX` factories (e.g. `createGetStatus`, `createResolveSchema`) for hosts that need a single use case without `createKernel`
- Host orchestration: `openSpecdHost`, `withOpenGraphProvider`, `buildProjectStatusSnapshot`, `runIndexProjectGraph`, `runIsolatedGraphIndex`, `buildImplementationReview`
- Isolated worker contracts and typed failures: `GraphIndexJsonValue`, `GraphIndexTask`, `RunIsolatedGraphIndexInput`, `GraphIndexWorkerStartError`, `GraphIndexTaskContractError`, `GraphIndexTaskExecutionError`, `GraphIndexWorkerProtocolError`, `GraphIndexWorkerExitError`, `GraphIndexWorkerSignalError`, and `GraphIndexProgressHandlerError`
- Graph helpers: `createGetGraphHealth`, `GetGraphHealthResult`, `IndexResult`, `HotspotResult`, `GraphProviderStaleError`, `GraphStorageRecoveryRequiredError`, `GraphStoreRecreateRequiresClosedError`
- `SDK_VERSION`, `CORE_VERSION`, `CODE_GRAPH_VERSION`

For package-level semantics (domain model, graph indexing, plugin ports), see the **Core** and **Code graph** package reference sections.

## Agent Plugin Prompt Injection & Native Hooks

Agent plugins (`@specd/plugin-agent-*`) initialize project runtimes during `install()` and clean them up during `uninstall()` using `@specd/skills` helpers:

- **Prompt Rendering**: `renderBaseAgentInstruction({ extraInstructions? })` compiles the canonical specd instruction prompt with entry points, graph-first rules, and user escape hatch.
- **Markdown Block Management**: `injectSpecdBlock(file, content, blockId?)` and `removeSpecdBlock(file, blockId?)` manage `<!-- <specd> -->` and `<!-- <specd-plugin:id> -->` comment blocks.
- **Shared File Reference Counting**: Multiple plugins targeting `AGENTS.md` register plugin markers (`blockId`). `removeSpecdBlock` removes base blocks only when all plugin markers are uninstalled.
- **Safe JSON Config Modification**: `mergeJsonConfig` and `unmergeJsonConfig` preserve user properties in `.claude/settings.json` and `opencode.json` while performing namespace-filtered hook registration (`specd-*`).
