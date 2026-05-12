# Tasks: align-code-graph-specs-with-implementation

## 1. Config model and graph root derivation

- [x] 1.1 Add resolved `configPath` to the loaded config model
      `packages/core/src/application/specd-config.ts`: `SpecdConfig` — add `readonly configPath: string` so graph code consumes a resolved project-level config root instead of inferring graph paths ad hoc.
      Approach: extend the existing interface additively, preserving current fields and defaults so non-graph callers remain source-compatible while graph commands gain a single resolved root.
      (Req: Graph config path)
- [x] 1.2 Parse and normalize `configPath` in the YAML loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdYamlZodSchema`, `FsConfigLoader.load()` — accept optional top-level `configPath`, default it to `.specd/config`, resolve it relative to the config file, and reject values that escape the repo root.
      Approach: normalize `configPath` exactly once in `load()` using the same repo-boundary validation style already used for storage paths, then return the resolved absolute path in `SpecdConfig`.
      (Req: Graph config path)
- [x] 1.3 Cover configPath defaults and explicit overrides in loader tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: config loader scenarios — verify omitted `configPath` resolves to `.specd/config` and explicit values derive `{configPath}/graph` and `{configPath}/tmp` without altering `storage.*`.
      Approach: add focused tests around `FsConfigLoader.load()` rather than command-level tests so config derivation stays pinned at the normalization layer.
      (Req: Graph config path, scenario: configPath defaults to repo-local graph config directory, scenario: Explicit configPath stays project-level)

## 2. Graph-store contract and Ladybug implementation

- [x] 2.1 Add `recreate()` to the abstract graph-store port
      `packages/code-graph/src/domain/ports/graph-store.ts`: `GraphStore` — introduce `recreate(): Promise<void>` as the destructive backend reset capability used by force reindexing.
      Approach: model recreation separately from `clear()` because it resets persisted backend state rather than only deleting logical graph rows inside an already-open store.
      (Req: Store recreation)
- [x] 2.2 Re-root Ladybug persistence under the config-owned graph and tmp directories
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `dbPath`, bulk-load temp helpers, and open-time directory setup — derive persistence from `{storagePath}/graph` and scratch artifacts from `{storagePath}/tmp`.
      Approach: reinterpret `storagePath` as the backend-owned config root, keep all Ladybug-specific filenames inside the adapter, and remove remaining assumptions about `projectRoot/.specd`.
      (Req: Config-derived persistence layout, Req: Concrete database files, Req: Bulk loading and scratch files)
- [x] 2.3 Implement Ladybug-specific destructive recreation
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `recreate()` — discard persisted Ladybug graph files and companion artifacts under `{configPath}/graph` and leave the adapter ready for a fresh open/reindex.
      Approach: implement `recreate()` in backend terms inside the adapter, including any needed close/reopen sequencing, without leaking `.lbug`, `.wal`, or `.lock` handling to callers.
      (Req: Destructive recreation)
- [x] 2.4 Keep provider composition backend-agnostic while passing the new graph root
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: `createCodeGraphProvider()` — instantiate `LadybugGraphStore` with `config.configPath` when running from `SpecdConfig`.
      Approach: preserve `CodeGraphOptions.storagePath` as a legacy/testing override, but use resolved config state as the normal handoff point from CLI/core into backend storage layout.
      (Req: GraphStore port, Req: Ladybug-backed implementation)
- [x] 2.5 Update graph-store and Ladybug infrastructure tests
      `packages/code-graph/test/**`: graph-store/provider infrastructure tests — cover `recreate()`, new derived graph/tmp roots, and continued conformance of search/statistics semantics after the path move.
      Approach: add adapter-focused tests around concrete filesystem layout and contract-focused tests around abstract port behavior so future backends can reuse the same contract expectations.
      (Req: Store recreation, Req: Config-derived persistence layout, Req: Full-text search implementation)

## 3. Indexer staging and PHP adapter alignment

- [x] 3.1 Derive staged index artifacts from the store-owned config root
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph.execute()`, `makeStageDir()` — stop writing `index-stage-*` under `projectRoot/.specd/tmp` and derive the run-local stage directory from `this.store.storagePath`.
      Approach: keep `projectRoot` for discovery/spec semantics, but use the abstract store root for run-scoped staging so the indexer remains backend-agnostic and bounded-memory chunking stays intact.
      (Req: Chunked processing)
- [x] 3.2 Keep provider-facing indexing behavior aligned with staged processing
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: pass1/pass2 staging and cleanup paths — ensure staged artifacts are cleaned on success/failure and remain rooted under the derived temp directory.
      Approach: preserve the current chunked staging design and cleanup behavior; only move the root and ensure it is tied to the config-owned temp area rather than hardcoded repo paths.
      (Req: Chunked processing)
- [x] 3.3 Confirm the optional PHP fast path remains aligned with the adapter contract
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`, `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — keep `extractSymbolsWithNamespace()` available and consistent with the spec-aligned contract.
      Approach: do not redesign adapter semantics; only keep signatures/comments/tests aligned so PHP can continue avoiding redundant parsing without making the combined fast path mandatory for other languages.
      (Req: Combined namespace and symbol extraction)

## 4. Shared CLI graph lock and force reindex flow

- [x] 4.1 Add a shared graph CLI lock helper
      `packages/cli/src/commands/graph/`: new shared helper module — centralize the lock file path, acquisition, release, lock presence check, and retry-later message used by the graph command family.
      Approach: root the lock file at `join(configPath, 'graph', 'index.lock')`, expose `acquireGraphIndexLock(configPath)` and `ensureGraphNotIndexing(configPath)`, and keep this as a CLI coordination mechanism rather than a `GraphStore` API.
      (Req: Concurrent indexing guard)
- [x] 4.2 Make `graph index` the writer-side lock owner
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex()` — acquire the shared lock before opening the provider for mutation work, call store/provider recreation for `--force`, and release the lock on normal and signal-driven shutdown.
      Approach: pair the existing `withProvider` lifecycle with an explicit lock handle so the command owns both acquisition and guaranteed release paths instead of letting backend errors police concurrency.
      (Req: Indexing behaviour, Req: Concurrent indexing guard)
- [x] 4.3 Guard read-oriented graph commands before provider open
      `packages/cli/src/commands/graph/search.ts`, `packages/cli/src/commands/graph/hotspots.ts`, `packages/cli/src/commands/graph/impact.ts`, `packages/cli/src/commands/graph/stats.ts`: command entrypoints — check the shared graph indexing lock and fail fast with a user-facing retry-later message while indexing is in progress.
      Approach: add the guard before provider creation/open so commands stay backend-agnostic and never reach opportunistic backend lock failures first.
      (Req: Concurrent indexing guard)
- [x] 4.4 Keep bootstrap mode and derived config roots aligned in graph CLI setup
      `packages/cli/src/commands/graph/bootstrap-graph-config.ts`, `packages/cli/src/commands/graph/resolve-graph-cli-context.ts` — synthesize `configPath` for bootstrap mode and ensure graph commands all read the same derived root.
      Approach: mirror configured mode by defaulting bootstrap `configPath` to `join(projectRoot, '.specd', 'config')`, then let all graph commands consume the same resolved path through the shared context model.
      (Req: Graph config path, Req: Context resolution)
- [x] 4.5 Add CLI tests for recreate and lock behavior
      `packages/cli/test/commands/graph-index.spec.ts`, `packages/cli/test/commands/graph-search.spec.ts`, `packages/cli/test/commands/graph-hotspots.spec.ts`, `packages/cli/test/commands/graph-impact.spec.ts`, `packages/cli/test/commands/graph-stats.spec.ts`: command-level coverage — verify `--force` delegates to recreation and all graph commands show the retry-later behavior while the lock is present.
      Approach: test the shared helper through command behavior, asserting exit code `3`, no backend-specific file deletion in CLI, and lock acquisition/release around indexing.
      (Req: Store recreation, Req: Concurrent indexing guard, Req: Error cases)

## 5. Documentation and cleanup

- [x] 5.1 Update config documentation for `configPath`
      `docs/config/config-reference.md`, `docs/guide/configuration.md`: config docs — document `configPath`, its default `.specd/config`, and the derived `{configPath}/graph` and `{configPath}/tmp` directories.
      Approach: update examples and prose to describe graph artifact placement as config-derived rather than hardcoded under `.specd/`.
      (Req: Graph config path)
- [x] 5.2 Update graph CLI docs for recreate and indexing lock behavior
      `docs/cli/cli-reference.md`: `graph index`, `graph search`, `graph hotspots`, `graph impact`, `graph stats` — document force reindex through backend recreation, the derived graph root, and the retry-later behavior when indexing is already in progress.
      Approach: keep command docs backend-agnostic at the user level while explicitly describing that graph commands may refuse to run briefly during an ongoing indexing operation.
      (Req: CLI reference documentation, Req: Concurrent indexing guard)
- [x] 5.3 Refresh package-level backend description
      `packages/code-graph/README.md`: graph-store overview — describe `GraphStore` as abstract, `LadybugGraphStore` as the current implementation, and note that persistence/temp locations derive from config rather than fixed repo paths.
      Approach: keep the README aligned with the new spec split so future backend work (for example SQLite) has the right architectural seam already documented.
      (Req: Ladybug-backed implementation, Req: GraphStore port)
