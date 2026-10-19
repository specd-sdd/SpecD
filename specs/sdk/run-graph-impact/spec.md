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
6. For spec targets: validate spec existence using `provider.getSpec` and execute `provider.analyzeSpecImpact`.
7. For public export targets: resolve public surface and binding using `provider.resolveSymbolReference` and `provider.getExactPublicBinding`, and execute `provider.analyzePublicBindingImpact`.
8. Forward traversal direction, depth, and `filter` options to the corresponding provider method.
9. Project all target and affected file/symbol locations to `projectRelativePath` using project and workspace configuration alone (`ctx.kernel.project.getConfig.execute()`):
   - Single-file impact: target exposes `canonicalPath` and `projectRelativePath`.
   - Multi-file impact: targets expose `targets` (canonical) and `projectRelativeTargets`.
   - Symbol impact: target symbol location exposes `projectRelativePath`.
   - Public export impact: public surface exposes `projectRelativeSurface`.
   - Affected files: list paths formatted as `projectRelativePath`.
   - Affected symbols: reference locations projected to `projectRelativePath`.
10. Return `RunGraphImpactResult` containing aggregate metrics (`riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, `affectedFilesCount`, `omittedCounts`).

6) For symbol targets: resolve the selector through the provider and execute the typed discriminated `provider.analyzeResolvedSymbolImpact` operation, as required by "Resolution-preserving symbol impact orchestration".

### Requirement: Resolution-preserving symbol impact orchestration

For a symbol target, `runGraphImpact` SHALL preserve the discriminated provider resolution through impact execution. A logical-target resolution MUST be passed to the provider impact operation with its canonical logical symbol, complete declaration set, and ordered resolution evidence. The SDK MUST NOT load one declaration and invoke impact using only that declaration's physical ID. It MUST NOT retain a compatibility branch that selects `declarations[0]` or calls a physical-only provider method for a logical target; provider implementations used by this API SHALL implement the typed discriminated operation.

Deprecated legacy summary fields such as `symbol` and `impact.target` MAY remain in `RunGraphImpactResult` only as display projections derived from the typed result after traversal. They MUST NOT select, widen, or narrow what is traversed. For a logical target, `impact.target` SHALL carry the canonical logical identity, not a physical declaration ID, and a human-readable name SHALL come from the canonical logical symbol rather than from parsing a physical ID.

An exact-declaration selector SHALL retain physical impact semantics. A public export selector SHALL continue to retain the exact binding route separately from canonical-target impact. Ambiguous or unresolved results MUST NOT start traversal.

`RunGraphImpactResult` SHALL expose the resolved target kind, canonical logical identity when present, contributing declaration locations, physical dependency evidence, logical affected targets, declaration-only affected evidence, and covering specs. Aggregate count and risk fields MUST document whether they count unique logical targets or physical occurrences.

Path projection SHALL project every retained declaration and evidence location to `projectRelativePath` without additional graph reads. This includes locations nested under `resolvedTarget`, resolution evidence, declaration sets, affected logical targets, declaration-only evidence, public-binding surfaces, and covering-spec evidence. No nested location returned by the public result MAY expose only a canonical workspace path when a project-relative projection is part of the result contract.

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
