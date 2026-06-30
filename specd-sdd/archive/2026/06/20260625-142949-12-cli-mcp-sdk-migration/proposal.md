# Proposal: 12-cli-mcp-sdk-migration

## Motivation

After `@specd/sdk` (change 11) ships, CLI and MCP still import `@specd/core` and `@specd/code-graph` directly and duplicate host bootstrap and graph orchestration. Phase **A2b** migrates delivery adapters to depend on `@specd/sdk` only so orchestration lives in one place before A3 public API curation.

## Current behaviour

- `@specd/cli` depends on `@specd/core` and `@specd/code-graph`; `resolveCliContext` calls `loadConfig` + `createCliKernel` locally.
- Graph commands use CLI-local helpers (`withProvider`, `resolveGraphCliContext`, `createGetGraphHealth`, `createCodeGraphProvider`) wired directly to code-graph factories.
- `project status` manually combines `getProjectSummary` with inline `GetGraphHealth` / provider lifecycle for graph freshness and `--graph`.
- `graph index` orchestrates workspace listing and `IndexProjectGraph` inline (worker/lock stays CLI-only).
- `@specd/mcp` depends on `@specd/core` only; package is a stub with no tools yet.
- `core:composition` permits direct core bootstrap in delivery hosts until change 12 completes.
- Hosts cannot enforce the SDK-as-facade boundary from change 11.

## Proposed solution

1. **Package dependencies**: `@specd/cli` and `@specd/mcp` depend on `@specd/sdk` only — remove direct `@specd/core` / `@specd/code-graph` runtime deps (transitive via SDK).
2. **`resolveCliContext`**: thin wrapper (~10 lines) over `openSpecdHost` with CLI-specific `kernelOptions` (verbosity, log destinations).
3. **Shared graph context**: `resolveGraphCliContext` and `withProvider` rewire to `@specd/sdk` lifecycle helpers.
4. **Command delegation** per reparto table:

| Command / area                           | Delegation target                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| change status/transition/context/approve | `kernel.changes.*`; approve via `kernel.changes.approveSpec` / `approveSignoff` |
| project context                          | `kernel.project.getProjectContext`                                              |
| project init                             | `createConfigWriter().initProject()`                                            |
| plugins list                             | `createConfigLoader().load()` / `getConfig`                                     |
| plugins install/uninstall                | `createConfigWriter().addPlugin()` / `removePlugin()`                           |
| project status (graph fields)            | `buildProjectStatusSnapshot`                                                    |
| graph stats                              | `withOpenGraphProvider` + `GetGraphHealth` via SDK host                         |
| graph index                              | `runIndexProjectGraph` (+ CLI lock/worker retained)                             |
| graph search/hotspots/impact             | provider direct via SDK-backed graph CLI context                                |

5. **SDK barrel**: interim re-exports of lock/health helpers for CLI adapters until A3 curation.
6. **No output regression**: text, json, and toon output shapes unchanged.

## Specs affected

### New specs

- `cli:host-context`: `resolveCliContext` delegates to `openSpecdHost`; CLI package SDK-only dependency boundary.
  - Depends on: `cli:entrypoint`, `sdk:host-context`, `sdk:composition`
- `cli:graph-cli-context`: shared `resolveGraphCliContext` and `withProvider` SDK delegation for all graph commands.
  - Depends on: `cli:host-context`, `cli:entrypoint`, `core:config`, `sdk:with-open-graph-provider`, `sdk:composition`

### Modified specs

- `cli:project-status`: graph freshness and `--graph` delegate to `buildProjectStatusSnapshot`.
  - Depends on (added): `sdk:build-project-status-snapshot`, `sdk:host-context`
  - Depends on (removed): none
- `cli:graph-index`: index execution delegates to `runIndexProjectGraph`; CLI retains lock/worker/progress.
  - Depends on (added): `sdk:run-index-project-graph`
  - Depends on (removed): none
- `cli:graph-stats`: stats via SDK host context and `withOpenGraphProvider`.
  - Depends on (added): `sdk:with-open-graph-provider`, `sdk:host-context`
  - Depends on (removed): `code-graph:composition`
- `cli:graph-search`: search opens provider via SDK-backed graph CLI context.
  - Depends on (added): `cli:graph-cli-context`
  - Depends on (removed): none
- `cli:graph-hotspots`: hotspots via SDK-backed graph CLI context.
  - Depends on (added): `cli:graph-cli-context`
  - Depends on (removed): none
- `cli:graph-impact`: impact analysis via SDK-backed graph CLI context.
  - Depends on (added): `cli:graph-cli-context`
  - Depends on (removed): none
- `cli:entrypoint`: host package SDK dependency boundary for CLI and MCP.
  - Depends on (added): `cli:host-context`
  - Depends on (removed): none
- `sdk:composition`: A2b interim barrel re-exports for CLI lock/health helpers.
  - Depends on (added): `cli:host-context`
  - Depends on (removed): none
- `core:composition`: close post-migration exception — CLI/MCP MUST use SDK bootstrap.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Packages**: `packages/cli/`, `packages/mcp/package.json`, `packages/sdk/src/index.ts`
- **Tests**: CLI test mocks and import sweep across all graph commands
- **Dependencies**: CLI/MCP runtime deps shrink to `@specd/sdk` (+ plugins/schema for CLI)
- **Overlap**: `cli:graph-impact` with `file-impact-covering-specs`, `graph-change-context`; `core:composition` with `13-public-api-surface` — reconcile at archive
- **Sequencing**: requires archived 11, 08, 10, 09; precedes 13-public-api-surface

## Technical context

- Source: `core-refactor-on-main.md` phase A2b
- Prerequisite from 09: approve via `kernel.changes.approveSpec` / `approveSignoff`
- Lock subprocess for `graph index` stays in CLI adapter
- Interim SDK re-exports until A3 public API curation

## Open questions

_none_
