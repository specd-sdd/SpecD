# Tasks: sqlite-graph-store-backend

## 1. Graph-store registry surface

- [x] 1.1 Add graph-store factory contracts to code-graph composition
      `packages/code-graph/src/composition/create-code-graph-provider.ts`:
      `CodeGraphOptions` and new composition types — add `graphStoreId` and additive
      graph-store factory input so provider construction can select one backend from
      a merged registry
      Approach: introduce a `GraphStoreFactory` contract with a `create(...)` method
      and keep the composition API parallel to the kernel's existing additive
      registry model instead of hardwiring concrete classes
      (Req: Factory function)

- [x] 1.2 Build the built-in graph-store registry in code-graph
      `packages/code-graph/src/composition/create-code-graph-provider.ts`:
      provider construction path — replace direct `new LadybugGraphStore(...)` wiring
      with a built-in registry that contains `ladybug` and `sqlite`
      Approach: derive the graph storage root once, merge built-in plus additive
      registrations, resolve one backend id, then construct exactly one `GraphStore`
      instance for the provider
      (Req: Factory function)

- [x] 1.3 Export the new graph-store composition surface
      `packages/code-graph/src/composition/index.ts`, `packages/code-graph/src/index.ts`:
      export `GraphStoreFactory` and `CodeGraphFactoryOptions`
      Approach: expose only the registry-facing types that callers need while keeping
      concrete backends internal to the package entry point
      (Req: Package exports)

## 2. SQLite backend

- [x] 2.1 Implement the SQLite-backed graph-store adapter
      `packages/code-graph/src/infrastructure/sqlite/*`: new `SQLiteGraphStore`
      adapter and supporting files — add connection lifecycle, schema setup, metadata
      handling, and abstract `GraphStore` method implementations
      Approach: mirror the abstract `GraphStore` semantics, but keep the physical
      SQLite schema backend-specific and rooted under `{configPath}/graph`
      (Req: SQLite-backed implementation, SQLite schema ownership)

- [x] 2.2 Implement SQLite recreate and persistence layout
      `packages/code-graph/src/infrastructure/sqlite/*`: `recreate()` and path
      derivation — ensure SQLite uses the same logical graph root and tmp root as the
      existing backend
      Approach: derive persistent artifacts from `{configPath}/graph`, backend-owned
      temporary artifacts from `{configPath}/tmp`, and make `recreate()` discard the
      SQLite backend state without exposing backend filenames to callers
      (Req: Config-derived persistence layout, Destructive recreation, Backend-specific companion files)

- [x] 2.3 Implement transactional SQLite mutations and bulk indexing support
      `packages/code-graph/src/infrastructure/sqlite/*`: file/spec upsert, removal,
      additive relations, and bulk-write paths — preserve all-or-nothing semantics
      expected by the abstract store contract
      Approach: use SQLite transactions for `upsertFile`, `removeFile`, `upsertSpec`,
      `removeSpec`, and batch persistence so failed writes do not expose partial state
      (Req: Transactional mutation model, Bulk indexing support)

- [x] 2.4 Implement SQLite symbol/spec search
      `packages/code-graph/src/infrastructure/sqlite/*`: search and FTS structures —
      support symbol/spec full-text queries with relevance ordering
      Approach: use SQLite-native full-text search, index symbol search text plus
      comments and spec title/description/content, and wire `rebuildFtsIndexes()`
      for backends that need explicit refresh after bulk writes
      (Req: SQLite full-text search)

## 3. Existing backend compatibility

- [x] 3.1 Keep Ladybug selectable by backend id
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`,
      `packages/code-graph/src/composition/create-code-graph-provider.ts`:
      preserve the current implementation while making it available by explicit id
      `ladybug`
      Approach: keep Ladybug as a concrete backend in the built-in registry and stop
      treating it as the only construction path
      (Req: Ladybug-backed implementation)

- [x] 3.2 Preserve abstract GraphStore compatibility
      `packages/code-graph/src/domain/ports/graph-store.ts`,
      `packages/code-graph/src/composition/create-code-graph-provider.ts`:
      ensure both built-in backends satisfy the same port and composition contract
      Approach: avoid backend-specific conditionals above the infrastructure layer and
      make provider behavior storage-agnostic once a backend has been selected
      (Req: GraphStore port, CodeGraphProvider facade)

## 4. Kernel integration

- [x] 4.1 Extend kernel registries with graph-store factories
      `packages/core/src/composition/kernel-registries.ts`,
      `packages/core/src/composition/kernel.ts`,
      `packages/core/src/composition/kernel-internals.ts`: add the additive registry
      category and flow it through kernel construction
      Approach: follow the same registry pattern used for other `register*()`
      extension points so external graph-store backends can be added through
      `KernelOptions`
      (Req: createKernel accepts optional KernelOptions, KernelOptions supports additive registries)

- [x] 4.2 Add `graphStoreId` to kernel selection flow
      `packages/core/src/composition/kernel.ts`,
      `packages/core/src/composition/kernel-internals.ts`: carry the selected backend
      id into downstream graph composition
      Approach: model selection separately from registration with `options.graphStoreId`
      and fail clearly when the selected id is not present in the merged registry
      (Req: createKernel accepts optional KernelOptions, Kernel rejects invalid registry references)

- [x] 4.3 Expose merged graph-store registries from the built kernel
      `packages/core/src/composition/kernel.ts`,
      `packages/core/src/composition/kernel-registries.ts`: include graph-store
      factories in the final registry view
      Approach: expose the same merged built-in plus external registry set that was
      actually used during kernel construction
      (Req: Kernel exposes merged registries)

- [x] 4.4 Extend the kernel builder with graph-store APIs
      `packages/core/src/composition/kernel-builder.ts`: add fluent
      `registerGraphStore(id, factory)` and `useGraphStore(id)`
      Approach: keep the builder as a thin fluent surface over `KernelOptions`, with
      `useGraphStore(id)` selecting one active backend and `registerGraphStore(...)`
      only extending the registry
      (Req: Builder accumulates additive kernel registrations, Builder supports fluent registration methods, Builder builds kernels with createKernel-equivalent semantics, Builder rejects conflicting registrations)

## 5. Composition and default behavior

- [x] 5.1 Make SQLite the built-in default provider backend
      `packages/code-graph/src/composition/create-code-graph-provider.ts`,
      `packages/code-graph/src/composition/code-graph-provider.ts`: default backend
      resolution — use `sqlite` when no explicit backend id is supplied
      Approach: treat `sqlite` as the built-in default id while still allowing
      explicit override to `ladybug` or a custom registered backend
      (Req: Default backend role)

- [x] 5.2 Keep persistence rooted in the current graph location
      `packages/code-graph/src/composition/create-code-graph-provider.ts`,
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`,
      `packages/code-graph/src/infrastructure/sqlite/*`: path resolution — ensure both
      backends still persist under the same logical graph storage root
      Approach: derive backend storage from `config.configPath` rather than adding any
      new project config knob or backend-specific path setting
      (Req: Config-derived persistence layout)

## 6. Tests and verification

- [x] 6.1 Add composition tests for backend selection and custom registration
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`:
      provider construction scenarios — cover default `sqlite`, explicit `ladybug`,
      additive custom registration, and unknown backend failure
      Approach: verify provider construction behavior at the composition boundary
      instead of only through low-level backend tests
      (Req: Factory function)

- [x] 6.2 Add kernel and builder tests for graph-store registration
      `packages/core/test/composition/*`: kernel and builder registry tests — cover
      `graphStoreFactories`, `graphStoreId`, `registerGraphStore(...)`,
      `useGraphStore(...)`, duplicate id rejection, and unknown id failure
      Approach: mirror the existing registry tests so graph-store support follows the
      same additive semantics as the other kernel extension points
      (Req: createKernel accepts optional KernelOptions, KernelOptions supports additive registries, Kernel exposes merged registries, Kernel rejects invalid registry references, Builder supports fluent registration methods)

- [x] 6.3 Add backend contract and parity tests for SQLite
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`,
      new `packages/code-graph/test/infrastructure/sqlite/*`: backend tests — prove
      SQLite satisfies the abstract store contract and the currently supported
      Ladybug-backed flows
      Approach: reuse the existing graph-store contract test suite where possible and
      add SQLite-specific coverage for recreate, FTS, transactions, and companion
      files under the graph root
      (Req: SQLite-backed implementation, SQLite full-text search, Transactional mutation model, Bulk indexing support, Destructive recreation)

## 7. Documentation

- [x] 7.1 Update core docs for the new registry category
      `docs/core/ports.md`, `docs/core/examples/implementing-a-port.md`: registry and
      factory documentation — describe graph-store registration and backend selection
      in the same terms as the other kernel extension points
      Approach: document registration by backend id plus separate selection by
      `graphStoreId`, and make clear this is an internal composition concern rather
      than a `specd.yaml` feature
      (Req: Documentation impact)

- [x] 7.2 Update code-graph-facing docs for the new default backend
      `packages/code-graph/README.md` and any provider-construction docs touched by the
      rollout: explain that `sqlite` is now the built-in default and `ladybug`
      remains available by explicit selection
      Approach: update provider examples and architecture text to show registry-driven
      composition without exporting concrete backend classes from the package entry
      point
      (Req: Documentation impact)
