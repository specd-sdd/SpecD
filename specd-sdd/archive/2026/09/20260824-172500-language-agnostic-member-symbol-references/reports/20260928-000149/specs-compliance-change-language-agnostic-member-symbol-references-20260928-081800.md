# Spec compliance — language-agnostic-member-symbol-references

- Mode: change
- State at audit: verifying
- Graph: current (`knownStaleSinceLastIndex: false`, `lastIndexedAt: 2026-09-27T21:10:13.318Z`)
- Signoff: off
- Tasks: 52/52

## Scope

Change specs: `code-graph:symbol-model`, `code-graph:language-adapter`, `code-graph:resolve-symbol-reference`, `code-graph:graph-store`, `code-graph:sqlite-graph-store`, `code-graph:indexer`, `code-graph:composition`, `code-graph:traversal`, `cli:graph-search`, `cli:graph-impact`, `sdk:build-implementation-review`.

Dependency and global specs were checked for contradictions with the added requirements only: architecture, conventions, error-handling, testing, docs, eslint, document-model, workspace-integration.

## Aggregate

| Batch       | Discrepancies | Missing tests | Contradictions |
| ----------- | ------------: | ------------: | -------------: |
| identity    |             0 |             0 |              0 |
| persistence |             0 |      1 narrow |              0 |
| query       |             0 |      1 narrow |              0 |
| sdk-globals |             0 |             0 |              0 |
| **Total**   |         **0** |   **2 notes** |          **0** |

No implementation bug and no spec drift. Two scenarios are proven by an adjacent assertion rather than a literal fixture:

1. `Search text is not identity` — name lookup does not read `symbols.search_text`; the dedicated empty lookup of the dotted string as a simple name is not asserted.
2. File-anchored impact `workspace:path:EditChange.execute` — `resolveSymbolSelector` filters by file after the exact lane; no test passes that full selector.

Version 13 uses the same inequality as the version 9 test. Bare `execute` uses the same non-qualified branch as the tested query `Change`.

## Detailed Findings

# Partial: identity

Audit mode: change `language-agnostic-member-symbol-references` (state `verifying`).
Source: merged verifying context plus `changes spec-preview` scenario text for `code-graph:symbol-model`, `code-graph:language-adapter`, and `code-graph:resolve-symbol-reference`. Published `specs/` were not used as the change contract.

## Per spec

### code-graph:symbol-model

#### Requirements summary

Qualified spelling is stored beside the simple name. `LogicalSymbol.qualifiedName` is optional and is not a field of the canonical id `logical|2|`. `deriveQualifiedName` walks `ownerId` and joins simple names with `.`. A missing owner or a broken chain leaves the spelling unset. `assignQualifiedNames` copies that spelling onto the symbols. `qualifiedLookupText` accepts one dotted identifier pair or exactly one `::` pair and compares both as the dotted spelling. A single `:` stays a workspace or file separator.

#### Implementation status

Conformant. `packages/code-graph/src/domain/value-objects/symbol-reference.ts` keeps `qualifiedName` off the encoded id. `packages/code-graph/src/domain/services/exact-lane-query.ts` implements the token rule. Tests in `packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts` rebuild `EditChange.execute`, assert the id does not contain that spelling, and assert there is no package field.

#### Discrepancies

None.

#### Test coverage gaps

None for the added identity rules.

#### Dependency contradictions

None against `default:_global/conventions`, `default:_global/error-handling-conventions`, or `code-graph:document-model`. The spelling is a stored projection, not a document or a thrown user error.

### code-graph:language-adapter

#### Requirements summary

`ArchiveChange::execute` and `ArchiveChange.execute` name the same member. An unanchored single pair does not select the TypeScript adapter. `ArchiveChange::execute()` remains adapter syntax when a language is supplied.

#### Implementation status

Conformant. The exact lane resolves before adapter selection in `resolve-symbol-reference.ts`. The PHP adapter still parses `ArchiveChange::execute()` when language is `php`. Provider test: after indexing, `ArchiveChange::execute` resolves and `parse` is not called; `ArchiveChange::execute()` with language `php` still calls the PHP adapter.

#### Discrepancies

None.

#### Test coverage gaps

None. Adapter unit coverage of `ArchiveChange::execute` remains in `php-language-adapter.spec.ts`. The skip-adapter path is the provider test.

#### Dependency contradictions

None. The adapter contract still owns language-specific syntax. The exact lane only bypasses it for one dotted or `::` pair.

### code-graph:resolve-symbol-reference

#### Requirements summary

Unanchored `EditChange.execute` and `EditChange::execute` resolve by stored spelling with no PHP adapter. Two `GetStatus.execute` values are both returned. Zero matches stay unresolved `REFERENCE_UNPROVEN` with no terminal-name fallback and no adapter. A file anchor filters visibility.

#### Implementation status

Conformant. `executeBatch` loads `findLogicalSymbolsByQualifiedNames`. `resolveQualifiedMember` compares the stored or derived spelling before any adapter. Empty workspace means every workspace. A non-empty workspace or an anchored file filters. Tests in `resolve-symbol-reference.spec.ts` cover the unanchored dotted and `::` cases, the two `GetStatus.execute` candidates, `EditChange.missing` unresolved, and the PHP adapter only for `ArchiveChange::execute()`.

#### Discrepancies

None.

#### Test coverage gaps

None for the added resolver scenarios.

#### Dependency contradictions

None against `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:language-adapter`, or `code-graph:workspace-integration`. Resolution still reads the store and still delegates non-exact human syntax to an adapter.

## Summary counts

- requirements checked: 3 specs, added qualified-name and exact-lane requirements
- conforming: all added scenarios inspected
- discrepancies: 0
- missing tests: 0
- dependency contradictions: 0

# Partial: persistence

Audit mode: change `language-agnostic-member-symbol-references` (state `verifying`).
Source: merged scenarios for `code-graph:graph-store`, `code-graph:sqlite-graph-store`, and `code-graph:indexer`, checked against the SQLite schema, the store methods, and the index session.

## Per spec

### code-graph:graph-store

#### Requirements summary

`findLogicalSymbolsByQualifiedNames` is equality on `qualified_name`. Two symbols that store `GetStatus.execute` are both returned. The lookup is not full-text search and there is no alias table. A cross-workspace public binding stays readable by surface, exported name, space, and target id. Search text that contains `EditChange.execute` is not identity: an exact logical lookup of that string as a simple name returns nothing.

#### Implementation status

Conformant. The port method defaults to a rejection for stores that do not support reference facts. `InMemoryGraphStore` and `SessionReferenceStore` stamp the derived spelling onto the returned copy so a qualified lookup does not need the owner rows to re-derive the name. SQLite equality is an `IN` query on `logical_symbols.qualified_name`, sorted. `symbols.search_text` is `expandSymbolName(symbol.name)` and is not the lookup key.

#### Discrepancies

None. The public open of an incompatible schema surfaces `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`. The database layer throws `GraphSchemaIncompatibleError` first (`sqlite-graph-database.ts` `assertExistingSchemaCompatible`). The worker client maps that code to the recovery error. That is the existing recovery boundary, and the message still says the schema is incompatible with expected 12.

#### Test coverage gaps

`Search text is not identity` has no assertion that `findLogicalSymbols` with name `EditChange.execute` returns empty. The column split is tested: `symbols.search_text` is the expanded bare name, and qualified equality uses `qualified_name`. The reopen test returns both ids for `findLogicalSymbolsByQualifiedNames(['EditChange.execute'])`.

#### Dependency contradictions

None against `code-graph:symbol-model`, `default:_global/architecture`, `code-graph:staleness-detection`, or `code-graph:document-model`.

### code-graph:sqlite-graph-store

#### Requirements summary

Schema version is 12. `logical_symbols.qualified_name` is nullable and indexed by `idx_logical_symbols_qualified_name`. There is no `member_form` column and no `ALTER TABLE`. Versions 10 and 11, and any other version such as 9 or 13, reject a read and require rebuild. Opening version 12 does not recreate the database. `symbols.search_text` stays the expanded bare name. `symbol_fts` keeps `id`, `search_text`, and `comment`.

#### Implementation status

Conformant. `SQLITE_SCHEMA_VERSION` is 12. `ensureSchemaVersion` / `assertExistingSchemaCompatible` throw when the stored version is not 12. DDL includes the column and the equality index and does not mention `member_form`. Insert writes `symbol.qualifiedName ?? null`. `symbol_fts` is still the three-column FTS5 table. FTS content may still contain the dotted phrase because the indexer expands owner text into the FTS document; that is not an extra column.

#### Test coverage gaps

`sqlite-graph-store.spec.ts` rejects versions 10 and 11 without altering the table, rejects version 9 with expected 12, asserts the column and index, and round-trips schema 12. Version 13 is the same inequality branch as version 9 and has no separate fixture. Rebuild-on-index still uses the existing `SCHEMA_INCOMPATIBLE` recovery; this change did not add a new migration.

#### Dependency contradictions

None against `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`, or `code-graph:workspace-integration`. ADR-0024 records schema 12 and `qualified_name`.

### code-graph:indexer

#### Requirements summary

An owned member persists `qualified_name` such as `EditChange.execute`. A top-level function has none. Coverage `COVERS_SYMBOL` still targets the logical id. `InMemoryIndexSession.getLogicalSymbols()` must stamp the spelling, because `parseLogicalSymbol` drops the optional field.

#### Implementation status

Conformant. Adapters call `assignQualifiedNames` on the in-memory map. Persistence uses `getLogicalSymbols()`, which sorts by id and then calls `assignQualifiedNames`. The integration test asserts some `execute` row has `qualified_name = EditChange.execute`. Markdown and `package.json` stay `FILE_NOT_INDEXED`. `@specd/sdk barrel` and `Integration (real kernel)` stay `SYMBOL_NOT_FOUND`.

#### Discrepancies

None.

#### Test coverage gaps

None for the persistence stamp. The integration SQL assertion is the write-path proof.

#### Dependency contradictions

None. Indexer still commits through the graph store and still classifies non-code files as documents.

## Summary counts

- requirements checked: schema 12, equality lookup, search-text non-identity, indexer stamp, coverage ids
- conforming: all inspected requirements
- discrepancies: 0
- missing tests: 1 narrow gap (`Search text is not identity` has no direct name-lookup assertion; behavior follows the column split)
- dependency contradictions: 0

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

# Partial: sdk-globals

Audit mode: change `language-agnostic-member-symbol-references` (state `verifying`).
Primary spec source: merged preview `changes spec-preview language-agnostic-member-symbol-references sdk:build-implementation-review` (published `specs/` not used).
Delta under audit: added requirement **Unparsed stored symbol text** and its five scenarios. Inherited requirements were checked for continued conformance and were not re-audited as if they were new.
Evidence: `packages/sdk/src/orchestration/build-implementation-review.ts`, `packages/sdk/test/orchestration/build-implementation-review.spec.ts`, CLI consumers of the projection, `packages/sdk/src/orchestration/run-index-project-graph.ts`, `docs/adr/0024-logical-symbol-resolution.md`. No code or spec files were modified.

## sdk:build-implementation-review

### Requirements summary

| Requirement                              | Origin               | Verdict    |
| ---------------------------------------- | -------------------- | ---------- |
| Delivery-neutral orchestration           | inherited            | conformant |
| Stable review projection                 | inherited            | conformant |
| One health snapshot and batch resolution | inherited            | conformant |
| Unparsed stored symbol text              | added by this change | conformant |
| Graph availability behavior              | inherited            | conformant |
| Shared host behavior                     | inherited            | conformant |

### Implementation status

`buildImplementationReview` reads Core once via `ctx.kernel.changes.getImplementationReview`, builds resolver inputs, then under one `withOpenGraphProvider` lifecycle calls `getGraphHealth` once and `resolveSymbolReferences` once with that health snapshot. Empty symbol batches skip the resolver call. Stored `specId`, `file`, `fileLinkExplicit`, and `symbols` are copied onto the projection. Symbol rows keep the original string and the provider `SymbolResolutionResult`. File-only links get `symbolResolutions: []` and are not sent to the resolver.

`buildResolutionRequests` still does only this:

- workspace = spec id before the first `:`, or the whole spec id when `:` is absent
- `requested` = the stored symbol string
- `filePath` = the stored link file (empty string when the link has no file)

It does not split `.` or `::`, does not parse `@specd/...` package text, does not parse `logical|` ids, does not set `language`, `symbolSpace`, `kind`, `logicalId`, `ownerId`, or `memberSemantics`, and does not read a package-to-workspace map. `ResolveSymbolReferenceInput.language` stays unset, so the SDK does not select a language adapter.

Provider rows are copied by index. A shorter batch throws a generic `Error` (internal contract break). Open, health, and resolution failures propagate through `withOpenGraphProvider` and are not rewritten as `missing` links. CLI `enrichImplementationTracking` is the only production caller; `implementation` and `status` print `resolution.status` and `resolution.reasonCode` from that projection and do not run same-file, rightmost-segment, or workspace-name matching.

### Change invariants (not defects)

- **Link forwarding unchanged.** `EditChange.execute` is requested with its link file. `buildResolutionRequests` was not turned into a member parser.
- **`@specd/sdk barrel` and `Integration`.** The SDK does not assign `SYMBOL_NOT_FOUND`. It copies the provider result. The unit test feeds `@specd/sdk barrel` as unresolved `REFERENCE_UNPROVEN` and asserts that string is not rewritten into a package lookup. A real-kernel `SYMBOL_NOT_FOUND` for barrel or `Integration` is produced by Code Graph, not by this orchestration.
- **Markdown and `package.json`.** The SDK does not classify files. File-level links skip symbol resolution. `FILE_NOT_INDEXED` is a provider reason, not an SDK rewrite.
- **`MemberForm`.** No `MemberForm` / `member_form` in `packages/sdk`. ADR-0024 states schema 12 stores `qualified_name` and drops `member_form`. Published specs that still name `MemberForm` are outside this change until archive.
- **Schema 12 / `qualified_name`.** `runIndexProjectGraph` forwards `codeGraphVersion` and recreates storage on `GraphStorageRecoveryRequiredError` when `force` or `SCHEMA_INCOMPATIBLE`. It does not parse symbols or own `qualified_name`. ADR-0024 places schema 12 and `qualified_name` in Code Graph. That matches the SDK rule that stored text is forwarded unparsed.

### Scenario coverage

| Scenario                                           | Evidence                                                                                                                                                                                                                                               | Coverage                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| SDK composes Core health and resolver              | first unit test: one Core read, one provider, one health read, one batch, no presenter formatting in the SDK                                                                                                                                           | covered                         |
| Stored values are never rewritten                  | second unit test keeps spec, file, and symbol strings; canonical name exists only on the mocked resolution target                                                                                                                                      | covered                         |
| File-level link bypasses symbol resolution         | second unit test: file-only link has `symbolResolutions: []` and is absent from the batch                                                                                                                                                              | covered                         |
| Review avoids per-link provider work               | first unit test: health once, one `resolveSymbolReferences` call                                                                                                                                                                                       | covered                         |
| Qualified link text reaches the provider unchanged | `forwards stored qualified text...`: `requested: 'EditChange.execute'`, `filePath: 'packages/sdk/src/review.ts'`                                                                                                                                       | covered                         |
| Ambiguous provider result stays ambiguous          | same test: first row stays `ambiguous` / `AMBIGUOUS_MULTIPLE_TARGETS`                                                                                                                                                                                  | covered                         |
| Batch order matches stored links                   | same test: three links, five symbols, one call, request order equals stored order                                                                                                                                                                      | covered                         |
| Link without a file is still unparsed              | same test: `requested: 'loose'`, `filePath: ''`, object has no `language`                                                                                                                                                                              | covered                         |
| Unresolved barrel label stays unresolved           | same test: `@specd/sdk barrel` stays the request and stays `unresolved`                                                                                                                                                                                | covered                         |
| Non-current graph yields unresolved diagnostics    | SDK passes the single health snapshot into the batch and does not reclassify. Unit test keeps provider `missing` (`REFERENCE_ABSENT`) distinct from `unresolved` (`CONTENT_HASH_CHANGED`). Dirty/partial classification itself belongs to the resolver | covered at the SDK boundary     |
| Provider failure propagates                        | `it.each` open / health / resolution failures reject and still close                                                                                                                                                                                   | covered                         |
| CLI consumers use identical projection             | `enrichImplementationTracking` plus text rendering in `implementation.ts` and `status.ts` print SDK rows only                                                                                                                                          | covered by call-site inspection |

### Discrepancies

None.

Neither the added requirement nor the current SDK code rewrites stored symbol text. The spec says the provider result remains the review outcome; the implementation copies `SymbolResolutionResult` in stored order. Workspace extraction from the spec id is not parsing of the symbol string, and the added scenarios still pass that workspace through.

### Test coverage

The added scenarios are asserted in `packages/sdk/test/orchestration/build-implementation-review.spec.ts` (`forwards stored qualified text in one ordered batch and copies unresolved rows`). Exact `toHaveBeenCalledWith` equality fails if a `language` field or a split member is introduced. Inherited orchestration, preservation, file-only bypass, missing-versus-unresolved copy, and infrastructure propagation remain in the same file.

No missing tests for this spec's scenarios.

## Global and dependency contradictions

None.

Checked only the added requirement (forward stored symbol text and its file, do not parse owner-qualified syntax / package specifiers / canonical logical ids, do not select a language adapter, keep unresolved and ambiguous provider results) against:

- `default:_global/architecture` — resolution stays in Code Graph; SDK orchestration uses public Core and Code Graph APIs; dependency direction `sdk → core, code-graph` is unchanged. The SDK package is not given a new domain parser.
- `default:_global/conventions` — no new public signature, `any`, or filename. `buildResolutionRequests` remains a private function with an explicit return type.
- `default:_global/error-handling-conventions` — the added requirement does not introduce a user-facing failure. Unresolved and ambiguous stay resolution rows. The existing generic `Error` on a short batch is an internal invariant break, which the error spec allows for unexpected bugs.
- `default:_global/testing` — new coverage is a Vitest unit test with a typed provider mock. No snapshots, chmod, or concatenated paths.
- `default:_global/docs` — the spec still cites ADR-0024. The ADR's SDK sentence (one Core read, one lifecycle, one batch, no stored-link mutation) matches the added forwarding rule. Schema 12 and `qualified_name` stay Code Graph facts. No host import-surface change.
- `default:_global/eslint` — no new export, `any`, or layer violation in the forwarding path.
- `code-graph:document-model` — textual files without an adapter become documents during indexing. The SDK requirement forbids the review path from selecting an adapter or turning a barrel label into a package lookup. Those are different layers; the SDK rule does not deny document classification.
- `code-graph:workspace-integration` — package and module identity stay with indexer import resolution and language-adapter package facts. The SDK requirement forbids the review path from parsing package specifiers. That assigns package identity to Code Graph and matches "MUST NOT infer cross-workspace targets from a global same-name match." Drive-letter workspace parsing applies to graph identities, not to this spec-id workspace prefix.

## Summary counts

- Specs audited: 1 (`sdk:build-implementation-review`)
- Dependency specs checked for contradictions only: 8
- Requirements: 6 (1 added, 5 inherited)
- Scenarios: 12 (5 added, 7 inherited)
- Conformant scenarios: 12
- Discrepancies: 0
- Global/dependency contradictions: 0
- Missing tests: 0
- Findings: 0
