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
  await provider.searchSymbols({ query: 'openSpecdHost' })
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

## Orchestration

| Function                     | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `buildProjectStatusSnapshot` | `GetProjectSummary` + optional `GetGraphHealth` / hotspots |
| `runIndexProjectGraph`       | `listWorkspaces` + VCS ref + `IndexProjectGraph`           |

Both return structured data — formatting stays in CLI presenters.

## Subpaths

| Import                  | Audience | Purpose                                      |
| ----------------------- | -------- | -------------------------------------------- |
| `@specd/sdk`            | Hosts    | Bootstrap, orchestration, curated re-exports |
| `@specd/sdk/ports`      | Plugins  | Port contracts (`ChangeRepository`, etc.)    |
| `@specd/sdk/extensions` | Plugins  | `KernelBuilder`, storage factory contracts   |

## CLI and MCP hosts

`@specd/cli` and `@specd/mcp` depend on `@specd/sdk` only — no direct `@specd/core` or `@specd/code-graph` runtime imports in delivery hosts.

| CLI surface                            | SDK entry                                        |
| -------------------------------------- | ------------------------------------------------ |
| `resolveCliContext`                    | `openSpecdHost` + `buildCliKernelOptions`        |
| `project status`                       | `buildProjectStatusSnapshot`                     |
| `graph stats`                          | `withOpenGraphProvider` + `createGetGraphHealth` |
| `graph index`                          | `runIndexProjectGraph`                           |
| `graph search` / `hotspots` / `impact` | `withOpenGraphProvider` via `withProvider`       |

## Re-exports

The SDK root exports explicit symbols from the curated `@specd/core` and `@specd/code-graph` public barrels, including:

- `createDefaultConfigLoader`, `createConfigWriter`, `createKernel`, kernel-equivalent `createX` factories, and repository factories
- Standalone `createX` factories (e.g. `createGetStatus`, `createResolveSchema`) for hosts that need a single use case without `createKernel`
- Host orchestration: `openSpecdHost`, `withOpenGraphProvider`, `buildProjectStatusSnapshot`, `runIndexProjectGraph`
- Graph helpers: `createGetGraphHealth`, `GetGraphHealthResult`, `IndexResult`, `HotspotResult`, `GraphProviderStaleError`
- `SDK_VERSION`, `CORE_VERSION`, `CODE_GRAPH_VERSION`

For package-level semantics (domain model, graph indexing, plugin ports), see the **Core** and **Code graph** package reference sections.
