# Tasks: graph-cli-context-and-kind-filters

## 1. Graph context resolution

- [x] 1.1 Add graph-specific context resolver
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: `resolveGraphCliContext()` — add a graph-local resolver so graph commands can use configured mode or bootstrap mode without changing `resolveCliContext()`
      Approach: implement a new helper that delegates to `resolveCliContext({ configPath })` for configured mode, rejects simultaneous `configPath` and `repoPath`, and returns a `GraphCliContext` with `mode`, `config`, `configFilePath`, `kernel`, `projectRoot`, and `vcsRoot`
      (Req: Context resolution, Command signature)

- [x] 1.2 Add bootstrap config synthesis for graph commands
      `packages/cli/src/commands/graph/bootstrap-graph-config.ts`: `createBootstrapGraphConfig()` — synthesize the minimal valid `SpecdConfig` needed for graph commands when no project config is loaded
      Approach: build a single-workspace `default` config with `codeRoot = vcsRoot`, project root pinned to the resolved repo root, and only the fields required by `createCodeGraphProvider()` and graph command execution
      (Req: Context resolution)

- [x] 1.3 Resolve explicit path and no-config fallback to repo-root bootstrap mode
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: bootstrap branch — support `--path` and no-config fallback by resolving the repository root and entering synthetic single-workspace mode
      Approach: use repo-root resolution for bootstrap mode, ignore config discovery when `--path` is present, and fall back to bootstrap only when config autodiscovery fails for graph commands
      (Req: Context resolution, Error cases)

## 2. Multi-kind option model

- [x] 2.1 Add shared parser for graph kind lists
      `packages/cli/src/commands/graph/parse-graph-kinds.ts`: `parseGraphKinds()` — normalize `--kind class,method,...` into validated symbol kinds for graph commands
      Approach: wrap `parseCommaSeparatedValues()` and return a deduplicated ordered `readonly SymbolKind[]`, preserving CLI-friendly error messages for invalid tokens
      (Req: Kind filter semantics, Search behaviour)

- [x] 2.2 Widen search options to multiple kinds
      `packages/code-graph/src/domain/value-objects/search-options.ts`: `SearchOptions` — replace single-kind filtering with multi-kind filtering
      Approach: change the contract from `kind?: SymbolKind` to `kinds?: readonly SymbolKind[]` and keep all other filters unchanged so CLI and store can pass full kind lists end-to-end
      (Req: Command signature, Search behaviour)

- [x] 2.3 Widen hotspot options to multiple kinds
      `packages/code-graph/src/domain/value-objects/hotspot-result.ts`: `HotspotOptions` — replace single-kind filtering with multi-kind filtering
      Approach: change the contract from `kind?: SymbolKind` to `kinds?: readonly SymbolKind[]` and keep default scoring/filter fields untouched
      (Req: Kind filter semantics, Hotspot retrieval)

- [x] 2.4 Support multi-kind symbol queries in the Ladybug store
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: `searchSymbols()` — apply symbol kind filtering for multiple allowed kinds
      Approach: replace the single `node.kind = ...` predicate with a composed predicate over all requested kinds while keeping file/workspace/exclude filters applied before LIMIT
      (Req: Search behaviour)

- [x] 2.5 Support multi-kind hotspot filtering in the hotspot service
      `packages/code-graph/src/domain/services/compute-hotspots.ts`: `computeHotspots()` — apply multiple kinds both when pre-scoping symbols and when filtering final entries
      Approach: use `options.kinds` for the `findSymbols()` pre-scope and final entry filter so `graph hotspots --kind class,method` behaves consistently
      (Req: Kind filter semantics, Hotspot retrieval)

## 3. Update graph commands

- [x] 3.1 Update graph index to use shared graph context resolution
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex()` — add `--config` and `--path`, resolve graph context through the new helper, and branch target construction between configured mode and bootstrap mode
      Approach: in configured mode keep `buildWorkspaceTargets(config, kernel, opts.workspace)`; in bootstrap mode build exactly one `WorkspaceIndexTarget` named `default` from the resolved repo root with no spec repos
      (Req: Command signature, Indexing behaviour, Error cases)

- [x] 3.2 Update graph search for graph context and CSV kinds
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch()` — add `--config` and `--path`, remove single-value Commander choices, parse `--kind` as CSV, and pass `kinds` to `SearchOptions`
      Approach: replace the current single-string validation with `parseGraphKinds()`, use `resolveGraphCliContext()`, and keep `--spec-content`, `--symbols`, `--specs`, and output behavior unchanged
      (Req: Command signature, Search behaviour, Output format, Error cases)

- [x] 3.3 Update graph hotspots for graph context and CSV kinds
      `packages/cli/src/commands/graph/hotspots.ts`: `registerGraphHotspots()` — add `--config` and `--path`, parse `--kind` as CSV, and pass `kinds` to `HotspotOptions` without altering existing default-filter semantics
      Approach: preserve the current default/no-default branching for score/risk/limit, but replace `kind` parsing with `parseGraphKinds()` and use `resolveGraphCliContext()`
      (Req: Command signature, Context resolution, Kind filter semantics, Hotspot retrieval, Output format, Error cases)

- [x] 3.4 Update graph stats to use shared graph context resolution
      `packages/cli/src/commands/graph/stats.ts`: `registerGraphStats()` — add `--config` and `--path`, switch from configured-only context to the graph-local resolver, and keep stale/fresh output unchanged
      Approach: resolve context through `resolveGraphCliContext()`, pass the resulting config to `withProvider()`, and continue using `createVcsAdapter(projectRoot)` for ref comparison
      (Req: Command signature, Statistics retrieval, Output format, Error cases)

- [x] 3.5 Update graph impact to use shared graph context resolution
      `packages/cli/src/commands/graph/impact.ts`: `registerGraphImpact()` — add `--config` and `--path`, switch to the graph-local resolver, and keep impact analysis behavior unchanged
      Approach: resolve context once before dispatching to `handleFileImpact()`, `handleSymbolImpact()`, or `handleChangesImpact()`, and keep selector/depth validation as-is
      (Req: Command signature, File impact analysis, Symbol impact analysis, Change detection, Error cases)

## 4. Tests

- [x] 4.1 Add CLI tests for graph search
      `packages/cli/test/commands/graph-search.spec.ts`: new command suite — verify `--config`, `--path`, no-config fallback, multi-kind forwarding, and invalid kind failure for search
      Approach: mirror existing CLI command test style, stub provider interactions, and assert that provider query options receive the full kind list rather than a single last token
      (Req: Command signature, Search behaviour, Command signature (filters), Error cases)

- [x] 4.2 Add CLI tests for graph hotspots
      `packages/cli/test/commands/graph-hotspots.spec.ts`: new command suite — verify default filters, explicit-filter removal of defaults, `--config`/`--path`, multi-kind forwarding, and invalid kind failure
      Approach: stub `getHotspots()` and assert both option parsing and text/JSON behavior, especially that default score/risk/limit only apply when no explicit filter flags are present
      (Req: Command signature, Context resolution, Kind filter semantics, Hotspot retrieval, Output format, Error cases)

- [x] 4.3 Add CLI tests for graph stats and extend graph impact tests
      `packages/cli/test/commands/graph-stats.spec.ts`: new suite — verify `--config`, `--path`, no-config fallback, and mutual exclusivity
      `packages/cli/test/commands/graph-impact.spec.ts`: extend existing suite — verify graph context resolution and incompatible flags
      Approach: keep staleness/output assertions for stats, and add context-resolution cases around the existing impact command coverage
      (Req: Command signature, Statistics retrieval, File impact analysis, Symbol impact analysis, Change detection, Error cases)

- [x] 4.4 Add CLI tests for graph index
      `packages/cli/test/commands/graph-index.spec.ts`: new command suite — verify configured workspaces, explicit config, bootstrap target construction, no-config fallback, and `--exclude-path` merging
      Approach: stub workspace target construction and provider indexing so tests can distinguish configured-mode `buildWorkspaceTargets()` from bootstrap-mode synthetic `default` workspace behavior
      (Req: Command signature, Indexing behaviour, Output format, Error cases)

- [x] 4.5 Extend helper and code-graph tests for kind lists
      `packages/cli/test/helpers/parse-comma-values.spec.ts`, `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`, and `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts` — cover CSV parsing, multi-kind hotspot filtering, and multi-kind symbol search predicates
      Approach: reuse existing helper tests for normalization and add focused service/store tests that prove multiple kinds are treated as an OR filter while other filters still apply
      (Req: Kind filter semantics, Search behaviour, Hotspot retrieval)

## 5. Documentation and finish checks

- [x] 5.1 Update CLI reference for graph commands
      `docs/cli/cli-reference.md`: `graph index`, `graph search`, `graph hotspots`, `graph stats`, `graph impact` — document `--config`, `--path`, no-config bootstrap fallback, and CSV `--kind`
      Approach: update each graph subsection signature and flag tables, and explicitly state that `--path` plus no-config fallback are bootstrap-only modes rather than the normal configured path
      (Req: CLI reference documentation)

- [x] 5.2 Update config reference bootstrap wording
      `docs/config/config-reference.md`: config discovery reference — clarify that command-specific bootstrap modes do not redefine the meaning of `--config`
      Approach: keep the existing config-discovery algorithm intact and add an explanatory note that bootstrap mode, when defined by a command family, is separate from explicit config override semantics
      (Req: Config file location and format)

- [x] 5.3 Run focused validation for CLI and code-graph changes
      `packages/cli`, `packages/code-graph`, and changed docs/spec files — verify implementation, tests, and docs before moving to implementation complete
      Approach: run the relevant CLI and code-graph test suites plus lint/typecheck on touched files, and manually exercise the graph commands in configured mode, explicit-config mode, and bootstrap mode
      (Req: all requirements)
