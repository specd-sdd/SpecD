# Proposal: repair-code-graph-coverage-indexing

## Motivation

Code Graph reports incomplete or impossible implementation coverage even when canonical specs contain valid persisted file and symbol links. This breaks requirement-aware navigation and impact analysis, and forced indexing can leave the graph unable to recover incrementally.

## Current behaviour

A healthy index built after physically removing the database contains 1,106 code files, 37,923 symbols, and 177 `COVERS_FILE` relations, but zero `COVERS_SYMBOL` relations. This confirms that symbol coverage is lost independently of physical graph reconstruction.

When `graph index --force` logically clears an existing SQLite graph, retained incremental state can still classify every discovered source as unchanged. The physical graph is then empty while coverage records claim the inputs are indexed, subsequent incremental runs keep skipping them, and graph health may report coverage as complete despite missing physical nodes.

Symbol-qualified implementation links also depend on run-local semantic state. If only persisted spec implementation state changes, or if a changed file replaces covered symbols, coverage may be silently omitted instead of being deterministically reprojected against the current logical-symbol graph. SQLite relation validation currently rejects logical-symbol targets for `COVERS_SYMBOL` even though the indexer emits them.

## Proposed solution

Define one observable coverage-indexing contract across the indexer, abstract store, SQLite backend, health reporting, and CLI:

- forced indexing reconsiders every selected input and produces a complete internally consistent generation;
- `COVERS_SYMBOL` addresses current logical symbol identities and survives valid persistence;
- spec coverage is deterministically reprojected when persisted implementation links or their code targets change;
- unresolved or ambiguous symbol links produce visible diagnostics without guessed symbol relations;
- graph health detects retained indexing claims that disagree with persisted graph contents;
- CLI results keep full-rebuild and per-input diagnostics visible.

The requirements will describe these observable outcomes. The implementation may refine the internal repair mechanism after executable tests establish which combination of clear semantics, incremental-state invalidation, session hydration, and endpoint validation is required.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:indexer`: require complete forced reconsideration and deterministic coverage reprojection against current logical symbols.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: clarify logical-symbol coverage endpoints, clear-generation consistency, and the integrity information required by health checks.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: require backend parity for logical clear and acceptance of valid logical-symbol coverage endpoints.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:get-graph-health`: require detection of impossible coverage and physical-node combinations.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-index`: require forced runs to expose and satisfy complete-input reconsideration while retaining rebuild diagnostics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The primary implementation areas are the Code Graph provider/indexer, indexing-session hydration and coverage projection, the abstract `GraphStore` relation and clear contracts, SQLite persistence and endpoint validation, graph-health derivation, and graph-index command integration tests. Persisted derived graph data remains rebuildable; no compatibility migration or external dependency is intended.

Active changes overlap `code-graph:indexer`, `code-graph:graph-store`, and `code-graph:sqlite-graph-store`. Their logical-symbol and store-contract work must be reconciled rather than overwritten.

## Technical context

- `CodeGraphProvider.index()` currently calls `store.clear()` before executing a forced run.
- SQLite logical clear removes physical nodes and relations but retains `index_coverage` and semantic lookup tables; the indexer then reloads retained coverage hashes as incremental skip authority.
- A clean physical rebuild restores file coverage but leaves symbol coverage at zero.
- The indexer emits logical IDs for `COVERS_SYMBOL`; SQLite endpoint validation currently accepts only physical symbol IDs for that relation.
- Implementation links are part of the spec metadata fingerprint. The failure is not caused by globally ignoring implementation changes.
- Symbol coverage resolution can run with an unhydrated session when code itself is unchanged.
- Automatically degrading an unresolved symbol link to `COVERS_FILE` was considered but not accepted because it can overstate coverage. The contract should prefer diagnostics over guessed relations.
- Preserving stale physical-symbol relations was rejected in favor of reprojecting canonical persisted implementation state against the refreshed logical-symbol generation.

## Open questions

None that block requirements. The precise internal division between clear semantics, forced hash bypass, persisted-session hydration, and coverage reprojection will be decided in design and verified by regression tests, provided the observable contract above is satisfied.
