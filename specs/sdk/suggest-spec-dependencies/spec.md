# sdk:suggest-spec-dependencies

## Purpose

Maintaining canonical inter-spec `dependsOn` locks in `spec-lock.json` ensures full traceability across workspace capabilities. `SuggestSpecDependencies` is an application use case in `@specd/sdk` that automatically deduces inter-spec dependencies by analyzing code import graphs and barrel re-exports, validating post-apply spec health, and conditionally requesting requirement-alignment changes through Core ports.

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
   - Evaluates cached-entry freshness through `SpecDepsSuggestionCachePort.get()` (header `cacheVersion === '1.1.0'` is enforced when the cache file loads; per-entry validation inside `get()` applies the same three-stage identity check as the implementation cache — cheap size/mtime pre-filter, then content-hash precedence, then timestamp fallback). On cache HIT (and when `rebuildCache` is false), serves cached suggested dependencies directly.
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
   - Persists computed spec dependency suggestions incrementally to `SpecDepsSuggestionCachePort` (`specDepsCache.flush()`) upon completing analysis of each specification, storing the file-to-spec map fingerprint as `fileToSpecFingerprint` on each entry and guaranteeing progress preservation against interruptions.
3. **Pass 3 (Mutation, Post-Apply Validation & Conditional Change Creation)**:
   - Before any mutation, requires a `ValidateSpecs` dependency and, when `createAlignmentChange: true`, a `CreateChange` dependency. Missing required dependencies MUST raise `InvalidInputError` before `UpdatePersistedSpecDeps` is called.
   - When `apply: true` is set, unions ONLY NEW dependency spec IDs (`alreadyIncluded === false`) into `spec-lock.json` via `UpdatePersistedSpecDeps`.
   - Always runs `ValidateSpecs` (`kernel.specs.validate`) after mutation; validation is not an optional post-apply collaborator. It MUST interpret the canonical result `{ entries, totalSpecs, passed, failed }`: each entry with `passed: false` is invalid, and its `failures` and `warnings` provide the diagnostic detail. The use case MUST NOT depend on an `issues` property or synthesize validity from a non-contract field.
   - If invalid specs exist (`status: "invalid-specs-detected"`) AND `createAlignmentChange: true` is authorized:
     - Creates a single alignment change gathering ALL failing specs: `align-spec-deps-<timestamp>`.
     - Passes the formatted schema validation failures (`[artifactId: description]`) as optional `explorationContent` to `CreateChange.execute`; it MUST NOT write a repository path or exploration file directly.
   - If `ValidateSpecs` itself throws, the failure MUST remain observable to the caller and MUST NOT be converted to `{ status: "all-valid", invalidSpecs: [] }`. A validator failure cannot prove that mutated specs are valid.
   - If all specs are valid (`status: "all-valid"`), NO alignment change is created under any circumstances.

### Requirement: Modular Transitive Reduction & Invariant Graph Engine

The dependency deduction orchestration SHALL delegate transitive edge pruning to a shared, pure `TransitiveReductionEngine`:

1. Given a dependency adjacency map `Map<string, Set<string>>`, the engine SHALL compute reachability between candidate targets.
2. If target $B \in \text{directDeps}(A)$ and target $C$ is reachable from $B$, the direct edge $A \rightarrow C$ SHALL be deterministically pruned from $A$'s direct dependency set.
3. The algorithm SHALL be pure, acyclic, and reusable across both active spec lock deduction and brownfield specification discovery.

### Requirement: Early Graph Staleness Diagnostics

Prior to executing dependency deduction and call-graph tracing, the use case SHALL probe the freshness and health of the injected code graph provider via `codeGraphProvider.getGraphHealth()`. If the graph is stale, the use case SHALL emit a `stale-warning` progress event and populate `codeGraphStale: boolean` in `SuggestSpecDependenciesResult`.

### Requirement: Multi-Process Cache Locking and Flush Merging

The spec dependencies suggestion filesystem cache SHALL protect all concurrent write and warmup operations across multiple OS processes via kernel-level atomic lock files (`<cachePath>.lock`) using `O_EXCL` file creation (`open(..., 'wx')`) with automatic stale lock reaping:

1. **Warmup & Batch Operations**: The cache port SHALL expose `withLock<T>(fn: () => Promise<T>)` to execute warmup analysis under an exclusive lock, preventing parallel processes from performing redundant analysis.
2. **Re-entrant In-Process Locking**: In-process lock acquisition SHALL be re-entrant via reference counting.
3. **Flush Merging**: On `flush()`, the cache SHALL acquire the lock, re-read the latest disk state, merge in-memory entries with entries written concurrently by other processes, and atomically write the merged payload.
4. **Typed Error on Contention Timeout**: If the exclusive lock cannot be acquired within the configured timeout, the cache SHALL throw `CacheLockError` (error code `CACHE_LOCKED`).

### Requirement: Dependency-injected factory

The application module MUST provide the canonical dependency-injected factory:

- `createSuggestSpecDependencies(deps: SuggestSpecDependenciesDeps): SuggestSpecDependencies`

Config-based overloads and concrete dependency resolution belong to `sdk:composition` and MUST delegate to this canonical factory.

## Constraints

- Operates exclusively through `SpecRepository`, cache ports, and core application use cases for spec, lock, validation, and change data access. The application module MUST NOT import `node:fs`, filesystem repositories, filesystem caches, or repository path conventions.
- Never creates an alignment change if post-apply validation returns `status: "all-valid"`.

## Spec Dependencies

- [`sdk:suggest-implementation-links`](../suggest-implementation-links/spec.md) — implementation cache warm-up
- [`code-graph:traversal`](../../code-graph/traversal/spec.md) — impact and import graph traversal
- [`core:get-persisted-spec-deps`](../../core/get-persisted-spec-deps/spec.md) — query persisted dependencies
- [`core:update-persisted-spec-deps`](../../core/update-persisted-spec-deps/spec.md) — mutate persisted dependencies
- [`core:create-change`](../../core/create-change/spec.md) — create an optional alignment change and supply its exploration content
