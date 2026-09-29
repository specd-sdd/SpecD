# Partial: query

Audit mode: change `language-agnostic-member-symbol-references` (state `verifying`).
Source: merged scenarios for `code-graph:composition`, `code-graph:traversal`, `cli:graph-search`, and `cli:graph-impact`, checked against search, selector resolution, and the CLI commands.

## Per spec

### code-graph:composition

#### Requirements summary

Unanchored `EditChange.execute` resolves with no adapter. An anchored file filters. The provider does not read `package.json` to choose an adapter. `ArchiveChange::execute()` with language `php` still uses the PHP adapter.

#### Implementation status

Conformant. `CodeGraphProvider` constructs `SearchCodeGraph` with the store only. `resolveSymbolSelector` still receives `this.resolver.execute`. Provider tests: before index, unanchored `EditChange.execute` stays unresolved; after indexing `archive.php`, `ArchiveChange::execute` resolves and `parse` is not called; `ArchiveChange::execute()` with language `php` calls the PHP adapter.

#### Discrepancies

None.

#### Test coverage gaps

The provider test proves the adapter is skipped. The CLI impact mock asserts the command does not mention `package.json`. The provider test does not itself open `package.json`.

#### Dependency contradictions

None against architecture, indexer, traversal, or resolve-symbol-reference. Composition still delegates resolution to the use case.

### code-graph:traversal

#### Requirements summary

One qualified member is the only start node. Two equal `GetStatus.execute` values are reported and not traversed. `EditChange.missing` selects no start. A file in the selector only filters. `::` is handled before the last-colon file split.

#### Implementation status

Conformant. `resolveUnanchoredQualifiedSelector` runs before `parseQualifiedSelector`. Zero matches return `missing`. Several matches return `ambiguous` and the caller does not analyze. One match is the start node. A selector that is not a single qualified token falls through to the file-qualified path, which calls the resolver with the file and keeps declarations in that file.

#### Discrepancies

None.

#### Test coverage gaps

`resolve-graph-selector.spec.ts` covers unanchored `EditChange.execute` / `EditChange::execute` as ambiguous and `ArchiveChange::missing` as missing. There is no dedicated test whose selector is `workspace:path:EditChange.execute` and whose assertion is that the other `execute` is excluded. The file filter is the existing exact-lane branch in `resolveSymbolSelector` (`isExactLaneQuery` plus `filePath`).

#### Dependency contradictions

None. Traversal still starts from a resolved symbol id and does not parse human text itself.

### cli:graph-search

#### Requirements summary

A bare token such as `execute` does not run a qualified lookup, and the full query still uses the existing tiers. `EditChange.execute` is an exact hit and the original query is still searched. `GetStatus.execute otra cosa` keeps the exact hit and does not drop tokens. Two `Owner.execute` values are both exact. A missing spelling leaves the normal search. `--kind variable` still excludes the method. `ArchiveChange::execute` uses the same exact lookup. The CLI does not parse the delimiter.

#### Implementation status

Conformant. `SearchCodeGraph.executeSymbols` always calls `store.searchSymbols(options)` with the original query. `exactQualifiedTargets` splits on whitespace, looks up only tokens that `qualifiedLookupText` accepts, and also accepts `logical|2|` ids. An empty spelling list does not call `findLogicalSymbolsByQualifiedNames`. Proven ids classify as `exact-logical-identity`. Kind filters run after that lookup. `packages/cli/src/commands/graph/search.ts` passes the raw `query` argument through.

#### Discrepancies

None.

#### Test coverage gaps

`search-code-graph.spec.ts` covers unanchored `EditChange.execute`, mixed `EditChange.execute Change`, two `Owner.execute`, kind `variable` empty, and anchored `ArchiveChange::execute`. The ordinary-token assertion uses query `Change`, which takes the same non-qualified branch as `execute`. The missing-spelling assertion is `ArchiveChange::execute` against an `EditChange.execute` fixture (no exact tier). There is no CLI-level test that repeats those queries; the command forwards the string unchanged.

#### Dependency contradictions

None. Search stays behind composition and the graph store. FTS remains discovery, not identity.

### cli:graph-impact

#### Requirements summary

Two `Owner.execute` values are listed and not analyzed. The CLI does not split the selector. One `EditChange.execute` is analyzed, exit 0, and other `execute` symbols are not start nodes. A missing selector prints `No symbol found matching "<selector>".` and exits 0. The command does not open SQLite.

#### Implementation status

Conformant. `packages/cli/src/commands/graph/impact.ts` calls `provider.resolveSymbolSelector(symbolSelector)` with the whole selector. Missing prints that selector and does not analyze. Ambiguous lists candidates. The default direction `dependents` is mapped to `upstream` before `analyzeImpact`. Depth default is 3. The CLI test mock never opens SQLite.

#### Discrepancies

None.

#### Test coverage gaps

CLI tests cover one mocked resolved `EditChange.execute` (`analyzeImpact` with `upstream`, depth 3) and the ambiguous `Owner.execute` list. The selector unit test is what proves the unanchored listing and the missing `::` case. The file-anchored filter has no dedicated impact test; see traversal.

#### Dependency contradictions

None against `code-graph:traversal`, `code-graph:resolve-symbol-reference`, or workspace integration. The CLI does not choose an adapter.

## Summary counts

- requirements checked: search exact-plus-full-query, impact whole-selector, composition adapter skip
- conforming: all inspected requirements
- discrepancies: 0
- missing tests: 1 narrow gap (file-anchored `EditChange.execute` impact filter has implementation and no dedicated test)
- dependency contradictions: 0
