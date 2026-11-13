# SDK Run Graph Impact

## Purpose

Provides a host-agnostic SDK orchestration function `runGraphImpact` that performs file, symbol, and spec impact analysis across the code graph and projects all target and affected paths onto `projectRelativePath`. Hosts (CLI, MCP, IDE plugins) consume this orchestrator directly.

## Requirements

### Requirement: runGraphImpact orchestration

`runGraphImpact(ctx: SdkHostContext, input: RunGraphImpactInput): Promise<RunGraphImpactResult>` SHALL:

1. Accept target selectors across all four supported target types:
   - `files`: one or more file selectors (`workspace:path`, config-relative, or absolute).
   - `symbol`: symbol identifier or qualified name.
   - `spec`: specification identifier (`workspace:capability-path`).
   - `export` and `from` (or `surface`): public export route name and surface file.
2. Accept traversal direction (`upstream`, `downstream`, `both`, `dependents`, `dependencies`) and `depth` (positive integer, defaulting to 3).
3. Accept provider-side filter constraints `filter: ImpactResultFilter` covering `types`, `kinds`, `workspaces`, `excludeWorkspaces`, `categories`, `includeTests`, and `includeIgnored`.
4. When `input.provider` is omitted, open a transient provider using `withOpenGraphProvider(ctx, ...)`. When provided, execute on the supplied open provider directly.
5. For file targets: resolve selectors using `provider.resolveFileSelector` and execute `provider.analyzeFileImpact` (or `provider.analyzeFilesImpact` for multiple files).
6. For symbol targets: resolve selector using `provider.resolveSymbolSelector` and execute `provider.analyzeImpact`.
7. For spec targets: validate spec existence using `provider.getSpec` and execute `provider.analyzeSpecImpact`.
8. For public export targets: resolve public surface and binding using `provider.resolveSymbolReference` and `provider.getExactPublicBinding`, and execute `provider.analyzePublicBindingImpact`.
9. Forward traversal direction, depth, and `filter` options to the corresponding provider method.
10. Project all target and affected file/symbol locations to `projectRelativePath` using project and workspace configuration alone (`ctx.kernel.project.getConfig.execute()`):
    - Single-file impact: target exposes `canonicalPath` and `projectRelativePath`.
    - Multi-file impact: targets expose `targets` (canonical) and `projectRelativeTargets`.
    - Symbol impact: target symbol location exposes `projectRelativePath`.
    - Public export impact: public surface exposes `projectRelativeSurface`.
    - Affected files: list paths formatted as `projectRelativePath`.
    - Affected symbols: reference locations projected to `projectRelativePath`.
11. Return `RunGraphImpactResult` containing aggregate metrics (`riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`, `omittedCounts`).

### Requirement: Elimination of displayPath and displayTargets

`RunGraphImpactResult` SHALL expose `projectRelativePath` and `projectRelativeTargets`, and SHALL NOT expose `displayPath` or `displayTargets`.

### Requirement: Pure path projection

Path projection SHALL NOT perform graph store reads or availability validation, deriving project-relative paths exclusively from project configuration.

### Requirement: No presenter formatting

`runGraphImpact` SHALL return pure structured data. Terminal text blocks, trees, depth annotations, and ANSI formatting remain in host presenters.

## Spec Dependencies

- [`sdk:host-context`](../host-context/spec.md) — host context for kernel and provider access
- [`sdk:with-open-graph-provider`](../with-open-graph-provider/spec.md) — provider lifecycle helper
- [`core:config`](../../../../specs/core/config/spec.md) — project configuration and workspace code roots
- [`code-graph:traversal`](../../../../specs/code-graph/traversal/spec.md) — impact traversal algorithms
- [`code-graph:workspace-integration`](../../../../specs/code-graph/workspace-integration/spec.md) — workspace selector resolution
