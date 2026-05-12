# Design: sqlite-graph-store-backend

## Overview

This change adds a second concrete code-graph backend, `SQLiteGraphStore`, while
keeping the existing abstract `GraphStore` port unchanged. The design has two goals:

1. make the backend pluggable through the same additive registry pattern already used
   by the kernel
2. move the built-in default backend from `ladybug` to `sqlite` once the SQLite
   implementation reaches full behavioral parity with the currently supported
   Ladybug-backed feature set

The backend remains an internal composition concern. There is no new `specd.yaml`
setting for storage engine selection.

## Current state and problem

Today `@specd/code-graph` effectively has a single concrete backend,
`LadybugGraphStore`, wired by default through the composition layer. That backend
already owns its physical schema, full-text search behavior, and persistence layout,
but backend selection is hardwired and there is no clean internal registry path for
introducing a second implementation.

Operationally, this has already shown up as a stability problem. During exploration,
graph commands intermittently failed with Ladybug lock errors against:

- `{configPath}/graph/code-graph.lbug`

That is the concrete failure mode motivating the design: the abstract store contract is
still sound, but the current default backend has become a reliability risk.

## Decisions

### Registry model

Graph-store extensibility follows the same pattern as the other kernel registries:

- `KernelOptions` carries additive `graphStoreFactories`
- each factory is registered by a stable backend id
- the selected backend is expressed separately as `graphStoreId`
- the builder mirrors that model with:
  - `registerGraphStore(id, factory)`
  - `useGraphStore(id)`

Only one graph-store backend is active per kernel/provider construction path.

This mirrors the existing kernel model intentionally. `createKernel(config, options)`
already accepts additive external registrations directly through `KernelOptions`, with
the builder acting as a fluent surface over the same model. Graph-store support should
fit into that same shape rather than introducing a one-off extension mechanism that
only works through the builder.

The resulting selection shape is:

- `createKernel(config, options)` uses `options.graphStoreId`
- the builder exposes:
  - `registerGraphStore(id, factory)`
  - `useGraphStore(id)`

This separates registration from selection, keeps the API coherent with the other
`register*()` extension points, and leaves room for future external or separately
packaged graph-store backends.

### Default backend policy

The built-in graph-store registry contains at least:

- `ladybug`
- `sqlite`

The built-in default backend becomes `sqlite` as part of this change. `ladybug`
remains available by explicit backend id selection for compatibility, debugging, and
incremental rollout safety.

The parity bar for that default switch is strict: SQLite is not a partial experiment.
It becomes the built-in default only when it supports the full set of behaviors that
the Ladybug backend currently supports.

### Persistence layout

The logical graph root does not move. Both concrete backends derive their filesystem
artifacts from the same graph storage root under `configPath`:

- persistent graph artifacts: `{configPath}/graph`
- temporary backend-owned artifacts: `{configPath}/tmp`

This keeps CLI behavior, cleanup expectations, and operational location stable while
allowing the physical files inside that root to differ by backend.

### Migration strategy

There is no data migration from Ladybug to SQLite in this change.

The graph database is a rebuildable derived artifact from repository contents, so
switching backends only requires reindexing. This keeps the first SQLite rollout
smaller and avoids carrying cross-backend migration complexity into the initial design.

## Architecture changes

### code-graph

`@specd/code-graph` gains:

- a new `SQLiteGraphStore` adapter under `infrastructure/`
- a graph-store factory contract exposed from composition
- a built-in graph-store registry containing the Ladybug and SQLite factories
- registry-driven backend resolution inside `createCodeGraphProvider(...)`

The composition layer stops hardwiring Ladybug. Instead, provider construction:

1. derives the graph storage root from `configPath`
2. merges built-in plus additive graph-store registrations
3. resolves one active backend id
4. constructs exactly one concrete `GraphStore` for that provider path

`CodeGraphProvider` still holds a single active `GraphStore` instance and remains
storage-agnostic above that boundary.

### core kernel

`@specd/core` gains:

- `graphStoreFactories` as another additive registry category
- `graphStoreId` in `KernelOptions`
- merged registry exposure including graph-store factories
- builder support for graph-store registration and backend selection

The kernel does not itself become a graph subsystem. It only carries the same additive
registry model so downstream composition can stay coherent with the rest of the API.

## Blast radius

The main implementation impact is concentrated in:

- `packages/code-graph/src/domain/ports/graph-store.ts`
- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
- new SQLite-backed infrastructure under `packages/code-graph/src/infrastructure/`
- `packages/code-graph/src/composition/code-graph-provider.ts`
- `packages/code-graph/src/composition/create-code-graph-provider.ts`
- `packages/core/src/composition/kernel.ts`
- `packages/core/src/composition/kernel-builder.ts`
- `packages/core/src/composition/kernel-registries.ts`
- `packages/core/src/composition/kernel-internals.ts`

The change also has indirect operational impact on graph CLI commands because the
selected backend remains internal while graph persistence still lives under the same
logical graph root.

## SQLite backend shape

`SQLiteGraphStore` is responsible for:

- SQLite connection lifecycle
- schema creation/versioning
- transactional implementation of the abstract mutation methods
- full-text search using SQLite-native search support
- destructive recreation of persisted backend state
- storing files, symbols, specs, relations, and metadata under the existing graph root

The design intentionally leaves the physical SQLite schema flexible enough to choose
the simplest stable layout during implementation, as long as the observable
`GraphStore` behavior matches the current Ladybug-backed behavior.

This means the SQLite schema may differ physically from Ladybug, but it must still
cover the same logical graph content:

- files
- symbols
- specs
- relations
- metadata
- symbol/spec search

## Verification approach

Implementation should be considered complete only when SQLite supports the currently
shipped behaviors that Ladybug supports for:

- indexing and full reindex
- symbol/spec search
- statistics
- traversal-facing queries
- impact/hotspot flows
- explicit backend recreation

Verification should cover both direct backend behavior and composition behavior:

- provider selection defaults to `sqlite`
- explicit `graphStoreId` can still select `ladybug`
- additive registrations can add an external backend id
- unknown ids and duplicate registrations fail clearly

This verification must include both backend-level tests and composition-level tests so
the rollout does not regress either the storage semantics or the registry/selection
surface.

## Documentation impact

Documentation should be updated in:

- `docs/core/ports.md`
- `docs/core/examples/implementing-a-port.md`
- any code-graph package docs that describe provider construction or backend behavior

The docs should explain the new registry category and backend-selection surface, while
also making clear that storage-engine choice is not a user-facing `specd.yaml`
setting.
