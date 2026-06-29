# Design: 12-cli-mcp-sdk-migration

## Non-goals

- Public barrel curation of `@specd/core` / `@specd/code-graph` re-exports (change `13-public-api-surface`)
- API/IPC/desktop presenters
- Moving graph index subprocess lock into `@specd/sdk` (stays CLI `beforeOpen` / parent lock)
- MCP tool implementations (package is stub — dependency swap only)
- New SDK orchestration helpers beyond what change 11 shipped

## Affected areas

| Symbol / file               | Location                                                       | Change                                                                                          | Impact                                                         |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `resolveCliContext`         | `packages/cli/src/helpers/cli-context.ts`                      | Delegate to `openSpecdHost`; preserve `CliContext` shape                                        | **CRITICAL** — 88 direct callers across CLI commands and tests |
| `registerProjectStatus`     | `packages/cli/src/commands/project/status.ts`                  | Replace `loadGraphData` with `buildProjectStatusSnapshot`; remove `@specd/code-graph` imports   | **MEDIUM** — output shape unchanged                            |
| `loadGraphData`             | `packages/cli/src/commands/project/status.ts`                  | **Remove** — replaced by SDK snapshot                                                           | LOW — private helper                                           |
| `registerGraphStats`        | `packages/cli/src/commands/graph/stats.ts`                     | Use `openSpecdHost` + `withOpenGraphProvider`; drop `resolveGraphCliContext` / `withProvider`   | MEDIUM                                                         |
| `registerGraphIndex`        | `packages/cli/src/commands/graph/index-graph.ts`               | Worker path calls `runIndexProjectGraph`; parent retains lock/spawn                             | MEDIUM                                                         |
| `packages/sdk/src/index.ts` | barrel                                                         | Re-export CLI-needed code-graph symbols (lock helpers, `createGetGraphHealth`, types)           | MEDIUM — interim until A3                                      |
| `resolveGraphCliContext`    | `packages/cli/src/commands/graph/resolve-graph-cli-context.ts` | SDK imports; configured mode via `resolveCliContext`                                            | MEDIUM — all graph commands                                    |
| `withProvider`              | `packages/cli/src/commands/graph/with-provider.ts`             | Delegate to `withOpenGraphProvider`                                                             | MEDIUM — search/hotspots/impact/stats                          |
| `registerGraphSearch`       | `packages/cli/src/commands/graph/search.ts`                    | Use graph-cli-context; no direct code-graph imports                                             | MEDIUM                                                         |
| `registerGraphHotspots`     | `packages/cli/src/commands/graph/hotspots.ts`                  | Use graph-cli-context                                                                           | MEDIUM                                                         |
| `registerGraphImpact`       | `packages/cli/src/commands/graph/impact.ts`                    | Use graph-cli-context                                                                           | MEDIUM                                                         |
| `createCliKernel`           | `packages/cli/src/kernel.ts`                                   | Pass `kernelOptions` into `openSpecdHost` / `createSdkContext` instead of direct `createKernel` | HIGH — only called from `resolveCliContext` after migration    |
| `packages/cli/package.json` | dependencies                                                   | Add `@specd/sdk`; remove `@specd/core`, `@specd/code-graph`                                     | HIGH — forces import sweep                                     |
| `packages/mcp/package.json` | dependencies                                                   | Replace `@specd/core` with `@specd/sdk`                                                         | LOW — stub package                                             |
| `packages/sdk/src/index.ts` | barrel                                                         | Re-export CLI-needed code-graph symbols (lock helpers, `createGetGraphHealth`, types)           | MEDIUM — interim until A3                                      |
| Graph command tests         | `packages/cli/test/commands/*.spec.ts`                         | Update mocks for SDK delegation paths                                                           | MEDIUM                                                         |
| `cli-context.spec.ts`       | `packages/cli/test/helpers/cli-context.spec.ts`                | Assert `openSpecdHost` wiring                                                                   | LOW                                                            |
| `docs/core/sdk.md`          | documentation                                                  | Add CLI/MCP migration notes and import guidance                                                 | LOW                                                            |

**Blast radius note:** `resolveCliContext` change is CRITICAL (120 affected files per graph impact) but **interface-preserving** — callers keep `{ config, configFilePath, kernel }`. Risk is regression in kernel options (logging destinations), not signature breakage.

## New constructs

_none — reuses change 11 SDK exports. Optional barrel additions in existing `packages/sdk/src/index.ts` only._

### SDK barrel extensions (existing file)

Add named re-exports from `@specd/code-graph` required by CLI adapters after direct dependency removal:

```typescript
export {
  acquireGraphIndexLock,
  assertGraphIndexUnlocked,
  createGetGraphHealth,
  type GetGraphHealthResult,
  type IndexResult,
  type HotspotResult,
} from '@specd/code-graph'
```

**Responsibility:** Transitional host-facing surface until A3 curation. **Does not** add new orchestration logic.

## Approach

### 1. Dependency boundary

1. `packages/cli/package.json`: runtime deps → `@specd/sdk` (keep plugin/schema deps). Remove `@specd/core`, `@specd/code-graph`.
2. `packages/mcp/package.json`: `@specd/core` → `@specd/sdk`.
3. Extend SDK barrel with lock/health symbols listed above.
4. Repo-wide CLI import sweep: `@specd/core` / `@specd/code-graph` → `@specd/sdk` for all `packages/cli/src/**` and tests.

### 2. `resolveCliContext` thin wrapper

```typescript
export async function resolveCliContext(options?: {
  configPath?: string | undefined
  onLog?: ((entry: LogEntry) => void) | undefined
}): Promise<CliContext> {
  const kernelOptions = buildCliKernelOptions(options) // verbosity + log destinations (existing logic)
  const host = await openSpecdHost({ configPath: options?.configPath, kernelOptions })
  return { config: host.config, configFilePath: host.configFilePath, kernel: host.kernel }
}
```

- `buildCliKernelOptions` extracts existing verbosity / `additionalDestinations` logic from current `resolveCliContext`.
- `createCliKernel` in `kernel.ts` becomes unused or delegates to `createKernel` with same options — remove if dead.
- `CliContext` interface unchanged.

### 3. `project status` (`cli:project-status`)

Replace parallel `getProjectSummary` + `loadGraphData` with single SDK call:

```typescript
const host = await openSpecdHost({ configPath: opts.config, kernelOptions })
const snapshot = await buildProjectStatusSnapshot(host, {
  includeGraph: true,
  includeHotspots: opts.graph ?? false,
})
```

Map fields:

| Output field                    | Source                                                               |
| ------------------------------- | -------------------------------------------------------------------- |
| Workspace list                  | `host.kernel.project.listWorkspaces.execute()` (unchanged)           |
| Spec/change counts              | `snapshot.summary`                                                   |
| Approvals / llmOptimizedContext | `snapshot.approvals`, `snapshot.llmOptimizedContext`                 |
| Graph freshness                 | `snapshot.graphHealth?.stale`, `snapshot.graphHealth?.lastIndexedAt` |
| `--graph` extended              | `snapshot.graphHealth` counts + `snapshot.hotspots`                  |
| `--context`                     | unchanged — `kernel.project.getProjectContext`                       |

Delete `loadGraphData` and all `@specd/code-graph` imports from `status.ts`.

Presenter output (text/json/toon) MUST remain byte-compatible with current shapes.

### 4. `graph stats` (`cli:graph-stats`)

1. Resolve host via `openSpecdHost` (configured) or existing bootstrap path via `resolveGraphCliContext` adapted to SDK imports.
2. `assertGraphIndexUnlocked(config)` before open (from SDK re-export).
3. `withOpenGraphProvider(host, async (provider) => { createGetGraphHealth().execute({...}) })`.
4. Format and exit — unchanged.

Remove `withProvider` usage from stats command specifically.

### 5. `graph index` (`cli:graph-index`)

**Parent process (unchanged concerns):**

- `resolveGraphCliContext` for config
- `acquireGraphIndexLock` before spawn
- Worker spawn with env vars

**Worker process:**

```typescript
const host = await openSpecdHost({ configPath, kernelOptions })
const result = await runIndexProjectGraph(host, {
  force: opts.force,
  excludePaths: opts.excludePath,
  onProgress: textModeProgressHandler,
})
```

Remove direct `createIndexProjectGraph`, `withProvider`, `buildProjectGraphConfig` from command handler.

Lock release and signal forwarding stay in parent.

### 6. Other graph commands (search/hotspots/impact)

Not spec-scoped but required for dependency removal:

- `withProvider` → thin adapter over `withOpenGraphProvider(createSdkContext(...))` or host from `resolveGraphCliContext`
- Imports from `@specd/sdk` only
- Behaviour unchanged — provider-direct queries per reparto table

### 7. MCP

- Swap `package.json` dependency only.
- No source changes (`packages/mcp/src/index.ts` is stub).

## Key decisions

**Decision:** Extend SDK barrel with lock/health re-exports rather than duplicate lock logic in CLI.

**Alternatives rejected:** Keeping `@specd/code-graph` as direct CLI dep — violates A2b boundary. Moving locks into SDK — out of scope (change 11 explicitly excluded).

**Decision:** Preserve `CliContext` / `GraphCliContext` public shapes.

**Alternatives rejected:** Exposing `SdkHostContext` to all commands — too wide a refactor; only graph commands that need provider factory use SDK context directly.

**Decision:** `buildProjectStatusSnapshot({ includeGraph: true })` always for project status (freshness always shown).

**Alternatives rejected:** Separate freshness path — would reintroduce direct provider open in CLI.

## Trade-offs

- **[Risk] CRITICAL fan-in on `resolveCliContext`** → Keep interface identical; add focused `cli-context.spec.ts` regression test for kernel logging options.
- **[Risk] SDK barrel grows ad hoc** → Document as interim; A3 curates. Limit additions to symbols CLI already imported from code-graph.
- **[Risk] Output regression on project status / graph commands** → Existing CLI tests are acceptance gate; compare text/json/toon fixtures.

## Spec impact

| Modified / new spec                            | Dependents                               | Assessment                        |
| ---------------------------------------------- | ---------------------------------------- | --------------------------------- |
| `cli:host-context` (new)                       | All CLI commands via `resolveCliContext` | Central bootstrap contract        |
| `cli:graph-cli-context` (new)                  | All graph subcommands                    | Shared provider lifecycle         |
| `cli:project-status`                           | Skills referencing project status        | Delegation only; output unchanged |
| `cli:graph-index/stats/search/hotspots/impact` | None direct                              | Import boundary + lifecycle       |
| `sdk:composition`                              | `13-public-api-surface` (overlap)        | Interim re-exports until A3       |
| `core:composition`                             | `13-public-api-surface` (overlap)        | Tightens post-A2b bootstrap rule  |
| `cli:entrypoint`                               | All CLI commands                         | Package dependency boundary       |

## Dependency map

```mermaid
graph TD
  CLI[resolveCliContext] --> SDK[openSpecdHost]
  PS[project status] --> BPS[buildProjectStatusSnapshot]
  GS[graph stats] --> WOGP[withOpenGraphProvider]
  GI[graph index worker] --> RIPG[runIndexProjectGraph]
  BPS --> SDK
  WOGP --> SDK
  RIPG --> SDK
  SDK --> CORE[@specd/core]
  SDK --> CG[@specd/code-graph]
```

```
┌──────────────────┐     ┌─────────────────┐
│ resolveCliContext│────▶│ openSpecdHost   │
└────────┬─────────┘     └────────┬────────┘
         │                        │
    ┌────┴────┐              ┌────┴────┐
    │ project │              │  @specd │
    │ status  │──build──────▶│   /sdk  │
    └─────────┘  Snapshot     └────┬────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        ┌───────────┐      ┌────────────┐      ┌──────────────┐
        │ graph     │      │ graph stats│      │ graph index  │
        │ (context) │      │ withOpen.. │      │ runIndex...  │
        └───────────┘      └────────────┘      └──────────────┘
```

## Migration / Rollback

1. Land SDK barrel extensions first (backward compatible).
2. Migrate `resolveCliContext`, then graph commands, then import sweep.
3. Run full CLI test suite: `pnpm --filter @specd/cli test`.
4. **Rollback:** revert package.json + imports; no data migration.

## Testing

**Automated:**

| Test file                                                                  | Asserts                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `cli/test/helpers/cli-context.spec.ts`                                     | `openSpecdHost` called; logging options forwarded                             |
| `cli/test/commands/project-status.spec.ts`                                 | Freshness always present; `--graph` hotspots; no code-graph import in handler |
| `cli/test/commands/graph-stats.spec.ts`                                    | `withOpenGraphProvider` path; lock guard; output shape                        |
| `cli/test/commands/graph-index.spec.ts`                                    | Worker calls `runIndexProjectGraph`; lock/spawn unchanged                     |
| `cli/test/commands/graph-index-integration.spec.ts`                        | Real SDK bootstrap index with `--force`                                       |
| `cli/test/version.spec.ts`, `entrypoint.spec.ts`                           | Installed package versions on `--help` banner                                 |
| `code-graph/test/application/use-cases/staleness-detection.verify.spec.ts` | Derivation fingerprint per `staleness-detection/verify.md`                    |
| `code-graph/test/application/use-cases/workspace-indexing.spec.ts`         | Strict stored fingerprint map vs effective config                             |
| `sdk/test/composition/package-boundary.spec.ts`                            | SDK depends only on core + code-graph                                         |
| `mcp/test/package.spec.ts`                                                 | MCP depends only on `@specd/sdk`                                              |
| `cli/test/commands/graph-search.spec.ts`                                   | Regression — still works via SDK imports                                      |

**Manual / E2E:**

```bash
node packages/cli/dist/index.js project status --format toon
node packages/cli/dist/index.js project status --graph --format json
node packages/cli/dist/index.js graph stats
node packages/cli/dist/index.js graph index --format text
node packages/cli/dist/index.js graph index --force --format text
```

Expected: same field names and exit codes as pre-migration. Staleness warnings still appear when graph stale. Banner shows installed cli/sdk/core/graph versions. `--force` completes without `StoreNotOpenError`.

**Lint:** `pnpm --filter @specd/cli lint` — no direct `@specd/core` / `@specd/code-graph` imports in CLI src.

## Documentation

Update `docs/core/sdk.md`:

- CLI/MCP depend on `@specd/sdk` only
- List interim re-exports added for host adapters
- Reparto table mapping commands → SDK functions

No `docs/cli/cli-reference.md` changes — command signatures unchanged.

## Open questions

_none_
