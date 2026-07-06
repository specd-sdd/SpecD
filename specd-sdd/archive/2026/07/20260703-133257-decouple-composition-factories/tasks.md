# Tasks: decouple-composition-factories

## 1. Shared composition core

- [x] 1.1 Add the session-scoped composition resolver
      `packages/core/src/composition/composition-resolver.ts`: `CompositionResolver`, `createCompositionResolver` — create the lazy shared dependency resolver used by standalone factories, kernel assembly, and builder assembly.
      Approach: expose normalized getter methods only, cache resolved primitives per resolver instance, and keep per-use-case deps outside the resolver.
      (Req: Resolver is scoped to one composition session)

- [x] 1.2 Add shared factory-argument normalization
      `packages/core/src/composition/normalize-factory-args.ts`: `normalizeCompositionFactoryArgs` — centralize the `deps` vs `config/options` split for every public factory.
      Approach: return a discriminated union (`deps` or `config`) and reject `deps + options` through one shared decision point.
      (Req: Use-case factories accept SpecdConfig or explicit options)

- [x] 1.3 Add the shared invalid-arguments error
      `packages/core/src/domain/errors/invalid-composition-factory-arguments-error.ts`: `InvalidCompositionFactoryArgumentsError` — provide one typed `SpecdError` for invalid public factory invocation shapes.
      Approach: accept the target use-case/factory name in the constructor so diagnostics identify the exact `createX(...)` entry.
      (Req: Shared factory-argument validation error)

- [x] 1.4 Extract composition-generic registry primitives out of kernel-owned naming
      `packages/core/src/composition/{kernel-internals,kernel-registries}.ts` or successor files: shared registry/view primitives — move the reusable merged-capability model under composition-owned abstractions reused by resolver, kernel, and builder.
      Approach: preserve capability semantics while removing kernel as the conceptual source of truth for generic registry infrastructure.
      (Req: Reusable registry primitives are composition-owned)

## 2. Per-use-case factory refactor

- [x] 2.1 Add colocated `resolveXDeps(resolver)` helpers for change lifecycle factories
      `packages/core/src/composition/use-cases/{create-change,get-status,transition-change,draft-change,restore-change,discard-change,archive-change}.ts`: `resolveXDeps` helpers — translate resolver primitives into concrete application deps.
      Approach: colocate one helper per factory and keep all adapter/path knowledge behind resolver getters and shared wiring utilities.
      (Req: Shared composition resolver normalizes config-based factory bootstrap)

- [x] 2.2 Refactor lifecycle factories to canonical deps plus config bootstrap
      `packages/core/src/composition/use-cases/{create-change,get-status,transition-change,draft-change,restore-change,discard-change,archive-change}.ts`: `createX(...)` — replace fs-shaped public signatures with `createX(deps)` plus `createX(config, options?)`.
      Approach: call `normalizeCompositionFactoryArgs`, then either instantiate directly from deps or create resolver → `resolveXDeps` → canonical `createX(deps)`.
      (Req: Use-case factories accept SpecdConfig or explicit options)

- [x] 2.3 Refactor remaining kernel-mounted factories to the same public contract
      `packages/core/src/composition/use-cases/*.ts`: public `createX(...)` entries for validate/list/get/spec/project helpers — normalize every kernel-mounted factory, not only the original fs-heavy samples.
      Approach: apply the same two-form contract consistently and delete public `Fs*Options`-style bootstrap signatures as they are replaced.
      (Req: Use-case factories accept SpecdConfig or explicit options)

- [x] 2.4 Refactor implementation-tracking composition factories
      `packages/core/src/composition/use-cases/{update-implementation-tracking,get-implementation-review}.ts`: `createUpdateImplementationTracking`, `createGetImplementationReview` — adopt the normalized public contract and shared resolver path.
      Approach: resolve `ChangeRepository`, `FileReader`, and project-root-backed collaborators through the resolver, then delegate to canonical deps construction.
      (Req: Public config-based factories delegate through the resolver)

## 3. Kernel and builder alignment

- [x] 3.1 Rewire kernel assembly through resolver-backed factory helpers
      `packages/core/src/composition/kernel.ts`: `createKernel` — stop maintaining separate per-use-case wiring semantics and assemble kernel entries through the same factory/deps helpers as standalone composition.
      Approach: create one resolver per kernel build, reuse shared instances from it, and group the resulting use cases without changing kernel shape.
      (Req: createKernel constructs shared adapters once)

- [x] 3.2 Align builder with kernel resolver semantics
      `packages/core/src/composition/kernel-builder.ts` and related internals: builder pipeline — keep builder as full-kernel additive bootstrap over the same composition options model.
      Approach: accumulate `CompositionResolutionOptions`, defer to kernel construction, and do not introduce per-use-case builder composition paths.
      (Req: Builder reuses the shared composition-resolver path)

- [x] 3.2b Remove graph-store selection from core builder and options
      `packages/core/src/composition/{kernel-builder.ts,kernel.ts,composition-resolver.ts,composition-registries.ts}` and related exports/tests: remove `graphStoreId`, `graphStoreFactories`, `registerGraphStore(...)`, and `useGraphStore(...)` from the core-owned composition contract.
      Approach: keep only core-owned additive registrations in `CompositionResolutionOptions`/`KernelOptions`, and leave graph-store backend composition to `@specd/code-graph` and higher-level SDK bootstrap.
      (Req: Core composition options remain package-owned and exclude code-graph graph-store selection)

- [x] 3.3 Make kernel and builder consume the extracted composition-owned registry layer
      `packages/core/src/composition/{kernel.ts,kernel-builder.ts,composition-resolver.ts}` plus shared registry files — remove residual dependency on kernel-owned registry/internals names from the shared composition path.
      Approach: keep kernel as facade/orchestrator while ensuring resolver, kernel, and builder all reuse the same composition-owned registry primitives.
      (Req: Kernel is a facade over composition-owned registry primitives; Builder shares composition-owned registry primitives)

- [x] 3.4 Preserve public exports and fix any missing factory re-exports
      `packages/core/src/public.ts`, `packages/core/src/composition/index.ts`, `packages/core/src/composition/use-cases/index.ts`: export surface — keep all normalized factories publicly reachable, including `createGetDraft`, `createGetDiscarded`, and implementation-tracking factories.
      Approach: update overload typings without renaming public factory ids and ensure barrel exports match the real composition surface.
      (Req: Canonical public factories remain dependency-based)

- [x] 3.4b Remove graph-store extension types from `@specd/core`
      `packages/core/src/{extensions.ts,composition/index.ts}` and related public API checks: stop exporting `GraphStoreFactory` or any graph-store-specific extension hook from the core package.
      Approach: keep `./extensions` limited to core-owned registry types plus `createKernelBuilder`, and verify no public surface still suggests that core owns code-graph backend composition.
      (Req: Core composition options remain package-owned and exclude code-graph graph-store selection)

## 4. Shared wiring and compatibility

- [x] 4.1 Move fs path resolution behind resolver-backed shared helpers
      `packages/core/src/composition/shared-repository-wiring.ts` and adjacent composition helpers — consolidate repository/path/materialization logic behind resolver internals.
      Approach: keep low-level adapter factories intact but make public factories consume only normalized resolver getters, not raw path bundles.
      (Req: Resolver exposes normalized shared dependencies)

- [x] 4.2 Keep adapter selection config-driven while allowing additive registrations
      `packages/core/src/composition/composition-resolver.ts` and kernel/builder option plumbing — merge built-ins with external registrations without silently overriding configured adapter selections.
      Approach: registrations extend availability; config and explicit option fields still select the active backend.
      (Req: Resolver is lazy and cacheable)

## 5. Tests

- [x] 5.1 Add resolver-focused composition tests
      `packages/core/test/composition/composition-resolver.spec.ts`: new suite — verify session scoping, lazy construction, and cache reuse within one composition session.
      Approach: instrument shared factories/adapters so the test can prove only requested dependencies are instantiated.
      (Req: Resolver is lazy and cacheable)

- [x] 5.2 Update representative standalone factory tests
      `packages/core/test/composition/use-cases/{get-status,list-changes,list-drafts,list-discarded,get-project-summary}.spec.ts`: factory suites — assert both public call shapes and shared invalid-arguments behavior.
      Approach: instantiate the same use case once via deps and once via config bootstrap, then assert equivalent collaborator wiring.
      (Req: Use-case factories accept SpecdConfig or explicit options)

- [x] 5.3 Add tests for implementation-tracking factories
      `packages/core/test/composition/use-cases/{update-implementation-tracking,get-implementation-review}.spec.ts`: new or expanded suites — cover normalized public contracts and shared resolver assembly.
      Approach: build resolver-backed collaborators with temp config and assert canonical deps form stays adapter-agnostic.
      (Req: Input contract)

- [x] 5.4 Update kernel and builder tests
      `packages/core/test/composition/kernel.spec.ts` and builder-specific tests — assert kernel and builder reuse the same resolver-backed assembly semantics and preserve grouped kernel shape.
      Approach: compare standalone factory assembly with kernel-built instances under the same config/options and verify no separate fs branch remains.
      (Req: Kernel and builder do not define separate per-use-case semantics)

- [x] 5.4b Replace core graph-store builder tests with boundary tests
      `packages/core/test/composition/{kernel-builder,composition-registries}.spec.ts` and any public-surface checks: remove expectations around `registerGraphStore(...)`, `useGraphStore(...)`, or merged `graphStores` from core and replace them with assertions that those concerns are absent from the core contract.
      Approach: verify builder fluency and registry reuse still work for core-owned categories only, while graph-store composition is no longer part of core behavior.
      (Req: Core composition options remain package-owned and exclude code-graph graph-store selection)

- [x] 5.6 Add regression coverage for composition-owned registry primitives
      `packages/core/test/composition/{composition-resolver,kernel,kernel-builder}.spec.ts`: shared composition tests — verify resolver, kernel, and builder all consume the same composition-owned registry layer and no kernel-specific registry source of truth remains.
      Approach: assert shared capability merging flows through one reusable primitive set and that renaming/extraction does not change runtime semantics.
      (Req: Reusable registry primitives are composition-owned; Kernel is a facade over composition-owned registry primitives; Builder shares composition-owned registry primitives)

- [x] 5.5 Add regression tests for verification-discovered contract drift
      `packages/core/test/application/use-cases/{compile-context,get-project-context}.spec.ts` and `packages/sdk/test/orchestration/build-project-status-snapshot.spec.ts`: regression coverage — lock the three corrected behavior contracts to their specs.
      Approach: assert `stepAvailable` remains false when `isPermitted` is false, assert fresh optimized project context is bypassed when `llmOptimizedContext` is false, and assert hotspot loading failure clears both `graphHealth` and `hotspots`.
      (Req: Step availability, Project context optimization and invalidation, buildProjectStatusSnapshot orchestration)

## 6. Documentation and verification

- [x] 6.1 Update composition documentation
      `docs/` composition-facing references and ADR-linked material — explain canonical `createX(deps)`, convenience `createX(config, options?)`, `CompositionResolver`, and the kernel/builder role split.
      Approach: document the final public contract, not transitional implementation notes, and remove or revise outdated fs-shaped examples.
      (Req: Public composition-surface documentation stays aligned)

- [x] 6.1b Update docs for package ownership boundaries
      `docs/` composition and extension guidance — document explicitly that core no longer exposes graph-store selection/registration and that graph-store backend composition belongs to `@specd/code-graph` or `@specd/sdk`.
      Approach: revise examples so extension authors know where to register storage factories versus where to configure graph providers.
      (Req: Public composition-surface documentation stays aligned)

- [x] 6.5 Refresh docs after the composition-owned registry extraction
      `docs/` and any ADR/examples that mention kernel registries as reusable base infrastructure — align naming and architectural ownership with the final facade model.
      Approach: document the shared registry layer as composition infrastructure and kernel as consumer/facade only.
      (Req: Public composition-surface documentation stays aligned)

- [x] 6.2 Run automated verification
      `packages/core`, `packages/cli`: test/lint/typecheck commands — confirm the refactor preserves public API compatibility and composition behavior.
      Approach: run core tests first, then targeted CLI coverage for `change-implementation`, and fix any export/signature regressions before proceeding.
      (Req: Review subcommand)

- [x] 6.3 Perform manual bootstrap checks
      local composition smoke verification — instantiate a standalone factory, a direct kernel, and a builder-backed kernel from config.
      Approach: confirm all three paths succeed without public fs path bundles and that config still drives adapter selection while additive registrations extend availability.
      (Req: Config-based public factory delegates through shared resolver path)

- [x] 6.4 Implement and verify post-review contract drift fixes
      `packages/core/src/application/use-cases/{compile-context,get-project-context}.ts`, `packages/sdk/src/orchestration/build-project-status-snapshot.ts`, and targeted verification commands — bring runtime behavior back in line with the updated specs before returning to `ready`.
      Approach: keep the fixes local, rerun targeted tests plus `specd` verification for the touched specs, and confirm no public composition contract regresses.
      (Req: Step availability, Project context optimization and invalidation, buildProjectStatusSnapshot orchestration)
