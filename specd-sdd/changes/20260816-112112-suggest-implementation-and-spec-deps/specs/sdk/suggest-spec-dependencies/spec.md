# sdk:suggest-spec-dependencies

## Purpose

Maintaining canonical inter-spec `dependsOn` locks in `spec-lock.json` ensures full traceability across workspace capabilities. `SuggestSpecDependencies` is an orchestration use case in `@specd/sdk` that automatically deduces inter-spec dependencies by analyzing code import graphs and barrel re-exports, validating post-apply spec health, and conditionally orchestrating requirement alignment changes.

## Requirements

### Requirement: Use Case Interface

`SuggestSpecDependencies` SHALL expose an `async execute(input: SuggestSpecDependenciesInput): Promise<SuggestSpecDependenciesResult>` method.

The input interface MUST support:

- `specId?: string` or `specIds?: readonly string[]`: Target specific spec IDs.
- `workspace?: string`: Target all specs within a specific workspace.
- `all?: boolean`: Target all specs across all workspaces.
- `apply?: boolean`: Optionally apply suggested `dependsOn` IDs to `spec-lock.json` via `UpdatePersistedSpecDeps`.
- `rebuildCache?: boolean`: Force cache invalidation.
- `createAlignmentChange?: boolean`: Authorize creation of an alignment change if invalid specs exist after applying dependencies.
- `changeNamePrefix?: string`: Custom prefix for the created change directory name.
- `onProgress?: OnSuggestSpecDepsProgress`: Optional progress callback emitting `warmup-start`, `warmup-progress`, `warmup-done`, `start`, `spec-start`, `spec-done`, `validation-start`, `validation-done`, and `done` events.

### Requirement: Input Validation & Error Handling

`SuggestSpecDependencies` MUST validate input parameters before execution and throw specific errors extending `SpecdError`:

- If no targeting option is specified (neither `specId`, `specIds`, `workspace`, nor `all: true`), `execute()` MUST throw `InvalidInputError`.
- If `workspace` is specified but does not exist in configured spec repositories or is empty, `execute()` MUST throw `WorkspaceNotFoundError` or `InvalidInputError`.
- When `specId` or `specIds` are specified in input, `SuggestSpecDependencies` MUST verify that each requested spec exists in the target repositories. If any requested spec ID is not found, `execute()` MUST throw a `SpecNotFoundError`.

### Requirement: Cache Warm-up & 2-Pass Dependency Deduction

`SuggestSpecDependencies` MUST execute a 3-pass algorithm:

1. **Pass 1 (Cache Warm-up & Global Reverse-Lookup Index)**:
   - Executes `SuggestImplementationLinks.execute({ all: true, apply: false })` in dry-run mode to ensure `ImplementationSuggestionCachePort` is warm across all monorepo specs.
   - Leverages `ImplementationSuggestionCachePort.findSpecByFile()` to resolve any relative production source file or barrel re-export to its owning `specId` in $O(1)$ without ad-hoc loops or manual hub filtering in the use case.
   - Initializes `SpecDepsSuggestionCachePort` (defaulting to `FsSpecDepsSuggestionCache` persisting under `.specd/tmp/fs-cache/spec-deps-suggestions/suggestions.json`).
2. **Pass 2 (AST Import Traversal, Directional Validation & Transitive Reduction)**:
   - Evaluates `SpecDepsSuggestionCachePort.isSpecFresh` (validating `cacheVersion === '1.1.0'`). On cache HIT (and when `rebuildCache` is false), serves cached suggested dependencies directly.
   - Additionally validates the cached entry's `fileToSpecFingerprint` against a fingerprint of the current global implementation file-to-spec map (computed after warm-up). When both values are present and differ — e.g. an imported file changed owner between runs without touching the target spec stamp or graph fingerprint — the entry is treated as a MISS and suggestions are recomputed.
   - On cache miss, evaluates `import` statements in target spec implementation files (retrieved via `SpecRepository` and `SuggestImplementationLinks`).
   - Runs `analyzeFileImpact` (`maxDepth = 1`) via `code-graph:traversal` to trace direct import relationships using workspace-normalized relative paths.
   - Maps imported target files to `specId` values via `implCache.findSpecByFile()`.
   - **Pass 2.5 (Directional Code Import Validation)**:
     - Validates directional code imports between target spec implementation files and candidate spec implementation files.
     - If candidate spec implementation files import target files, but target implementation files do not import candidate files, prunes the inverted candidate dependency from `suggestedDependsOn`.
   - **Pass 2.6 (Direct Recommendation Transitive Reduction)**:
     - For each candidate recommendation $B$, checks whether another candidate recommendation $A$ directly depends on $B$ ($B \in \text{directDeps}(A)$).
     - If $A$ directly depends on $B$, $B$ is pruned so only the first / most specific spec in the recommendation chain is suggested directly for the target spec.
   - Retains all non-pruned detected code import relationships in `suggestedDependsOn`, tagging each item with `status: 'already-configured' | 'new'` and `alreadyIncluded: boolean` so dependencies already present in `existingDependsOn` are explicitly rendered with `[already included]` tags in CLI output.
   - Persists computed spec dependency suggestions to `SpecDepsSuggestionCachePort` with header `cacheVersion: '1.1.0'`, storing the file-to-spec map fingerprint as `fileToSpecFingerprint` on each entry.
3. **Pass 3 (Mutation, Post-Apply Validation & Conditional Change Creation)**:
   - When `apply: true` is set, unions ONLY NEW dependency spec IDs (`alreadyIncluded === false`) into `spec-lock.json` via `UpdatePersistedSpecDeps`.
   - Runs `ValidateSpecs` (`kernel.specs.validate`).
   - If invalid specs exist (`status: "invalid-specs-detected"`) AND `createAlignmentChange: true` is authorized:
     - Creates a single alignment change gathering ALL failing specs: `align-spec-deps-<timestamp>`.
     - Writes `<changePath>/.specd-exploration.md` detailing exact schema validation failures `[artifactId: description]`.
   - If all specs are valid (`status: "all-valid"`), NO alignment change is created under any circumstances.

### Requirement: Standard Factory & Composition Overloads

`SuggestSpecDependencies` MUST provide 3 factory overload signatures:

- `createSuggestSpecDependencies(deps: SuggestSpecDependenciesDeps): SuggestSpecDependencies`
- `createSuggestSpecDependencies(config: SpecdConfig, options?: CompositionResolutionOptions): SuggestSpecDependencies`
- `createSuggestSpecDependencies(depsOrConfig: SuggestSpecDependenciesDeps | SpecdConfig, options?: CompositionResolutionOptions): SuggestSpecDependencies`

And a dependency resolution helper `resolveSuggestSpecDependenciesDeps(resolver: CompositionResolver): SuggestSpecDependenciesDeps`.

## Constraints

- Operates through `SpecRepository` and core application ports for spec and lock data access. Alignment change scaffolding (directory creation and `.specd-exploration.md` file writing) is permitted as a lightweight infrastructure concern within the orchestration layer.
- Never creates an alignment change if post-apply validation returns `status: "all-valid"`.

## Spec Dependencies

- [`sdk:suggest-implementation-links`](../suggest-implementation-links/spec.md) — implementation cache warm-up
- [`code-graph:traversal`](../../code-graph/traversal/spec.md) — impact and import graph traversal
- [`core:get-persisted-spec-deps`](../../core/get-persisted-spec-deps/spec.md) — query persisted dependencies
- [`core:update-persisted-spec-deps`](../../core/update-persisted-spec-deps/spec.md) — mutate persisted dependencies
