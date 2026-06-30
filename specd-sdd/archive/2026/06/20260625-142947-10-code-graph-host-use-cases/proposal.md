# Proposal: 10-code-graph-host-use-cases

## Motivation

CLI (`graph stats`, `graph index`) and `project status --graph` duplicate graph orchestration — VCS ref resolution, staleness/fingerprint comparison, workspace target assembly, and index execution — that belongs in `@specd/code-graph` application use cases. Change `11-sdk-host-facade` needs `GetGraphHealth` and `IndexProjectGraph` for `buildProjectStatusSnapshot` and `runIndexProjectGraph`; Studio paths need reusable coverage queries. Extracting G1 use cases now removes duplication before SDK/CLI migration.

## Current behaviour

- `packages/cli/src/commands/graph/stats.ts` opens a provider, calls `getStatistics()`, then independently resolves VCS ref, runs `isGraphStale`, and computes fingerprint mismatch via `ListWorkspaces` + `buildProjectGraphConfig`.
- `packages/cli/src/commands/graph/index-graph.ts` assembles workspace targets, resolves VCS ref, merges graph config, and calls `provider.index()` — plus CLI-only worker subprocess and lock acquisition.
- `packages/cli/src/commands/project/status.ts` duplicates graph health logic in `loadGraphData`.
- No `GetSpecCoverage` or `GetChangeSpecCoverage` use cases exist; coverage would require callers to orchestrate provider query methods and change spec lists manually.
- `graph search`, `hotspots`, and `impact` correctly stay as direct `CodeGraphProvider` methods — no use case layer.

## Proposed solution

Add four application use cases in `@specd/code-graph`, each with a `create*` factory exported from the package:

| Use case                | Responsibility                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `GetGraphHealth`        | Lock check, statistics, VCS staleness, derivation fingerprint mismatch              |
| `IndexProjectGraph`     | Workspace-ready index execution (config merge, optional recreate, `provider.index`) |
| `GetSpecCoverage`       | Covered files/symbols for one spec via open provider                                |
| `GetChangeSpecCoverage` | Coverage summary for all specs in a named change                                    |

Use cases receive an already-open `CodeGraphProvider` and project inputs; provider open/close stays in SDK `withOpenGraphProvider` or CLI `withProvider`. CLI keeps adapter concerns: worker subprocess, lock acquisition before spawn, formatting, exit codes. Wire `graph stats` and index body through the new use cases; leave full CLI→SDK migration to change `12-cli-mcp-sdk-migration`.

## Specs affected

### New specs

- `code-graph:get-graph-health`: application use case returning graph statistics plus staleness and fingerprint diagnostics
  - Depends on: `code-graph:composition`, `code-graph:staleness-detection`, `core:config`, `core:list-workspaces`

- `code-graph:index-project-graph`: application use case executing project graph indexing with merged config and optional force recreate
  - Depends on: `code-graph:composition`, `code-graph:indexer`, `code-graph:graph-store`, `core:config`

- `code-graph:get-spec-coverage`: application use case returning implementation coverage for a single spec from the graph
  - Depends on: `code-graph:composition`, `code-graph:symbol-model`

- `code-graph:get-change-spec-coverage`: application use case returning per-spec coverage for a change's spec scope
  - Depends on: `code-graph:get-spec-coverage`, `code-graph:composition`, `core:change-repository-port`

### Modified specs

- `code-graph:composition`: export host use case factories and result types; document that use cases sit above the provider facade
  - Depends on (added): `code-graph:get-graph-health`, `code-graph:index-project-graph`, `code-graph:get-spec-coverage`, `code-graph:get-change-spec-coverage`
  - Depends on (removed): none

- `code-graph:staleness-detection`: clarify that staleness primitives are orchestrated by `GetGraphHealth`; no policy change
  - Depends on (added): `code-graph:get-graph-health`
  - Depends on (removed): `cli:graph-stats`

- `cli:graph-stats`: delegate health assembly to `GetGraphHealth` instead of inline orchestration
  - Depends on (added): `code-graph:get-graph-health`
  - Depends on (removed): none

- `cli:graph-index`: delegate index execution body to `IndexProjectGraph`; worker subprocess and lock remain CLI
  - Depends on (added): `code-graph:index-project-graph`
  - Depends on (removed): none

## Impact

| Area                                             | Change                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `packages/code-graph/src/application/use-cases/` | Four new use case modules + result types                                       |
| `packages/code-graph/src/composition/use-cases/` | Four `create*` factories                                                       |
| `packages/code-graph/src/index.ts` (exports)     | Export use cases per composition spec                                          |
| `packages/cli/src/commands/graph/stats.ts`       | Call `createGetGraphHealth` / `execute`                                        |
| `packages/cli/src/commands/graph/index-graph.ts` | Call `createIndexProjectGraph` for worker indexing body                        |
| `packages/cli/src/commands/project/status.ts`    | Optional: reuse `GetGraphHealth` in `loadGraphData` (same change or follow-up) |
| `packages/code-graph/test/`                      | Unit tests for health, index, coverage use cases                               |

Blast radius: **MEDIUM** — touches `CodeGraphProvider` consumers in CLI; no kernel changes. **Overlap:** `cli:graph-stats`, `cli:graph-index` also targeted by `12-cli-mcp-sdk-migration` — archive this change first.

**Out of scope:** SDK facade (`11-sdk-host-facade`), MCP migration, presenter/DTO layers, auto-indexing, moving worker subprocess out of CLI.

## Technical context

Agreed contracts from exploration (`core-refactor-on-main.md` G1):

```ts
// GetGraphHealth
interface GetGraphHealthInput {
  config: SpecdConfig
  provider: CodeGraphProvider
  workspaces?: WorkspaceIndexTarget[] // for fingerprint when kernel available
  codeGraphVersion: string
}
interface GetGraphHealthResult extends GraphStatistics {
  stale: boolean | null
  currentRef: string | null
  fingerprintMismatch: boolean | null
}

// IndexProjectGraph
interface IndexProjectGraphInput {
  provider: CodeGraphProvider
  projectRoot: string
  workspaces: WorkspaceIndexTarget[]
  graphConfig: ProjectGraphConfig
  codeGraphVersion: string
  vcsRef?: string
  force?: boolean
  onProgress?: IndexProgressCallback
}

// GetChangeSpecCoverage
// execute(provider, changes: ChangeRepository, { changeName }) → ChangeNotFoundError if missing
```

- `code-graph` MAY depend on `@specd/core` types and ports; `core` MUST NOT depend on `code-graph`.
- `GetGraphHealth` calls `assertGraphIndexUnlocked` before statistics when lock checking is requested (CLI path).
- `IndexProjectGraph` performs `provider.recreate()` when `force: true` before `provider.index()`.
- Search/hotspots/impact remain direct provider methods re-exported via SDK — no use cases.
- Sequencing: parallel with core P2; **before** `11-sdk-host-facade`; CLI thin migration deferred to `12-cli-mcp-sdk-migration`.

## Open questions

_none — fast-forward all design artifacts; use dedicated use-case specs following `core:get-project-summary` pattern._
