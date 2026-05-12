# Tasks: spec-list-filters

## 1. Core: SpecRepository port — add search types and abstract method

- [x] 1.1 Add `SpecSearchMatch` and `SpecSearchResult` types to spec-repository port
      `packages/core/src/application/ports/spec-repository.ts`: new exported interfaces
      Approach: add `SpecSearchMatch` (filename, line, snippet) and `SpecSearchResult` (spec, score, matches) interfaces. Place them above the `SpecRepository` class.
      (Req: search returns specs matching a text query)

- [x] 1.2 Add abstract `search()` method to `SpecRepository`
      `packages/core/src/application/ports/spec-repository.ts`: `SpecRepository` — add `abstract search(query: string, options?: { limit?: number }): Promise<SpecSearchResult[]>`
      Approach: add as the last abstract method, after `saveMetadata`. Update the class JSDoc to mention search.
      (Req: Abstract class with abstract methods, search returns specs matching a text query)

## 2. Core: FsSpecRepository — implement search

- [x] 2.1 Implement `search()` in `FsSpecRepository`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository` — implement abstract `search()`
      Approach: iterate `this.list()` to get all specs. For each spec, iterate `spec.filenames` and load each artifact via `this.artifact()`. Perform case-insensitive substring matching on content. Score = count of matches weighted by position. Extract 120-char snippet around first match. Sort by score descending. Respect `options.limit`.
      (Req: search returns specs matching a text query — all 5 scenarios)

## 3. Core: ListSpecs — add workspace filter

- [x] 3.1 Add `workspaces` option to `ListSpecs.execute()`
      `packages/core/src/application/use-cases/list-specs.ts`: `execute()` — add `workspaces?: readonly string[]` to options
      Approach: when `options.workspaces` is a non-empty array, convert to `Set<string>` and skip repos whose workspace name is not in the set. Backward-compatible — omitted/empty means all workspaces.
      (Req: Enumerate specs across all workspaces — workspace filter scenarios)

## 4. Core: SearchSpecs — new use case

- [x] 4.1 Create `SearchSpecs` use case class
      `packages/core/src/application/use-cases/search-specs.ts`: new file — `SearchSpecs` class with `SpecSearchEntry` and `SearchSpecsOptions` types
      Approach: same constructor pattern as `ListSpecs` (specRepos, hasher, yaml). `execute(query, options?)` iterates repos (filtered by `options.workspaces`), calls `repo.search(query, { limit })`, merges results, resolves titles (same algorithm as ListSpecs), optionally resolves summaries, returns sorted by score descending.
      (Req: Search across all configured workspaces, Optional workspace filter, Optional summary resolution, Result shape, Silent error handling, Empty results)

- [x] 4.2 Create composition factory for `SearchSpecs`
      `packages/core/src/composition/use-cases/search-specs.ts`: new file — `createSearchSpecs()` function
      Approach: follow existing pattern from `createListSpecs.ts` — accept `FsSearchSpecsOptions` with repos, hasher, yaml, return wired `SearchSpecs` instance.

## 5. Core: Kernel — wire SearchSpecs

- [x] 5.1 Add `search` to `Kernel.specs` interface
      `packages/core/src/composition/kernel.ts`: `Kernel` interface — add `search: SearchSpecs` to `specs` group
      Approach: import `SearchSpecs` and add `readonly search: SearchSpecs` alongside existing `list`, `get`, etc.

- [x] 5.2 Wire `SearchSpecs` in `createKernel`
      `packages/core/src/composition/kernel.ts`: `createKernel()` — instantiate `SearchSpecs` and assign to `specs.search`
      Approach: use `createSearchSpecs()` factory with the same repos, hasher, yaml already used for `ListSpecs`.

- [x] 5.3 Update kernel spec mapping table in `core:core/kernel` spec
      `specs/core/kernel/spec.md`: add `kernel.specs.search` → `SearchSpecs` entry to the mapping table
      Approach: add row to the specs group table: `search | SearchSpecs | search-specs | Searches spec content across workspaces`
      (Req: Kernel entry mapping)

## 6. Core: Test doubles — add search stub

- [x] 6.1 Add `search()` stub to `StubSpecRepository`
      `packages/core/test/application/use-cases/helpers.ts`: `StubSpecRepository` — add `async search(): Promise<SpecSearchResult[]> { return [] }`
      Approach: minimal stub returning empty array. Import `SpecSearchResult` from port.

- [x] 6.2 Add `search()` stub to `FakeSpecRepository`
      `packages/core/test/application/use-cases/_shared/spec-reference-resolver.spec.ts`: `FakeSpecRepository` — add `async search(): Promise<SpecSearchResult[]> { return [] }`
      Approach: same minimal stub.

## 7. Core: Tests

- [x] 7.1 Add workspace filter tests for `ListSpecs`
      `packages/core/test/application/use-cases/list-specs.spec.ts`: new describe block "workspace filtering"
      Approach: create repos for two workspaces, call `execute({ workspaces: ["alpha"] })`, assert only alpha entries returned. Test unknown workspace, empty array, multiple workspaces.
      (Req: Enumerate specs — scenarios: workspace filter, unknown workspace, empty array)

- [x] 7.2 Add `FsSpecRepository.search()` tests
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`: new describe block "search()"
      Approach: write spec files with known content, call `search("keyword")`, assert results contain correct spec, score, matches with filename and snippet. Test no matches, limit, score ordering.
      (Req: search returns specs matching a text query — all 5 scenarios)

- [x] 7.3 Add `SearchSpecs` use case tests
      `packages/core/test/application/use-cases/search-specs.spec.ts`: new file
      Approach: mock repos returning `SpecSearchResult[]`, test merge across workspaces, workspace filter, silent error handling (one repo throws), summary resolution, empty results.
      (Req: all SearchSpecs requirements)

- [x] 7.4 Verify `kernel.specs.search` exists in kernel tests
      `packages/core/test/composition/kernel.spec.ts`: add assertion that `kernel.specs.search` is instance of `SearchSpecs`
      Approach: single expect after kernel construction.

## 8. CLI: specs list — add --workspace flag

- [x] 8.1 Add `--workspace` option to `registerSpecList`
      `packages/cli/src/commands/spec/list.ts`: `registerSpecList` — add `.option('--workspace <name>', 'filter by workspace', collect, [])` and a collector function
      Approach: add a `collect` helper (same pattern as `registerGraphSearch` in `graph/search.ts`). Pass collected array to `kernel.specs.list.execute({ workspaces, includeSummary, includeMetadataStatus })`.

- [x] 8.2 Filter workspace groups in text and JSON rendering
      `packages/cli/src/commands/spec/list.ts`: action handler — filter `byWorkspace` map when `--workspace` is provided
      Approach: in text mode, only render workspace groups whose name is in the filter set. In JSON mode, include all configured workspace names but filtered-out ones get empty `specs` array.
      (Req: Workspace filtering, Output format — all workspace filter scenarios)

## 9. CLI: specs search — new command

- [x] 9.1 Create `registerSpecSearch` command
      `packages/cli/src/commands/spec/search.ts`: new file
      Approach: register `specd specs search <query>` with `--workspace`, `--graph`, `--summary`, `--format`. Action handler: (1) check graph freshness via `withProvider`, (2) if graph available: use `provider.searchSpecs()` with workspace filter, (3) if graph unavailable: fall back to `kernel.specs.search.execute(query, { workspaces, includeSummary })` with stderr warning, (4) if `--graph` and graph unavailable: error exit 1. Map results to unified output shape.

- [x] 9.2 Render search results in text and JSON/toon
      `packages/cli/src/commands/spec/search.ts`: rendering logic
      Approach: text mode — single table with PATH/TITLE columns (and SUMMARY with `--summary`), sorted by score desc, using `renderTable`/`colWidth` from helpers. JSON/toon — flat array with path, title, score, optional summary. Empty results → `no matching specs` / `[]`.
      (Req: Output format — text, Output format — JSON/toon, Search execution)

- [x] 9.3 Register command in spec index
      `packages/cli/src/commands/spec/index.ts`: import and call `registerSpecSearch(parent)`
      Approach: add import and call alongside existing `registerSpecList`.

## 10. CLI: Tests

- [x] 10.1 Add `--workspace` tests for `specs list`
      `packages/cli/test/commands/spec/list.spec.ts`: new describe block
      Approach: mock `kernel.specs.list.execute` to return filtered entries. Test single workspace, multiple workspaces, unknown workspace, JSON output with filter.
      (Req: Workspace filtering — all scenarios)

- [x] 10.2 Add `specs search` command tests
      `packages/cli/test/commands/spec/search.spec.ts`: new file
      Approach: mock graph provider and `kernel.specs.search.execute`. Test graph-available path, fallback path, `--graph` error, workspace filter, summary flag, empty results, text/JSON output.
      (Req: all Spec Search requirements)

## 11. Docs

- [x] 11.1 Update CLI reference for `specs list --workspace`
      `docs/cli/`: update specs list section with `--workspace` flag documentation
      Approach: add `--workspace <name>` (repeatable) to the flag table with description and examples.

- [x] 11.2 Add `specs search` to CLI reference
      `docs/cli/`: new section for `specd specs search`
      Approach: document command signature, flags (`--workspace`, `--graph`, `--summary`, `--format`), graph-first strategy, examples.
      (Req: Command signature)
