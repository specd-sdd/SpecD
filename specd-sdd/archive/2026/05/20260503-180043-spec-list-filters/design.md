# Design: spec-list-filters

## Non-goals

- Full-text search query syntax (boolean, regex, fuzzy)
- Search result highlighting or pagination
- Modifying the code-graph's search engine or indexing

## Affected areas

### Core

- `ListSpecs` in `core/src/application/use-cases/list-specs.ts`
  Change: extend `execute()` options to accept `workspaces?: string[]`; filter repositories before iteration.
  Callers: 5 direct (kernel, composition factory, tests) · Risk: MEDIUM — backward-compatible (new optional field)

- `SpecRepository` port in `core/src/application/ports/spec-repository.ts`
  Change: add abstract `search(query, options?)` method.
  Callers: ~111 direct (CRITICAL symbol) · Risk: HIGH — every adapter and test double must implement the new method
  Note: `FsSpecRepository` in `core/src/infrastructure/fs/spec-repository.ts` must implement it; all `StubSpecRepository` / `FakeSpecRepository` in tests must add a stub.

- `FsSpecRepository` in `core/src/infrastructure/fs/spec-repository.ts`
  Change: implement `search()` — iterate `list()`, for each spec iterate `spec.filenames` and load each artifact via `artifact()`, case-insensitive substring match, compute score, extract snippets.

- `StubSpecRepository` in `core/test/application/use-cases/helpers.ts`
  Change: add `search()` stub returning empty array by default.

- `FakeSpecRepository` in `core/test/application/use-cases/_shared/spec-reference-resolver.spec.ts`
  Change: add `search()` stub returning empty array by default.

- `Kernel` interface in `core/src/composition/kernel.ts`
  Change: add `specs.search` entry for the new `SearchSpecs` use case.

- `createKernel` in `core/src/composition/kernel.ts`
  Change: wire `SearchSpecs` use case and expose as `kernel.specs.search`.

- `FsSpecRepository` tests in `core/test/infrastructure/fs/spec-repository.spec.ts`
  Change: add describe block for `search()`.

### CLI

- `registerSpecList` in `cli/src/commands/spec/list.ts`
  Change: add `--workspace` option (repeatable); pass collected names to `kernel.specs.list.execute({ workspaces: [...] })`; filter workspace groups in both text and JSON rendering.
  Callers: 5 direct · Risk: HIGH — but changes are additive (new flag, existing flags untouched)

- New file `cli/src/commands/spec/search.ts` (`registerSpecSearch`)
  Change: new command `specd specs search <query>`. Orchestrates graph-first then core-fallback. Reuses `renderTable`/`colWidth` from list.ts for text output.

- Command registration in `cli/src/commands/spec/index.ts`
  Change: import and call `registerSpecSearch`.

### Docs

- `docs/cli/` — update CLI reference for `specs list --workspace` and new `specs search` command.

## New constructs

### `SpecSearchMatch` type

- **Location**: `core/src/application/ports/spec-repository.ts`
- **Shape**:
  ```ts
  export interface SpecSearchMatch {
    readonly filename: string
    readonly line: number
    readonly snippet: string
  }
  ```
- **Responsibility**: value object describing a single match location within a spec artifact.
- **Relationships**: returned inside `SpecSearchResult`.

### `SpecSearchResult` type

- **Location**: `core/src/application/ports/spec-repository.ts`
- **Shape**:
  ```ts
  export interface SpecSearchResult {
    readonly spec: Spec
    readonly score: number
    readonly matches: readonly SpecSearchMatch[]
  }
  ```
- **Responsibility**: value object for a single search hit from a repository.
- **Relationships**: returned by `SpecRepository.search()` and consumed by `SearchSpecs`.

### `SpecRepository.search()` abstract method

- **Location**: `core/src/application/ports/spec-repository.ts` (on `SpecRepository`)
- **Shape**:
  ```ts
  abstract search(
    query: string,
    options?: { limit?: number },
  ): Promise<SpecSearchResult[]>
  ```
- **Responsibility**: content-based search within a single workspace.
- **Relationships**: implemented by `FsSpecRepository`; consumed by `SearchSpecs`.

### `SearchSpecs` use case

- **Location**: `core/src/application/use-cases/search-specs.ts`
- **Shape**:

  ```ts
  export interface SpecSearchEntry {
    readonly workspace: string
    readonly path: string
    readonly title: string
    readonly score: number
    readonly matches: readonly SpecSearchMatch[]
    readonly summary?: string
  }

  export interface SearchSpecsOptions {
    readonly workspaces?: readonly string[]
    readonly includeSummary?: boolean
    readonly limit?: number
  }

  export class SearchSpecs {
    constructor(
      specRepos: ReadonlyMap<string, SpecRepository>,
      hasher: ContentHasher,
      yaml: YamlSerializer,
    )
    async execute(query: string, options?: SearchSpecsOptions): Promise<SpecSearchEntry[]>
  }
  ```

- **Responsibility**: orchestrate `SpecRepository.search()` across workspaces, merge and rank results by score, resolve titles and optional summaries.
- **Relationships**: same constructor signature pattern as `ListSpecs`; exposed via `kernel.specs.search`.

### `registerSpecSearch` function

- **Location**: `cli/src/commands/spec/search.ts`
- **Shape**: `export function registerSpecSearch(parent: Command): void`
- **Responsibility**: register `specd specs search` subcommand. Orchestrates graph-first → core-fallback strategy.
- **Relationships**: called from `cli/src/commands/spec/index.ts`; reuses `resolveCliContext`, `output`, `parseFormat`, `renderTable`, `colWidth` from existing helpers.

## Approach

### 1. Core: workspace filter on `ListSpecs`

Add `workspaces?: string[]` to the `execute()` options. When provided, convert to a `Set<string>` and filter `_specRepos` entries during the iteration loop. This is a use-case-level filter — `SpecRepository.list()` is unaffected.

### 2. Core: `search()` on `SpecRepository` port

Add `search()` as an abstract method. Define `SpecSearchResult` and `SpecSearchMatch` types co-located in the port module.

### 3. Core: `FsSpecRepository.search()` implementation

Iterate `this.list()` to get all specs. For each spec, iterate `spec.filenames` (the actual artifact files present on disk — no hardcoded filenames) and load each via `this.artifact()`. Perform case-insensitive substring matching on every artifact's content. Score = count of matches, weighted by match position (earlier = higher). Extract a 120-char snippet around the first match. Sort by score descending. Respect `limit`.

### 4. Core: `SearchSpecs` use case

Same constructor pattern as `ListSpecs`. `execute(query, options?)` iterates repositories (filtered by `options.workspaces`), calls `repo.search(query, { limit })`, merges results, resolves titles (same algorithm as ListSpecs), optionally resolves summaries, and returns sorted by score.

### 5. Core: kernel wiring

Add `search: SearchSpecs` to the `Kernel.specs` interface. Wire in `createKernel` using `createSearchSpecs` composition factory. Add the composition factory at `core/src/composition/use-cases/search-specs.ts`.

### 6. CLI: `--workspace` on `specs list`

Add `--workspace <name>` as a repeatable option using Commander's `.option()` with a collector function. After `kernel.specs.list.execute()`, apply workspace filtering by passing the names to the use case.

### 7. CLI: `specs search` command

New file `cli/src/commands/spec/search.ts`. Action handler:

1. Parse `--workspace` (repeatable), `--graph`, `--summary`, `--format`.
2. Check if graph is available and fresh.
3. If graph available and not `--graph` only: use graph search with `--specs` flag, map results to output format.
4. If graph unavailable: fall back to `kernel.specs.search.execute(query, { workspaces, includeSummary })`. Print warning to stderr.
5. If `--graph` and graph unavailable: error exit 1.
6. Render results using the same table layout as `specs list`.

### 8. Docs update

Add `specs search` to `docs/cli/` and update `specs list` entry with `--workspace` flag.

## Key decisions

**Decision: Workspace filter at use-case level, not repository level** → simpler implementation, no changes to `SpecRepository.list()`, backward compatible. **Alternatives rejected**: adding `workspace` parameter to `SpecRepository.list()` — unnecessary coupling since the repo is already scoped to one workspace.

**Decision: `search()` returns `SpecSearchResult[]` (spec + score + matches)** → allows use cases to merge and re-rank across workspaces. **Alternatives rejected**: returning just spec IDs — would require separate lookups for titles/snippets, losing positional match info.

**Decision: `SearchSpecs` reuses `ListSpecs`' title/summary resolution** → avoids duplication, stays consistent. **Alternatives rejected**: separate extraction logic — drift risk.

**Decision: CLI orchestrates graph vs core** → core cannot depend on code-graph. **Alternatives rejected**: injecting graph provider into core — violates hexagonal architecture.

## Trade-offs

- [FsSpecRepository.search() performance] → Full scan of all spec artifacts on every call. Acceptable for fallback path (graph is primary). Mitigation: the graph handles most real searches; repository search is a degraded mode.
- [SpecRepository port change is breaking for all adapters] → Every test double must add `search()`. Mitigation: provide a default stub returning empty array; one-time mechanical change across test files.

## Spec impact

### `core:core/spec-repository-port` (modified)

- Direct dependents: `core:core/list-specs`, `core:core/search-specs` (new), `core:core/compile-context`, `core:core/get-spec`, `core:core/validate-specs`, `core:core/generate-metadata`, `core:core/save-spec-metadata`, `core:core/preview-spec`
- All dependents use existing methods (`list`, `get`, `artifact`, `metadata`). The new `search()` method is additive — no existing method signatures change. Dependents are unaffected.

### `core:core/list-specs` (modified)

- Direct dependents: `cli:cli/spec-list`, `core:core/kernel`
- `cli:cli/spec-list` is in the change scope and gets updated to pass `workspaces`.
- `kernel` is updated to match the new options type.
- No transitive dependents are affected (options is additive, backward-compatible).

## Dependency map

```mermaid
graph LR
  registerSpecList --"calls"--> kernel.specs.list
  registerSpecSearch --"calls"--> kernel.specs.search
  registerSpecSearch --"calls"--> graph.search
  kernel.specs.list --"uses"--> ListSpecs
  kernel.specs.search --"uses"--> SearchSpecs
  SearchSpecs --"calls"--> SpecRepository.search
  ListSpecs --"calls"--> SpecRepository.list
  SpecRepository.search --"implemented by"--> FsSpecRepository
```

```
┌──────────────────┐       ┌──────────────┐
│ registerSpecList │──────▶│ kernel.specs │.list
└──────────────────┘       └──────┬───────┘
                                  │
┌──────────────────┐              │
│ registerSpecSearch│────── ListSpecs ◀─────┐
└──────┬───────────┘      │                │
       │                  │         ┌──────┴──────┐
       │          kernel.specs.search     SpecRepository
       │                  │         │      .list()  │
       │                  ▼         │      .search()│
       │            SearchSpecs─────┘               │
       │                  │                  ┌──────┴──────┐
       │                  ▼                  │FsSpecRepository│
       │           SpecRepository.search()  └──────────────┘
       │                                               ▲
       └── graph search (graph available) ─────────────┘
           (falls back to SearchSpecs when unavailable)
```

## Testing

### Automated tests

- `core/test/application/use-cases/list-specs.spec.ts` — add describe block for workspace filtering: filter to one workspace, filter to unknown workspace, empty filter array, multiple workspaces.
- `core/test/application/use-cases/search-specs.spec.ts` — new file. Test: merge across workspaces, workspace filter, silent error handling, empty results, summary resolution, result shape.
- `core/test/infrastructure/fs/spec-repository.spec.ts` — add describe block for `search()`: matching specs, no matches, score sorting, limit, workspace scoping.
- `core/test/application/use-cases/helpers.ts` — add `search()` stub to `StubSpecRepository` returning `[]`.
- `core/test/application/use-cases/_shared/spec-reference-resolver.spec.ts` — add `search()` stub to `FakeSpecRepository`.
- `core/test/composition/kernel.spec.ts` — verify `kernel.specs.search` exists and is instance of `SearchSpecs`.
- `cli/test/commands/spec/list.spec.ts` — add tests for `--workspace` flag: single filter, multiple filters, unknown workspace, JSON output with filter.
- `cli/test/commands/spec/search.spec.ts` — new file. Test: graph available path, graph unavailable fallback path, `--graph` error path, workspace filter, summary, empty results, text/JSON output.

### Manual / E2E verification

```bash
specd specs list --workspace cli
specd specs list --workspace cli --workspace core
specd specs list --workspace nonexistent
specd specs list --workspace cli --format json
specd specs search "config"
specd specs search "config" --workspace core
specd specs search "config" --summary
specd specs search "config" --graph
specd specs search "config" --format json
specd specs search ""  # should error
```

Verify:

- `--workspace` filters correctly in text and JSON modes
- `specs search` returns ranked results
- Graph fallback to core works (test by deleting/renaming graph index temporarily)
- `--graph` errors when graph is stale

### Linting / typecheck

- Run `pnpm typecheck` — all new methods must satisfy port/adapter contracts
- Run `pnpm lint` — no new violations
- JSDoc on all public methods per `default:_global/docs`
