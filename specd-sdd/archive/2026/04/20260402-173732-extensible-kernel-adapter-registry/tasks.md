# Tasks: extensible-kernel-adapter-registry

## 1. Kernel registries and composition primitives

- [x] 1.1 Introduce registry types and conflict errors for additive composition
      `packages/core/src/composition/kernel-registries.ts`: `SpecStorageFactory`, `SchemaStorageFactory`, `ChangeStorageFactory`, `ArchiveStorageFactory`, `VcsProvider`, `ActorProvider`, `KernelRegistryView` — define the registry model and merged view the kernel will expose
      Approach: centralize the new composition interfaces and merge helpers in one module; model storages by capability, keep parser registry as a `ReadonlyMap`, index external hook runners by accepted type, and reject duplicate names/types with `RegistryConflictError`
      (Req: KernelOptions supports additive registries, Kernel exposes merged registries, Kernel rejects invalid registry references, Named storage factories, ArtifactParserRegistry is additively extensible)
- [x] 1.2 Extend kernel construction to merge registries and expose the final view
      `packages/core/src/composition/kernel.ts`: `Kernel`, `KernelOptions`, `createKernel()` — accept additive registrations, construct the merged registry set, and expose it on `kernel.registry`
      Approach: keep `createKernel(config, options)` as the primitive; merge built-ins plus externals before internals are built, preserve the no-options compatibility path, and surface the exact merged capability set rather than raw caller input
      (Req: KernelOptions supports additive registries, Kernel exposes merged registries, Kernel rejects invalid registry references)
- [x] 1.3 Drive internal wiring from adapter and parser registries instead of hardcoded selections
      `packages/core/src/composition/kernel-internals.ts`: `createKernelInternals()` — resolve storage factories, parser registry, VCS providers, actor providers, and external hook runners from the merged registries
      Approach: replace fixed `fs` and built-in-only selection with adapter-name lookup from resolved config bindings; fail immediately on unknown adapter or parser references and keep built-in `fs` factories as the base registrations
      (Req: Named storage factories, Named storage adapters, ArtifactParserRegistry is additively extensible, Kernel rejects invalid registry references)
- [x] 1.4 Make parser registry additive while preserving built-ins
      `packages/core/src/infrastructure/artifact-parser/registry.ts`: `createArtifactParserRegistry()` — return the built-in parser map in a form suitable for additive merge and unknown-format failures
      Approach: treat the current built-in registry as the immutable base and merge external format registrations by name without overwriting existing entries
      (Req: ArtifactParserRegistry is additively extensible, Kernel rejects invalid registry references)

## 2. Config bindings and storage selection

- [x] 2.1 Preserve named adapter bindings in resolved core config
      `packages/core/src/application/specd-config.ts`: `SpecdAdapterBinding`, `SpecdWorkspaceConfig`, `SpecdStorageConfig`, `SpecdConfig` — carry adapter name plus opaque config alongside the legacy resolved paths
      Approach: add additive binding fields such as `specsAdapter`, `schemasAdapter`, `changesAdapter`, `draftsAdapter`, `discardedAdapter`, and `archiveAdapter` while retaining current `*Path` fields for compatibility with untouched call sites
      (Req: Named storage adapters, Kernel rejects invalid registry references)
- [x] 2.2 Update filesystem config loading to resolve fs paths while preserving adapter-owned config
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader` — parse named adapters, resolve absolute paths only for `fs`, and keep opaque blocks for later kernel-time validation
      Approach: continue validating and absolutizing the built-in `fs` configuration in the loader, but defer “is this adapter registered?” checks to kernel construction because external registries are only known there
      (Req: Named storage adapters, Named storage factories)

## 3. Provider chains for VCS and actor resolution

- [x] 3.1 Add external-first provider dispatch to VCS detection
      `packages/core/src/composition/vcs-adapter.ts`: `createVcsAdapter()` — probe registered external providers before the built-in `git`, `hg`, and `svn` detection chain
      Approach: accept an optional providers list, run it in registration order, then fall back to the existing built-in sequence and finally `NullVcsAdapter` when nothing matches
      (Req: External providers run before built-in probes, KernelOptions supports additive registries)
- [x] 3.2 Add external-first provider dispatch to actor resolution without breaking lazy mode
      `packages/core/src/composition/actor-resolver.ts`: `createVcsActorResolver()` — apply the same provider chain model while preserving the existing overload behavior
      Approach: support an optional providers list; when `cwd` is present resolve eagerly through external then built-in probes, and when `cwd` is omitted preserve the current lazy resolver shape
      (Req: External providers run before built-in probes, KernelOptions supports additive registries)

## 4. External hook model and runtime dispatch

- [x] 4.1 Add the external hook runner port and runtime error types
      `packages/core/src/application/ports/external-hook-runner.ts`: `ExternalHookDefinition`, `ExternalHookRunner`; `packages/core/src/application/errors/external-hook-type-not-registered-error.ts`: `ExternalHookTypeNotRegisteredError`; `packages/core/src/application/errors/registry-conflict-error.ts`: `RegistryConflictError` — define the separate external-hook execution contract and its error surface
      Approach: keep `HookRunner` shell-only, require external runners to declare accepted types, return the existing `HookResult` shape, and use dedicated errors for unknown external types and ambiguous registry merges
      (Req: External hook runners declare accepted types, External hook runners execute explicit external hooks, Unknown external hook types are errors, Runner results are workflow-compatible, HookRunner is shell-only)
- [x] 4.2 Extend workflow hook parsing and schema normalization with explicit external entries
      `packages/core/src/domain/value-objects/workflow-step.ts`: `HookEntry`; `packages/core/src/infrastructure/schema-yaml-parser.ts`: `HookEntryZodSchema`; `packages/core/src/application/use-cases/resolve-schema.ts`: `normalizeHookEntry()`; `packages/core/src/domain/services/build-schema.ts`: workflow hook construction — support `external: { type, config }` in YAML and normalize it into the domain shape
      Approach: add a third `HookEntry` variant `{ type: 'external', externalType, config }`, parse the nested `external` object through the same mutually exclusive-key model as `run`/`instruction`, and keep semantic validation of shape in schema construction while deferring registry resolution to runtime
      (Req: Explicit external hook entries, External hooks are explicit workflow entries)
- [x] 4.3 Dispatch explicit external hooks through accepted-type runners with existing phase semantics
      `packages/core/src/application/use-cases/run-step-hooks.ts`: `RunStepHooks` — collect external hooks, resolve a registered runner by accepted type, and return workflow-compatible results
      Approach: keep shell `run` hooks on the internal `HookRunner`, continue ignoring `instruction` hooks here, dispatch `external` hooks through an accepted-type index, throw `ExternalHookTypeNotRegisteredError` when unmatched, and preserve pre fail-fast / post fail-soft behavior
      (Req: External hook dispatch, External hooks are explicit workflow entries, External hooks follow workflow phase semantics, Unknown external hook types are errors, Runner results are workflow-compatible, HookRunner is shell-only)

## 5. Builder surface, exports, and documentation

- [x] 5.1 Implement the fluent kernel builder as a thin wrapper over createKernel
      `packages/core/src/composition/kernel-builder.ts`: `KernelBuilder`, `createKernelBuilder()` — accumulate the same additive registrations supported by `KernelOptions` and build through the primitive kernel path
      Approach: store accumulated registrations plus optional base state, make every register method fluent, reject conflicts through the same merge rules used by `createKernel`, and delegate `build()` to `createKernel(config, accumulatedOptions)` instead of adding a second wiring path
      (Req: Builder accumulates additive kernel registrations, Builder supports fluent registration methods, Builder builds kernels with createKernel-equivalent semantics, Builder rejects conflicting registrations, Builder accepts base registration state, Composition layer exposes a kernel builder)
- [x] 5.2 Export the new composition surface and keep CLI wiring backward-compatible
      `packages/core/src/composition/index.ts`: public composition exports; `packages/core/src/index.ts`: root exports; `packages/cli/src/kernel.ts`: `createCliKernel()`; `packages/cli/src/commands/config/show.ts`: config serialization contract — publish the builder and registry types without changing CLI behavior, and keep CLI config output aligned with the resolved `SpecdConfig` shape
      Approach: export only the new public types and builder entry point, keep `createCliKernel()` passing just `extraNodeModulesPaths`, ensure the CLI still exercises the built-in-only path by default, and rely on direct `SpecdConfig` serialization for JSON output so adapter bindings surface automatically
      (Req: Composition layer exposes a kernel builder, Kernel exposes merged registries, Builder builds kernels with createKernel-equivalent semantics)
- [x] 5.3 Document registries, builder usage, config bindings, and external hook YAML
      `docs/core/ports.md`: kernel builder and `Kernel.registry`; `docs/config/config-reference.md`: adapter bindings and opaque config; `docs/guide/configuration.md`: extension configuration guidance; `docs/schemas/schema-format.md`: `external: { type, config }`; `docs/guide/workflow.md`: runtime semantics for external hooks
      Approach: update the public docs in lockstep with implementation so they describe the additive registry model, the builder API, the split between shell and external hooks, and the clear-error behavior for unknown names
      (Req: Composition layer exposes a kernel builder, Named storage adapters, Explicit external hook entries, External hooks follow workflow phase semantics, HookRunner is shell-only)
- [x] 5.4 Add JSDoc to every new public and internal symbol introduced by the change
      `packages/core/src/application/ports/external-hook-runner.ts`, `packages/core/src/application/errors/external-hook-type-not-registered-error.ts`, `packages/core/src/application/errors/registry-conflict-error.ts`, `packages/core/src/composition/kernel-registries.ts`, `packages/core/src/composition/kernel-builder.ts`: new symbols — document behavior, params, returns, and throws so the new extension surface follows repo-wide documentation conventions
      Approach: add full JSDoc on interfaces, functions, methods, and error classes as they are introduced, covering accepted-type dispatch, merge behavior, conflict failures, and builder semantics
      (Req: Builder supports fluent registration methods, External hook runners declare accepted types, Unknown external hook types are errors)

## 6. Automated tests and verification

- [x] 6.1 Add kernel and builder composition coverage for additive registries and conflicts
      `packages/core/test/composition/kernel.spec.ts`: new suite; `packages/core/test/composition/kernel-builder.spec.ts`: new suite; `packages/core/test/composition/kernel-internals.spec.ts`: extend — verify merged registries, invalid references, builder equivalence, base state, and duplicate registration rejection
      Approach: cover the full registry merge path end to end, including external parsers, storage factories, accepted-type hook runner indexing, and conflict handling at construction time
      (Req: KernelOptions supports additive registries, Kernel exposes merged registries, Kernel rejects invalid registry references, Builder accumulates additive kernel registrations, Builder supports fluent registration methods, Builder builds kernels with createKernel-equivalent semantics, Builder rejects conflicting registrations, Builder accepts base registration state, Composition layer exposes a kernel builder, ArtifactParserRegistry is additively extensible, Named storage factories)
- [x] 6.2 Extend provider, config, and hook tests for the new runtime behavior
      `packages/core/test/composition/vcs-adapter.spec.ts`: extend; `packages/core/test/composition/actor-resolver.spec.ts`: extend; `packages/core/test/application/use-cases/run-step-hooks.spec.ts`: extend; `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`: extend; `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`: extend; `packages/core/test/domain/services/build-schema.spec.ts`: extend; `packages/core/test/infrastructure/fs/config-loader.spec.ts`: extend; `packages/core/test/infrastructure/artifact-parser/registry.spec.ts`: new — verify provider order, explicit external hooks, schema parsing, config pass-through, and parser extension behavior
      Approach: add focused scenarios for external providers before built-ins, nested `external: { type, config }` parsing, accepted-type dispatch, unknown external type failures, shell-only `HookRunner`, deferred adapter validation, and unknown parser-format errors
      (Req: External providers run before built-in probes, External hook runners declare accepted types, External hook runners execute explicit external hooks, Unknown external hook types are errors, Runner results are workflow-compatible, Explicit external hook entries, External hooks are explicit workflow entries, External hooks follow workflow phase semantics, External hook dispatch, HookRunner is shell-only, Named storage adapters, ArtifactParserRegistry is additively extensible)
- [x] 6.3 Run repo-facing verification and smoke the public extension path
      `packages/core`: test, lint, and smoke verification — prove the public API behaves as designed after implementation
      Approach: run `pnpm --filter @specd/core test` and `pnpm --filter @specd/core lint`, then execute a smoke scenario that builds a kernel with fake parser/VCS/actor/external-hook extensions and a workflow using `external: { type, config }` to confirm `kernel.registry`, builder equivalence, `GetHookInstructions` stability, and clear failure on unknown external types
      (Req: Kernel exposes merged registries, Builder builds kernels with createKernel-equivalent semantics, External hooks follow workflow phase semantics, Unknown external hook types are errors, Runner results are workflow-compatible)
