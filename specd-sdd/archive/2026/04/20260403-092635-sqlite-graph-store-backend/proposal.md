# Proposal: sqlite-graph-store-backend

## Motivation

The current Ladybug-backed code graph has become a reliability problem for `specd`.
This change introduces a SQLite-backed backend so the code graph can keep the same
abstract contract while moving toward a more stable default storage engine.

## Current behaviour

Today `@specd/code-graph` has a single concrete backend, `LadybugGraphStore`, wired by
default through the composition layer. That backend already owns its physical schema,
full-text search behavior, and persistence layout, but in practice it has been causing
locking, concurrency, and operational stability problems during indexing and graph
queries.

Backend selection is also effectively hardwired. There is no internal registry or
kernel-level mechanism for choosing one graph-store implementation over another, which
makes it awkward to introduce a second backend cleanly while preserving the abstract
`GraphStore` port.

## Proposed solution

Add a new SQLite-backed graph-store implementation with full-text search support,
keeping it behind the existing abstract `GraphStore` contract. Backend selection remains
an internal composition concern rather than a user-facing project config option.

The change will:

- introduce a `SQLiteGraphStore` backend as a sibling to `LadybugGraphStore`
- extend code-graph composition so it can resolve a graph-store implementation
  internally instead of hardwiring Ladybug
- make that backend choice available through kernel options and the kernel builder
  via an internal graph-store registry, so future external backends can also be wired
  in through the same composition mechanism
- keep graph persistence rooted in the same logical graph storage location currently
  used by the Ladybug-backed graph
- switch the internal default backend from Ladybug to SQLite once SQLite reaches the
  agreed parity bar

## Specs affected

### New specs

- `code-graph:code-graph/sqlite-graph-store`: defines the SQLite-specific graph-store
  implementation, including physical schema, FTS behavior, persistence layout, and
  backend-specific operational requirements.
  - Depends on: `code-graph:code-graph/graph-store`, `code-graph:code-graph/symbol-model`, `core:core/config`

### Modified specs

- `code-graph:code-graph/graph-store`: extend the abstract graph-store contract where
  needed so multiple concrete backends can satisfy the same semantics without leaking
  backend-specific details.
  - Depends on (added): none

- `code-graph:code-graph/ladybug-graph-store`: narrow the Ladybug spec to coexist as a
  non-default concrete backend once SQLite is available, while preserving its existing
  backend-specific responsibilities.
  - Depends on (added): none

- `code-graph:code-graph/composition`: change the composition requirements so graph-store
  selection is internal, registry-driven, and no longer hardwired to Ladybug.
  - Depends on (added): `core:core/kernel`, `core:core/kernel-builder`

- `core:core/kernel`: allow kernel construction to carry internal graph-store selection
  inputs without exposing backend choice through project config.
  - Depends on (added): `code-graph:code-graph/composition`

- `core:core/kernel-builder`: allow fluent builder-based selection of the internal
  graph-store backend or registry input.
  - Depends on (added): `code-graph:code-graph/composition`

## Impact

Affected areas are concentrated in the code-graph storage and composition path:

- `packages/code-graph/src/domain/ports/graph-store.ts`
- `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`
- new SQLite-backed infrastructure under `packages/code-graph/src/infrastructure/`
- `packages/code-graph/src/composition/code-graph-provider.ts`
- `packages/code-graph/src/composition/create-code-graph-provider.ts`
- `packages/core/src/composition/kernel.ts`
- `packages/core/src/composition/kernel-builder.ts`
- `packages/core/src/composition/kernel-registries.ts`
- `packages/core/src/composition/kernel-internals.ts`

The change also affects how graph commands behave operationally because the selected
backend remains internal while persistence still uses the same logical graph storage
root under `configPath`.

## Technical context

The user explicitly rejected backend selection in `specd.yaml`. The backend must remain
an internal composition decision, chosen via kernel options, builder inputs, or a
registry/factory mechanism similar to other additive registries already present in the
kernel.

The current `graph-store` spec is already abstract and suitable for multiple backends,
which makes this a backend-expansion change rather than a redesign of the storage port.
The current `ladybug-graph-store` spec already owns backend-specific schema, FTS, and
layout concerns, which creates a clear place for a sibling `sqlite-graph-store` spec.

The persistence root must remain aligned with the current graph storage location, rather
than introducing a new user-facing config knob or a separate graph path convention.

The parity bar is that the SQLite backend must support the full set of behaviors that
the Ladybug backend supports today. This is not a partial-backend experiment: SQLite
becomes the default only when it can cover the same currently supported code-graph
capabilities.

The long-term direction is that graph-store backends should be pluggable through an
internal registry, so future external adapters can be integrated into the kernel and
composition layer without adding one-off wiring for each backend.

This implies two distinct capabilities:

- a way to register graph-store backends in the internal registry, so external or
  separately packaged backends can be added in the future
- a way to select which registered graph-store id should be used by the kernel and
  composition layer for a given construction path

Backend selection should therefore be modelled by a graph-store identifier registered
in that internal registry. The registry key is the stable way to refer to a backend
from kernel options and builder inputs.

To stay coherent with the rest of the kernel API, graph-store extensibility should
follow the same registry pattern as the other `register*()` extension points: a named
registration API for graph-store factories, plus a separate selection of the active
registered id for a given kernel/provider construction path.

That same coherence should also apply to `createKernel(config, options)`. The current
kernel already accepts additive external registrations directly through `KernelOptions`,
with the builder acting as a fluent surface over the same model. Graph-store support
should follow that same pattern rather than introducing a special-case extension path
that only works through the builder.

The agreed selection shape is:

- `createKernel(config, options)` uses `options.graphStoreId`
- the builder exposes:
  - `registerGraphStore(id, factory)`
  - `useGraphStore(id)`

This keeps graph-store selection explicit while matching the kernel's existing additive
registry style.

Operationally, the current graph backend continues to show reliability issues. During
exploration, graph commands intermittently failed with Ladybug lock errors against:

- `/Users/monki/Documents/Proyectos/specd/.specd/config/graph/code-graph.lbug`

That observed behavior reinforces the need for a second backend and supports the user's
goal of making SQLite the default once it is good enough.

## Open questions

- None at proposal level. The default backend policy is agreed:
  when `graphStoreId` is omitted, the kernel uses the current internal default backend.
  That default is `ladybug` at the start of this change and is expected to switch to
  `sqlite` once the SQLite backend reaches the required parity bar.
