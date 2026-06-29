# @specd/sdk

`@specd/sdk` is the host facade for specd delivery adapters (CLI, MCP, API, IPC). It wires `@specd/core` and `@specd/code-graph` so hosts do not duplicate config loading, kernel construction, or graph provider lifecycle.

## When to use the SDK

Use `@specd/sdk` when building a host that needs:

- Project config + kernel bootstrap
- Code graph provider lifecycle
- Cross-package orchestration (`project status --graph`, `graph index`)

Use `@specd/core` directly only inside `@specd/sdk` or in tests until host migration completes.

## Bootstrap

```typescript
import { openSpecdHost } from '@specd/sdk'

const host = await openSpecdHost({ configPath: '/path/to/specd.yaml' })
const config = await host.kernel.project.getConfig.execute()
```

`openSpecdHost` returns:

- `config` — resolved `SpecdConfig`
- `configFilePath` — absolute path to `specd.yaml`, or `null`
- `kernel` — wired specd kernel
- `createGraphProvider()` — factory bound to the same config

Config **reads** go through `kernel.project.getConfig`. Config **writes** (`initProject`, `addPlugin`, `removePlugin`) use `createConfigWriter()` from `@specd/core` — not the kernel.

## Graph lifecycle

```typescript
import { withOpenGraphProvider } from '@specd/sdk'

await withOpenGraphProvider(host, async (provider) => {
  const stats = await provider.getStatistics()
})
```

Optional `beforeOpen` supports host-specific setup (e.g. CLI index lock acquisition).

## Orchestration

| Function                     | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `buildProjectStatusSnapshot` | `GetProjectSummary` + optional `GetGraphHealth` / hotspots |
| `runIndexProjectGraph`       | `listWorkspaces` + VCS ref + `IndexProjectGraph`           |

Both return structured data — formatting stays in CLI presenters.

## CLI and MCP hosts

`@specd/cli` and `@specd/mcp` depend on `@specd/sdk` only — no direct `@specd/core` or `@specd/code-graph` runtime imports in delivery hosts.

| CLI surface                            | SDK entry                                        |
| -------------------------------------- | ------------------------------------------------ |
| `resolveCliContext`                    | `openSpecdHost` + `buildCliKernelOptions`        |
| `project status`                       | `buildProjectStatusSnapshot`                     |
| `graph stats`                          | `withOpenGraphProvider` + `createGetGraphHealth` |
| `graph index` (worker)                 | `runIndexProjectGraph`                           |
| `graph search` / `hotspots` / `impact` | `withOpenGraphProvider` via `withProvider`       |

The SDK barrel re-exports `@specd/core` and `@specd/code-graph` symbols hosts need (config factories, graph locks, health types). Host adapters import platform symbols from `@specd/sdk`, not from lower packages.

## Re-exports

- `createConfigLoader`, `createConfigWriter`, `createKernel`, and the full `@specd/core` / `@specd/code-graph` public surfaces needed by hosts
- Host orchestration: `openSpecdHost`, `withOpenGraphProvider`, `buildProjectStatusSnapshot`, `runIndexProjectGraph`
- `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, `createGetGraphHealth`, `GetGraphHealthResult`, `IndexResult`, `HotspotResult`
- `SDK_VERSION`

Full public-surface curation continues in change 13 (`public-api-surface`).
