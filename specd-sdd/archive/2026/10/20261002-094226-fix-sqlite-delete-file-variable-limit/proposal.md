# Proposal: fix-sqlite-delete-file-variable-limit

## Motivation

SQLite graph indexing can fail with `SqliteError: too many SQL variables` when a file
contains enough symbols or a batch lookup contains enough values. Valid graph mutations and
reads must remain safe regardless of repository or generated-file cardinality.

## Current behaviour

`SQLiteGraphDatabase.deleteFileLocalState` first loads every symbol ID for a file into
Node.js, then expands that collection twice into one relation-deletion statement and once
into a symbol-deletion statement. A file with more than roughly 16,383 symbols can therefore
exceed SQLite's host-parameter limit during `upsertFile`, `removeFile`, or bulk commit.

Several other worker-side batch reads also construct unbounded `IN (...)` parameter lists.
The existing database already uses `SQLITE_BATCH_PARAMETER_LIMIT` and `chunksOf` in some
paths, but coverage is inconsistent. Queries with fixed parameters or repeated value lists
need a smaller, budget-aware chunk size rather than blindly using the full limit.

## Proposed solution

Replace file-local symbol cleanup with indexed SQLite subqueries whose parameter count is
constant and independent of the file's symbol count. Delete relations referencing the
file's symbols before deleting those symbols, then retain the existing cleanup of relations
referencing the file path, FTS content, and the file row.

Harden the affected set-based batch read methods by calculating each chunk size from the
shared safe parameter budget, subtracting fixed parameters and accounting for inputs that
appear more than once in a statement. Merge chunk results with explicit deduplication and
the existing deterministic comparators so ordering and empty-input behaviour remain stable.

This change does not modify TypeScript symbol extraction. Filtering object properties from
array-backed data records is owned by the separate
`filter-typescript-array-data-symbols` change.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:sqlite-graph-store`: Require file-local cleanup and affected set-based batch
  reads to stay within a bounded SQL parameter budget while preserving atomic mutations,
  deterministic results, deduplication, and empty-input semantics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The implementation is confined to `@specd/code-graph`:

- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`
  - Replace the unbounded ID expansion in `deleteFileLocalState` with constant-parameter
    subqueries.
  - Apply budget-aware chunking to the audited batch lookups that still expand unbounded
    input collections.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
  - Preserve empty-input semantics at the host boundary with internal early returns so an
    empty logical batch does not dispatch an otherwise unnecessary worker RPC.
- `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
  - Add integration coverage for replacement, removal, and bulk commit of a file whose old
    implementation would exceed SQLite's variable limit.
  - Prove that a direct `upsertFile` failure after cleanup begins rolls back the file's
    previously committed symbols, relations, and searchable content.
  - Add boundary coverage for chunked reads using inputs that exceed the configured safe
    batch budget.

No public `GraphStore` signatures, worker RPC shapes, database schema, or external
dependencies change. The code graph identifies `deleteFileLocalState` in the SQLite
infrastructure adapter; callers observe only safer execution of existing operations.

## Technical context

The cleanup query must remove symbol-endpoint relations before deleting the corresponding
symbols because relation endpoints are polymorphic and cannot rely on a foreign-key cascade.
The schema already indexes `symbols(file_path)`, `relations(source, type)`, and
`relations(target, type)`, supporting the subquery approach without transferring thousands
of IDs across the SQLite/Node boundary.

JavaScript-side deletion chunking was considered and rejected for file-local cleanup. It
would avoid the limit but retain the ID materialization, require many SQL executions, and
complicate an operation that can be expressed directly inside SQLite with a fixed parameter
count.

For remaining batch reads, chunk sizing must use the statement's real parameter shape:

`floor((SQLITE_BATCH_PARAMETER_LIMIT - fixedParameterCount) / inputMultiplicity)`.

For example, a lookup with one fixed relation type cannot accept a full 900-value chunk, and
a query that inserts every path into two predicates must account for twice the path count.
Each logical operation continues to cross the worker boundary once; only its internal SQL
execution is divided into safe chunks.

Verification should assert observable behaviour rather than inspect SQL text. The regression
threshold for the original cleanup is approximately 16,384 symbols because the old relation
statement bound every symbol ID twice. General chunking tests should instead exceed the
configured safe budget by the smallest useful amount.

## Open questions

None.
