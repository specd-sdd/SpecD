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
