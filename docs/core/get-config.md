# GetConfig

`GetConfig` exposes the `SpecdConfig` snapshot a kernel was built from. Hosts (CLI, SDK, API, MCP) use it when they receive a `Kernel` but no parallel config object.

Location:

- use case: `packages/core/src/application/use-cases/get-config.ts`
- factory: `packages/core/src/composition/use-cases/get-config.ts`
- kernel path: `kernel.project.getConfig`

## Usage

```typescript
import { createKernel, createConfigLoader } from '@specd/core'

const config = await createConfigLoader({ startDir: process.cwd() }).load()
const kernel = await createKernel(config)

const snapshot = kernel.project.getConfig.execute()
// snapshot.projectRoot, snapshot.workspaces, snapshot.approvals, ...
// snapshot.plugins?.agents — declared plugin entries (no separate list use case)
```

Standalone construction (tests or narrow tooling):

```typescript
import { createGetConfig } from '@specd/core'

const getConfig = createGetConfig(config)
const snapshot = getConfig.execute()
```

## Contract

- **Read-only host view** — `execute()` returns a `Readonly<SpecdConfig>` clone captured at construction. It is not the live object used by internal kernel wiring (`ListWorkspaces`, etc.).
- **Plugin declarations** — read `execute().plugins` (or an already-loaded `SpecdConfig`). There is no `kernel.project.listPlugins` use case.
- **No disk I/O** — does not re-read `specd.yaml`. If the yaml changes on disk, recreate the kernel.
- **Not for yaml edits** — persist configuration through `ConfigWriter` composition factories (`createInitProject`, `createAddPlugin`, `createRemovePlugin`). See [ConfigWriter](./config-writer.md).

Mutating the returned snapshot does not reconfigure the kernel and does not write to disk.

## Related

- [Config](./config.md) — `SpecdConfig` shape
- [Use cases](./use-cases.md) — kernel grouping
