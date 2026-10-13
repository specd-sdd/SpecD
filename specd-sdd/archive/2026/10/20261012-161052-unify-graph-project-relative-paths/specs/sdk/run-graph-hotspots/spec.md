# SDK Run Graph Hotspots

## Purpose

Provides a host-agnostic SDK orchestration function `runGraphHotspots` that ranks code graph symbols by coupling impact and projects symbol file locations to `projectRelativePath`. Hosts (CLI, MCP, IDE plugins) consume this orchestrator directly.

## Requirements

### Requirement: runGraphHotspots orchestration

`runGraphHotspots(ctx: SdkHostContext, input?: RunGraphHotspotsInput): Promise<RunGraphHotspotsResult>` SHALL:

1. Accept hotspot filtering options covering 100% of code-graph hotspot options:
   - `workspace`: optional workspace name filter.
   - `kinds`: optional array of symbol kinds.
   - `file` or `filePath`: optional file path filter.
   - `excludePaths`: optional array of path glob exclusions.
   - `excludeWorkspaces`: optional array of workspace exclusions.
   - `limit`: optional maximum entries to return (defaulting to 20).
   - `minScore`: optional minimum coupling score threshold (defaulting to 1).
   - `minRisk`: optional minimum risk level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
   - `includeImporterOnly`: optional boolean to include symbols whose score is derived only from file importers.
   - `categories`: optional array of file categories (`source`, `test`, `ignored`).
   - `includeTests`: optional boolean to include test files in analysis.
   - `includeIgnored`: optional boolean to include ignored files in analysis.
   - `provider`: optional pre-opened caller-owned `CodeGraphProvider`.
2. When `input.provider` is omitted, open a transient provider using `withOpenGraphProvider(ctx, ...)`. When provided, execute on the supplied open provider directly.
3. Forward all options to `provider.getHotspots(...)`.
4. Project each hotspot entry's location to `projectRelativePath` using project configuration and workspace code roots (`ctx.kernel.project.getConfig.execute()`).
5. Include derived `workspace` name, symbol payload, `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, and `riskLevel`.
6. Return `RunGraphHotspotsResult` containing `totalSymbols`, `entries`, and `omittedCounts`.

### Requirement: Elimination of displayPath

`RunGraphHotspotsResult` entries SHALL expose `projectRelativePath` and SHALL NOT expose `displayPath`.

### Requirement: Pure path projection

The orchestration SHALL project canonical symbol locations to `projectRelativePath` using project and workspace configuration alone, without extra graph store queries.

### Requirement: No presenter formatting

`runGraphHotspots` SHALL return pure structured data. Terminal tables, text formatting, and CLI omission notices remain in host presenters.

## Spec Dependencies

- [`sdk:host-context`](../host-context/spec.md) — host context for kernel and provider access
- [`sdk:with-open-graph-provider`](../with-open-graph-provider/spec.md) — provider lifecycle helper
- [`core:config`](../../../../specs/core/config/spec.md) — project configuration and workspace code roots
- [`code-graph:composition`](../../../../specs/code-graph/composition/spec.md) — code graph provider composition
- [`code-graph:hotspots`](../../../../specs/code-graph/hotspots/spec.md) — hotspot ranking algorithm
