# Proposal: 11-sdk-host-facade

## Motivation

CLI, MCP, API, and IPC hosts each duplicate `loadConfig` → `createKernel` → `createCodeGraphProvider` wiring. Phase **A2a** introduces `@specd/sdk` as the single host bootstrap and cross-package orchestration layer so delivery adapters stop importing `@specd/core` and `@specd/code-graph` directly for lifecycle concerns.

## Current behaviour

- `resolveCliContext` in the CLI loads config and builds a CLI-specific kernel independently of graph commands.
- Graph commands call `createCodeGraphProvider(config)` and manage `open()` / `close()` in local helpers (`withProvider`).
- `project status --graph` manually combines `kernel.project.getProjectSummary` with `GetGraphHealth` from code-graph.
- `graph index` duplicates workspace listing, VCS detection, and `IndexProjectGraph` orchestration.
- No `@specd/sdk` package or workspace exists; hosts cannot depend on a curated facade.

## Proposed solution

Create `packages/sdk` (`@specd/sdk`) depending on `@specd/core` and `@specd/code-graph`. Export:

| Capability                | Functions                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Host context              | `openSpecdHost`, `createSdkContext`, `SdkHostContext`                                         |
| Graph lifecycle           | `withOpenGraphProvider`                                                                       |
| Status snapshot           | `buildProjectStatusSnapshot`                                                                  |
| Graph index orchestration | `runIndexProjectGraph`                                                                        |
| Re-exports                | `createConfigLoader`, `createConfigWriter`, `createKernel` (minimal A2a; full curation in A3) |

`SdkHostContext` holds `{ kernel, createGraphProvider }` with config read via `kernel.project.getConfig` — no duplicate config storage. Config writes remain `createConfigWriter()` from core.

## Specs affected

### New specs

- `sdk:composition`: package structure, dependencies, public barrel rules for A2a
  - Depends on: `default:_global/architecture`, `core:composition`, `code-graph:composition`
- `sdk:host-context`: `openSpecdHost`, `createSdkContext`, `SdkHostContext` type
  - Depends on: `sdk:composition`, `core:kernel`, `core:composition`
- `sdk:with-open-graph-provider`: provider open/close lifecycle helper
  - Depends on: `sdk:host-context`, `code-graph:composition`
- `sdk:build-project-status-snapshot`: combines `GetProjectSummary` + `GetGraphHealth`
  - Depends on: `sdk:host-context`, `core:get-project-summary`, `code-graph:get-graph-health`
- `sdk:run-index-project-graph`: workspace listing + VCS + `IndexProjectGraph`
  - Depends on: `sdk:with-open-graph-provider`, `code-graph:index-project-graph`, `core:list-workspaces`

### Modified specs

- `core:composition`: document that `@specd/sdk` is the preferred host orchestration entry for config + kernel + graph bootstrap
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel`: no requirement changes — SDK consumes existing kernel contract (`kernel.changes.approveSpec` / `approveSignoff`, `kernel.project.getConfig`)
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **New package**: `packages/sdk/` with composition + orchestration modules
- **New workspace**: `sdk` in `specd.yaml` → `specs/sdk/`
- **No host migration yet**: CLI/MCP migration is change `12-cli-mcp-sdk-migration`
- **Dependencies**: `@specd/core`, `@specd/code-graph` only; no new runtime deps
- **Overlap**: `core:composition` also targeted by `13-public-api-surface` — reconcile at archive time

## Technical context

- Source: `core-refactor-on-main.md` phase A2a
- `SdkHostContext`: `{ kernel: Kernel; createGraphProvider: () => CodeGraphProvider }`
- Config reads: `ctx.kernel.project.getConfig.execute()` — requires archived P0c `getConfig`
- Config writes: `createConfigWriter()` — not kernel methods (symmetric with `createConfigLoader`)
- Approval gates baked at kernel construction (archived `09-core-approval-gates-baked`); SDK passes `{ name, reason }` only
- `buildProjectStatusSnapshot` and `runIndexProjectGraph` depend on archived `core:get-project-summary` and code-graph host use cases (`get-graph-health`, `index-project-graph`)
- Lock subprocess for graph index stays in CLI adapter (out of scope)
- Presenters/DTOs for API/IPC out of scope

## Open questions

_none — SDK specs separated per capability per user direction; re-export curation deferred to A3 (`13-public-api-surface`)._
