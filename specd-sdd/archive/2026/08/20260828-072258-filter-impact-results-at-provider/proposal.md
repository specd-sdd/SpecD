# Proposal: filter-impact-results-at-provider

## Motivation

Impact analysis needs the same precise scoping available in graph search without
retrieving and presenting unrelated results. Filtering at the provider and SQLite
boundary keeps impact output efficient and preserves Code Graph as the owner of
query semantics.

## Current behaviour

`specd graph impact` does not currently expose result-type, symbol-kind, or
workspace filters. Its provider operations return the complete impact collections,
and the CLI only projects display paths and output shapes. Adding the requested
filters as CLI-side projection would make SQLite return broad data that is then
discarded and would place query semantics in the delivery adapter.

The first implementation exposed a further contract gap: base symbol impact results
do not contain an affected-spec collection. Consequently,
`graph impact --symbol SpecRepository --type specs` accepts the filter but returns no
specs even when indexed coverage relations connect impacted symbols or files to specs.

## Proposed solution

Extend the Code Graph impact request and result contracts so the CLI passes
`--type`, `--kind`, `--workspace`, and `--exclude-workspace` unchanged as a typed
filter request. Code Graph will apply the filter while building impact results,
and the SQLite implementation will constrain its result queries before materializing
the returned files, symbols, and specs. The CLI will retain argument validation,
normalization, and text/JSON/TOON rendering, but will not filter provider results.

Extend the base `ImpactResult` shape with a required `affectedSpecs` collection so
every target family can materialize requested specs. Symbol and public-binding impact
will derive it from specs covering admitted symbol and file evidence; omitted filters
will preserve all legacy fields while adding this deterministic collection.

The workspace inclusion and exclusion semantics will match `specd graph search`:
`--workspace` and `--exclude-workspace` are repeatable. Both
`--type` and `--kind` accept comma-separated lists. `--kind` is valid only when
`--type` is omitted or includes `symbols`; otherwise it is a usage error. The only
supported impact types are `files`, `symbols`, and `specs`; documents are not an
impact-result category. Provider-side filters apply before any final result limits
or presentation.

## Specs affected

### New specs

None.

### Modified specs

- `cli:graph-impact`: add the public filter flags and require the command to
  delegate the full filter request to Code Graph rather than project results.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:traversal`: define filtered impact result semantics for result
  categories, symbol kinds, and workspace inclusion/exclusion.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:graph-store`: add the backend-neutral query contract required to
  obtain only the impact data admitted by the filters.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:sqlite-graph-store`: require the SQLite database and worker path to
  apply impact predicates in physical queries before rows cross the adapter boundary.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:composition`: expose the typed filtered-impact operation through
  `CodeGraphProvider` while retaining provider lifecycle ownership.
  - Depends on (added): none.
  - Depends on (removed): none.

## Impact

The implementation will change `cli:src/commands/graph/impact.ts`, its CLI tests
in `cli:test/commands/graph-impact.spec.ts`, Code Graph traversal services and
value objects, the `CodeGraphProvider` facade in
`code-graph:src/composition/code-graph-provider.ts`, and the SQLite store/database
and worker-RPC path represented by
`code-graph:src/infrastructure/sqlite/sqlite-graph-store.ts` and
`code-graph:src/infrastructure/sqlite/sqlite-graph-database.ts`,
`code-graph:src/infrastructure/sqlite/sqlite-worker-protocol.ts`, and
`code-graph:src/infrastructure/sqlite/sqlite-worker.ts`.

The revision additionally changes `ImpactResult` and symbol/public-binding aggregation
so `affectedSpecs` is present for all target families, plus the corresponding CLI,
domain, provider, SQLite, and regression tests.

Graph discovery confirms the existing `ImpactResult` and `FileImpactResult` value
objects, the provider's `analyzeImpact`, `analyzeFileImpact`,
`analyzeFilesImpact`, and `analyzeSpecImpact` facade methods, and CLI-only output
formatters in the impact command. The current graph-search contract already
establishes provider-owned filtering before limits, providing the compatibility
model for workspace and exclusion semantics. Hotspot inspection identifies CLI
test program construction as highly coupled, so the change should extend existing
impact test setup rather than create parallel command wiring.

## Technical context

The user explicitly requires `--type`, `--kind`, `--workspace`, and
`--exclude-workspace`. The accepted types are `files`, `symbols`, and `specs`;
documents are indexed for search but are not produced by impact analysis. Symbol
kind applies only to symbol results. The CLI continues to call Code Graph through
its existing provider lifecycle; it must not perform a post-analysis in-memory
filter. It only parses, validates, and normalizes CLI values into a typed provider
request. SQLite must issue queries whose predicates already encode the requested
types, kinds, included workspace, and excluded workspaces, so it produces the
filtered result set rather than loading broad collections and filtering afterwards.

This follows the existing hexagonal boundary: domain/application contracts describe
filter semantics, `CodeGraphProvider` delegates under its existing availability
checks, and SQLite owns physical query predicates. The alternative of retaining
CLI-side filtering was rejected because it violates the required ownership and
needlessly materializes excluded results.

## Open questions

None. The result-type names, workspace behavior, ownership boundary, and SQLite
query-time requirement are settled by the user request and existing graph-search
contract.

The user confirmed that `--type specs` on a symbol must return specs covering the
admitted impacted symbols or files, rather than an empty result caused by the previous
target-specific result shape.
