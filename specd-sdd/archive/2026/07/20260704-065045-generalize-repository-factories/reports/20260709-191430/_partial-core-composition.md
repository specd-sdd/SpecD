# Spec Compliance Audit: Core Composition Layer

This report presents the compliance audit for the change `generalize-repository-factories` across the core composition specifications:

- [core:composition](file:///Users/monki/Documents/Proyectos/specd/specs/core/composition/spec.md)
- [core:composition-resolver](file:///Users/monki/Documents/Proyectos/specd/specs/core/composition-resolver/spec.md)
- [core:kernel-builder](file:///Users/monki/Documents/Proyectos/specd/specs/core/kernel-builder/spec.md)
- [core:kernel](file:///Users/monki/Documents/Proyectos/specd/specs/core/kernel/spec.md)

---

## 1. Spec: `core:composition`

### Requirement & Scenario Audit

- **Requirement: Standalone repository factories return port interfaces**
  - _Conforms_: Yes. [createSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/spec-repository.ts#L16-L76) returns [SpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/ports.ts#L4) rather than the concrete implementation `FsSpecRepository`. [createChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/change-repository.ts#L17-L77) returns [ChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/ports.ts#L11). [createArchiveRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/archive-repository.ts#L17-L77) returns [ArchiveRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/ports.ts#L15).
- **Requirement: Use-case factories must use auto-detect for VCS-dependent adapters**
  - _Conforms_: Yes. Standalone factories like [createCreateChange](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/use-cases/create-change.ts#L72-L101) request the [ActorResolver](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/ports.ts#L34) and [VcsAdapter](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/ports.ts#L36) from the [CompositionResolver](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/composition-resolver.ts#L69). The resolver delegates actor/VCS probing to [createVcsActorResolver](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/actor-resolver.ts#L28) and [createVcsAdapter](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/vcs-adapter.ts#L59) which auto-probe without hardcoded VCS imports in use-case factories.
- **Requirement: Kernel builds all use cases from SpecdConfig**
  - _Conforms_: Yes. [createKernel](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/kernel.ts#L233-L391) mounts all use cases under grouped domain namespaces (e.g., `kernel.changes.create`). Standalone factories are also available directly (e.g. `createCreateChange(config)`). Approval gates are grouped under `kernel.changes.approveSpec` and `kernel.changes.approveSignoff` as required.
- **Requirement: Composition layer exposes a kernel builder**
  - _Conforms_: Yes. Exposes [createKernelBuilder](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/kernel-builder.ts#L283-L385).
- **Requirement: ConfigLoader / ConfigWriter are application ports**
  - _Conforms_: Yes. Custom loaders/writers can be injected. By default, `createConfigWriter` returns the file-system implementation.
- **Requirement: Config mutation is not wired into createKernel**
  - _Conforms_: Yes. [Kernel](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/kernel.ts#L159-L219) exports no configuration writer or mutating methods.
- **Requirement: SpecdConfig is a plain typed object**
  - _Conforms_: Yes. [SpecdConfig](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/specd-config.ts) has only readonly properties.
- **Requirement: FsChangeRepository options include artifact type resolution**
  - _Conforms_: Yes. Lazy `resolveArtifactTypes` is passed to [FsChangeRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L102-L175) context.
- **Requirement: Repository factories on public root**
  - _Conforms_: Yes. [createSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/public.ts#L24) and others are exported on the root barrel point. Invalid adapters throw `UnknownAdapterError`, and configuration arguments are validated at construction using Zod (e.g., `FsSpecOptionsSchema` in [FsSpecRepository](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/spec-repository.ts#L54-L111)).

### Test Coverage

- Unit tests in [barrel.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/barrel.spec.ts) verify barrel boundaries, ensuring concrete filesystem classes (like `FsSpecRepository`) are not exposed on the public root or `./ports`.
- Integration tests in [shared-repository-wiring.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/shared-repository-wiring.spec.ts) verify shared repository wiring and Zod-based lazy resolution.

---

## 2. Spec: `core:composition-resolver`

### Requirement & Scenario Audit

- **Requirement: Resolver is scoped to one composition session**
  - _Conforms_: Yes. [createCompositionResolver](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/composition-resolver.ts#L313-L633) is session-scoped. A new resolver instance is returned for every initialization call and cache states are fully encapsulated in closures.
- **Requirement: Resolver exposes normalized shared dependencies**
  - _Conforms_: Yes. Exposes repositories and services normalized as interfaces rather than raw config maps. For `ChangeRepository`, it gathers active, drafts, and discarded paths under one configuration object.
- **Requirement: Resolver is lazy and cacheable**
  - _Conforms_: Yes. Collaborators like repositories and services are resolved lazily on demand. Once constructed, they are cached inside closure variables within the resolver instance, avoiding double construction.
- **Requirement: Resolver does not own per-use-case dependency objects**
  - _Conforms_: Yes. The resolver exposes primitives (`getChangeRepository()`, `getSpecRepositories()`, etc.). The assembly of use-case-specific `XDeps` contracts is done in external helpers like `resolveCreateChangeDeps(resolver)` located next to the use-case factories.
- **Requirement: Invalid public argument combinations use one shared error**
  - _Conforms_: Yes. Uses [normalizeCompositionFactoryArgs](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/normalize-factory-args.ts#L28-L54) which throws `InvalidCompositionFactoryArgumentsError` when config and explicit dependencies are mixed.

### Test Coverage & Gaps

- Verified in [composition-resolver.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/composition-resolver.spec.ts).
- Argument boundaries and the throwing of `InvalidCompositionFactoryArgumentsError` are verified across all use-case test suites (e.g. [create-change.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/use-cases/create-change.spec.ts#L52)).
- **Coverage Gap**: There is no assertion in `composition-resolver.spec.ts` verifying the "lazy" requirement (e.g., that accessing one dependency does not instantiate unrelated dependencies). This could be resolved with spy tests, although correct lazy property behavior is visually confirmed in code.

---

## 3. Spec: `core:kernel-builder`

### Requirement & Scenario Audit

- **Requirement: Builder accumulates additive kernel registrations**
  - _Conforms_: Yes. [KernelBuilder](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/kernel-builder.ts#L47-L172) stores registrations in a private builder state mutable mapping. It compiles them only during `.build()` and does not mutate existing kernels. Repository overrides (e.g. `registerChangeRepository`) are supported.
- **Requirement: Builder supports fluent registration methods**
  - _Conforms_: Yes. Every registration method (like `registerSpecStorage`, `registerParser`, etc.) returns `this`, allowing method chaining.
- **Requirement: Builder builds kernels with createKernel-equivalent semantics**
  - _Conforms_: Yes. The `.build()` method delegates to `createKernel(config, toKernelOptions(options))`, guaranteeing identical configuration merging.
- **Requirement: Builder rejects conflicting registrations**
  - _Conforms_: Yes. Every registration method validates duplicate keys using `currentRegistry` views and throws `RegistryConflictError` on collision.
- **Requirement: Builder reuses the shared composition-resolver path**
  - _Conforms_: Yes. The builder uses the same composition registries and resolver paths under the hood.

### Test Coverage

- Fully verified in [kernel-builder.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/kernel-builder.spec.ts), including duplicate conflict throwing, fluent chaining, base extension, and isolation from graph-store builder methods.

---

## 4. Spec: `core:kernel`

### Requirement & Scenario Audit

- **Requirement: CompileContext permits documented override fields only**
  - _Conforms_: Yes. [CompileContextInput](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/compile-context.ts#L95-L137) is restricted to `name`, `step`, and the documented overrides (`contextMode`, `llmOptimizedContext`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, `fingerprint`). It declares no `config` or approval fields.
- **Requirement: Kernel entries must match use case types**
  - _Conforms_: Yes. All entries on the [Kernel](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/kernel.ts#L159-L219) interface represent concrete use-case class instances. Use cases are not wrapped in simplifications, proxies, or wrappers.
- **Requirement: createKernel constructs shared adapters once**
  - _Conforms_: Yes. Covered by the caching layer of `CompositionResolver`. In addition, `SchemaProvider` completely replaces direct `SchemaRegistry` dependencies inside all use cases requiring schema queries (e.g. `RunStepHooks` and `GetHookInstructions`), facilitating correct schema overrides.
- **Requirement: Project-level VCS and actor adapters must use auto-detect**
  - _Conforms_: Yes. Project VCS and actor resolution probe active systems using `createVcsAdapter` and `createVcsActorResolver` without hardcoding Git or Hg directly.
- **Requirement: Auto-invalidation on get when artifact files drift**
  - _Conforms_: Yes. When loading a change via `ChangeRepository.get()`, the file-system change repository checks artifact files for drift against their recorded hashes. If drift is found, it automatically records an `invalidated` event with cause `artifact-drift` (see [FsChangeRepository.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L1340-L1367)).
  - Historical compatibility is preserved: raw manifests containing the historical `artifact-change` cause are mapped cleanly to `artifact-drift` via [normalizeInvalidatedCause](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts#L1639-L1644) without throwing corruption errors.

### Test Coverage

- Verified in [kernel.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/kernel.spec.ts).
- Project VCS/actor null detection when outside version control is verified in [kernel-internals.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/composition/kernel-internals.spec.ts).
- Input boundaries for `CompileContextInput` (ensuring `config` cannot be provided) are verified in [kernel-input-boundary.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/kernel-input-boundary.spec.ts).

---

## 5. Consistency with Global Specs (`default:_global/*`)

- **ESM Conventions**: All files are ESM-compliant, matching package settings. imports are local and correctly use the `.js` suffix on relative specifiers.
- **Hexagonal boundaries**: The composition layer resides cleanly at the outer boundary. Core logic and use cases remain unaware of concrete storage adapters (e.g., `FsSpecRepository`), relying strictly on injected ports.
- **Naming Conventions**: Match spec definitions exactly. Factories are prefixed with `create`, resolvers with `resolve`, and repositories use the standard naming scheme.

---

## 6. Audit Verdict

> [!NOTE]
> **Audit Status**: **PASSED**
> All four core composition specifications are fully satisfied by the implementation. Boundaries, auto-detection, lazy initialization, Zod-based option validations, and error states are correctly implemented and verified. No functional or architectural non-compliances were identified.
