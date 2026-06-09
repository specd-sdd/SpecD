# Tasks: improve-code-graph-path-search

## 1. Core config, port and orchestration

- [x] 1.1 Add root-level graph config and reserve `root`
      `packages/core/src/application/specd-config.ts`: `SpecdWorkspaceGraphConfig`, `SpecdWorkspaceConfig`, `SpecdConfig` — extend config types with `graph.includePaths`, global `graph.excludePaths`, and `workspace.graph.allowedPaths`, and reserve `root` as a non-workspace namespace.
      Approach: model `graph.includePaths` as project-global patterns, `graph.excludePaths` as mandatory global file/document excludes, and `allowedPaths` as workspace-scoped graph-only patterns; keep them additive so existing non-graph consumers remain unaffected.
      (Req: Workspaces, Workspace graph config, Project graph config)
- [x] 1.2 Validate new graph config keys in the FS config loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader`, Zod schema helpers — parse the new graph keys and fail fast when a workspace name is `root`.
      Approach: keep validation in startup config loading, not in CLI commands; reject `root` alongside the existing workspace-shape checks.
      (Req: Workspaces, Workspace graph config, Project graph config, Startup validation)
- [x] 1.3 Update config loader tests for graph paths and reserved namespace
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: new describe blocks — cover accepted `graph.includePaths`, accepted global `graph.excludePaths`, accepted `workspace.graph.allowedPaths`, and rejection of workspace name `root`.
      Approach: add focused fixture configs instead of expanding unrelated test helpers; assert loader output shape and exact validation failures.
      (Req: Workspaces, Workspace graph config, Project graph config)
- [x] 1.4 Replace raw `spec-lock` port APIs with semantic persisted-spec operations
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository` — remove `readSpecLock` / `saveSpecLock` from the public contract and replace them with repository operations for persisted schema identity, persisted `dependsOn`, persisted implementation links, a stable reusable spec hash, and a total spec count.
      Approach: keep the contract semantic instead of filesystem-shaped; do not name the hash API `indexHash` because it is reusable outside code-graph.
      Substeps: - [x] 1.4.1 Add `readPersistedSchema(spec) → { name, version } | null` abstract method - [x] 1.4.2 Add `readPersistedDependsOn(spec) → readonly string[] | null` abstract method - [x] 1.4.3 Add `readPersistedImplementation(spec) → readonly { file, symbols? }[] | null` abstract method - [x] 1.4.4 Add `specHash(spec) → string | null` abstract method - [x] 1.4.5 Add `count() → Promise<number>` abstract method - [x] 1.4.6 Add `savePersistedSchema(spec, content, options?) → void` abstract method - [x] 1.4.7 Add `savePersistedDependsOn(spec, dependsOn, options?) → void` abstract method - [x] 1.4.8 Add `savePersistedImplementation(spec, entries, options?) → void` abstract method - [x] 1.4.9 Remove `abstract readSpecLock` and `abstract saveSpecLock` from `SpecRepository`
- [x] 1.5 Implement semantic persisted-spec operations and counting in the filesystem repository
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository` — back the new semantic operations, stable spec hash, count, and filesystem-backed `specsPath` capability using internal `spec-lock.json`, metadata, and artifacts.
      Approach: preserve current archive-time semantics and conflict detection, but make `spec-lock.json` an adapter-internal detail rather than a port-level API. Implement `count()` by counting directories in the specs path and expose that canonical root for discovery exclusion.
      Substeps: - [x] 1.5.1 Implement semantic read/write operations and `specHash` - [x] 1.5.2 Implement `count()` — return the total number of specs discovered in the workspace - [x] 1.5.3 Change `readSpecLock` / `saveSpecLock` in `FsSpecRepository` from `override` to `private`
- [x] 1.6 Migrate core use cases to new semantic operations
      `generate-spec-metadata.ts`, `load-persisted-spec-depends-on.ts`, `archive-change.ts` — replace all raw sidecar access with semantic repository calls.
- [x] 1.7 Introduce `ListWorkspaces` use case
      `packages/core/src/application/use-cases/list-workspaces.ts`: `ListWorkspaces` — create a new use case that orchestrates `SpecdConfig.workspaces` with their respective `SpecRepository` instances.
      Approach: return rich `ProjectWorkspace` objects that bundle identity, paths, ownership, and the repository instance.
      (Req: Workspaces, Indexing behaviour)
- [x] 1.8 Expose `ListWorkspaces` in the `Kernel`
      `packages/core/src/composition/kernel.ts`: `Kernel` interface and `createKernel` — register the new use case and expose it under a `workspaces` namespace.
      Approach: maintain manual dependency injection; pass the config and repo map to the use case.
- [x] 1.9 Update core test helpers
      `packages/core/test/application/use-cases/helpers.ts`: `StubSpecRepository` — implement `count()` in the stub.
      Approach: use `_specs.length` as the default implementation for the stub.

## 2. Code-graph domain model and selector normalization

- [x] 2.1 Introduce `DocumentNode` to the code-graph model
- [x] 2.2 Extend file identity semantics to support `root:`
- [x] 2.3 Add provider-owned file and symbol selector normalization
- [x] 2.4 Add unit coverage for root identities and selector normalization

## 3. Graph store contract and backends

- [x] 3.1 Extend the abstract `GraphStore` contract for documents and exact-match-aware search
- [x] 3.2 Implement document persistence and exact-match ranking in SQLite
- [x] 3.3 Implement document persistence and exact-match ranking parity in Ladybug
- [x] 3.4 Update graph-store backend tests

## 4. Indexing pipeline and workspace integration

- [x] 4.1 Rework `WorkspaceIndexTarget` and `IndexOptions`
      `packages/code-graph/src/domain/value-objects/index-options.ts`: remove `specs` callback and add `specRepo: SpecRepository`.
      Approach: inject the repository directly so the indexer can own the discovery and extraction logic.
- [x] 4.2 Move spec metadata extraction and discovery into `IndexCodeGraph`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: refactor the specs phase to iterate through the injected `specRepo`.
      Approach: use `specRepo.list()`, `specRepo.metadata()`, and `specRepo.artifact()` inside the indexer. Use `specRepo.count()` for progress reporting.
- [x] 4.3 Rework `IndexCodeGraph` discovery for full configured-project indexing
- [x] 4.3 Rework `IndexCodeGraph` discovery for full configured-project indexing
      Include effective discovery config merging (`graph.includePaths`, global `graph.excludePaths`, workspace graph filters), synthetic exclusion of filesystem-backed `specsPath` roots, and the rule that workspace-owned files must not be duplicated under `root:`.
- [x] 4.4 Move archived coverage derivation into `IndexCodeGraph`
- [x] 4.5 Update indexer and workspace integration tests
- [x] 4.6 Switch `IndexCodeGraph` to repository semantic reads and hashes
- [x] 4.7 Update code-graph test stubs for the new contract
      Update in-memory `SpecRepository` doubles in code-graph test helpers to include `count()`.

## 5. CLI commands and user-facing output

- [x] 5.1 Refactor `graph index` to use `ListWorkspaces`
      `packages/cli/src/commands/graph/build-workspace-targets.ts` and `index-graph.ts` — consume the new core use case instead of manual workspace-repo mapping.
      Approach: remove `buildWorkspaceTargets` logic as it moves to core and code-graph.
- [x] 5.2 Add document search category and exact-match-first behavior to `graph search`
- [x] 5.3 Broaden file and symbol selector handling in `graph impact`
- [x] 5.4 Remove `--workspace` from `graph index`
- [x] 5.5 Improve indexing progress output
      Update progress messages to show `N/M specs processed` using the total count from repositories.

## 6. Docs and end-to-end verification

- [x] 6.1 Update CLI reference documentation
- [x] 6.2 Run manual graph verification against the repo
