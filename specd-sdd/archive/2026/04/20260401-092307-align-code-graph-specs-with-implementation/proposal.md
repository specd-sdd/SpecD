# Proposal: align-code-graph-specs-with-implementation

## Motivation

The current `@specd/code-graph` implementation has already moved in ways that are no longer accurately described by the existing specs. We need to bring the specs back into line now, before more work piles up on top of an outdated description of the indexer, graph-store contract, and PHP adapter behavior.

## Current behaviour

Today, the `graph-store` spec mixes two different concerns: the `GraphStore` port contract and the concrete `LadybugGraphStore` implementation details. At the same time, the code now stages indexing artifacts under repo-local `.specd` paths, uses repo-local temp storage for bulk-load CSVs, and the PHP adapter can derive namespace and symbols in a single pass, while the specs still reflect the older shape.

The project configuration spec also does not currently model a dedicated `configPath` for persistent graph artifacts and temporary indexing files, even though the current direction is to stop hardcoding those locations and make them derive from configuration.

There is also still one remaining backend leak in the CLI path: `specd graph index --force` currently deletes Ladybug-specific files (`.lbug`, `.wal`, `.lock`) directly from the command instead of delegating that destructive reset to the graph-store backend. That couples the CLI to the current adapter and blocks a future backend such as SQLite from fitting the same flow cleanly.

In addition, the graph CLI commands currently fail abruptly when indexing and read-oriented commands overlap. While `graph index` is mutating the backend, `graph search`, `graph hotspots`, `graph impact`, and `graph stats` can all hit the database while it is locked and surface backend errors instead of a deliberate, user-facing message explaining that the graph is currently being reindexed.

## Proposed solution

Update the affected specs so they describe the current and intended behavior more precisely:

- keep `code-graph:code-graph/graph-store` focused on the `GraphStore` port and storage-agnostic contract
- introduce a new implementation spec for `code-graph:code-graph/ladybug-graph-store`
- move the Ladybug-specific schema requirements currently living in `code-graph:code-graph/database-schema` into `code-graph:code-graph/ladybug-graph-store`, then retire `database-schema` as a standalone spec
- update `code-graph:code-graph/indexer` so it depends only on the abstract graph-store contract and config-driven staging/temp behavior, not on any concrete backend schema
- update `cli:cli/graph-search` so it depends only on abstract search capabilities exposed by the graph store, not on Ladybug-specific FTS details
- update `cli:cli/graph-index` so `--force` delegates destructive backend reset to the abstract graph-store contract rather than deleting adapter-specific files directly
- update the `cli` graph command specs so they describe a shared CLI-level lock guard: `graph index` acquires an indexing lock before it mutates the graph, releases it on normal exit and signal-driven shutdown, and the read-oriented graph commands fail fast with a clear "graph is being indexed, try again shortly" style message when that lock is present
- update `code-graph:code-graph/language-adapter` to allow combined namespace-and-symbol extraction for adapters such as PHP
- update `core:core/config` to add `configPath`, defaulting to `.specd/config`, and define `{configPath}/graph` and `{configPath}/tmp` as the derived locations for graph persistence and temporary graph/indexing artifacts

## Specs affected

### New specs

- `code-graph:code-graph/ladybug-graph-store`: implementation-specific requirements for the Ladybug-backed `GraphStore` adapter, including persistence location, temp artifact handling, bulk load behavior, FTS behavior, schema shape, and schema-version handling
  - Depends on: `code-graph:code-graph/graph-store`, `core:core/config`

### Modified specs

- `code-graph:code-graph/graph-store`: narrow the spec to the `GraphStore` port contract and remove concrete `LadybugGraphStore` behavior that belongs in an implementation spec
  - Depends on (added): none
- `cli:cli/graph-index`: remove Ladybug-specific file-deletion semantics from `--force` and describe it in terms of an abstract backend recreation/reset capability
  - Depends on (added): `code-graph:code-graph/graph-store`
- `cli:cli/graph-hotspots`: add concurrency-facing behavior for the shared graph indexing lock so hotspot reads fail fast with a user-facing retry message instead of surfacing backend lock errors
  - Depends on (added): none
- `cli:cli/graph-impact`: add concurrency-facing behavior for the shared graph indexing lock so impact analysis fails fast with a user-facing retry message instead of surfacing backend lock errors
  - Depends on (added): none
- `cli:cli/graph-stats`: add concurrency-facing behavior for the shared graph indexing lock so stats reads fail fast with a user-facing retry message instead of surfacing backend lock errors
  - Depends on (added): none
- `code-graph:code-graph/indexer`: describe staged intermediate artifacts, cleanup expectations, and use of config-derived graph/temp directories instead of hardcoded locations, while keeping the spec coupled only to the abstract graph-store contract
  - Depends on (added): `core:core/config`
- `cli:cli/graph-search`: remove backend-specific references so the command depends on abstract graph search capabilities rather than Ladybug-specific FTS implementation details
  - Depends on (added): none
- `code-graph:code-graph/language-adapter`: allow adapters to expose combined namespace-and-symbol extraction so implementations like PHP can avoid redundant parsing while preserving the adapter contract
  - Depends on (added): none
- `core:core/config`: add `configPath` to project configuration, default it to `.specd/config`, and define derived graph persistence and temporary artifact directories from it
  - Depends on (added): none
- `code-graph:code-graph/database-schema`: absorb Ladybug-specific schema requirements into `code-graph:code-graph/ladybug-graph-store` and deprecate the standalone schema spec
  - Depends on (added): none

## Impact

- `packages/code-graph/src/domain/ports/graph-store.ts`
- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
- `packages/code-graph/src/infrastructure/ladybug/schema.ts`
- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
- `packages/code-graph/src/domain/value-objects/language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
- `packages/cli/src/commands/graph/index-graph.ts`
- `packages/cli` graph-search command path and any abstractions it consumes
- `packages/cli` graph-hotspots command path
- `packages/cli` graph-impact command path
- `packages/cli` graph-stats command path
- shared graph CLI locking helper(s) used by the graph command family
- `packages/core` config model and loaders that materialize `specd.yaml`
- any CLI/bootstrap path that currently derives `.specd` graph paths directly instead of through config

The change affects spec structure as well as configuration semantics. It does not introduce a new user-facing feature by itself, but it changes how the system is specified and where future implementation details will live.

## Technical context

This proposal comes out of an extended debugging session around `graph index` failures and memory pressure. Several conclusions from that session are relevant:

- the current implementation already stages index artifacts under repo-local `.specd/tmp/index-stage-*`
- bulk-load CSVs were moved to repo-local `.specd/tmp` rather than system temp directories
- the PHP adapter reduced duplicate parsing by combining namespace and symbol extraction in one pass
- a substantial amount of instability appeared to come from Ladybug/lbug behavior under load, which makes it even more important not to let implementation-specific Ladybug details dominate the generic `GraphStore` port spec
- `graph index --force` still hardcodes Ladybug file deletion in the CLI, which is the wrong layer for backend recreation logic
- read-oriented graph CLI commands currently fail opportunistically when they race an ongoing index instead of detecting that indexing is in progress and returning a clearer retry-later message

Architecturally, this change continues the existing hexagonal split:

- `GraphStore` remains the abstract port
- `LadybugGraphStore` becomes an implementation-specific concern and owns the Ladybug-only schema details
- configuration owns location policy
- indexer, CLI search, CLI index, and adapters consume the abstract contracts
- graph CLI concurrency coordination is handled by a shared CLI-level lock helper rather than by letting backend lock errors leak through command-by-command

The user also introduced a new direction during design discovery: stop hardcoding both the database location and temp directory, and instead derive them from a new `configPath` in `specd.yaml`. The proposed default is `.specd/config`, with graph data under `{configPath}/graph` and temporary artifacts under `{configPath}/tmp`.

The user also clarified the intended `--force` design: the CLI should not know how a backend destroys and recreates its persistent state. Instead, the abstract graph-store contract should expose a destructive `recreate()` capability, and concrete backends such as `LadybugGraphStore` should implement it in their own physical storage terms.

The user also clarified the desired concurrency behavior for CLI commands: `graph index` is the command that blocks concurrent access, and the other graph CLI commands should detect that condition through a shared lock file before the database layer fails indiscriminately. The visible behavior should be a short, explicit retry-later message rather than a backend lock or corruption-style error.

## Open questions

- Should `configPath` be project-level only, or should workspaces eventually be able to override graph/temp locations independently?
- In the new `ladybug-graph-store` spec, should CSV staging under `{configPath}/tmp` be a hard requirement, or should the spec only require deterministic repo-local temp handling?
- Should `code-graph:code-graph/indexer` explicitly require disk staging as part of the design, or only constrain bounded-memory chunked processing and cleanup of any staged artifacts?
