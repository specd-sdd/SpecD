# Proposal: decouple-composition-factories

## Motivation

The public composition surface in `@specd/core` no longer matches the direction implied by kernel registries and future adapter plugins. Composition factories still expose filesystem-shaped contracts and hardcoded `'fs'` wiring, which makes adapter extensibility uneven and leaves the kernel and standalone factories with overlapping composition responsibilities.

Verification of the refactor also surfaced adjacent contract drift in orchestration paths that now depend on the same composition semantics. Archiving this change without correcting those mismatches would leave merged specs asserting behavior the implementation still does not provide.

## Current behaviour

Today, many standalone `createX(...)` factories under `packages/core/src/composition/use-cases/` support an explicit `(context, Fs*Options)` form that passes paths such as `changesPath`, `draftsPath`, `discardedPath`, and `specsPath`, then constructs repositories through calls like `createChangeRepository('fs', ...)` and `createSpecRepository('fs', ...)`.

At the same time, `createKernel(...)` and the current `kernel-*` registry helpers already use a richer registry-based bootstrap model with built-in storage factories and additive registrations. This leaves the API split in two:

- kernel construction resolves adapters through merged registries and shared internals
- standalone composition factories repeat fs-specific bootstrap logic independently

As a result, future non-default adapters can fit into the kernel path but not naturally into the public per-use-case composition path.

That investigation also exposed a semantic leak in the new shared resolver path: `CompositionResolver` currently reuses primitives still named and framed as `kernel-*` registries/internals. The runtime dependency direction is already correct, but the reusable source of truth still sounds kernel-owned instead of composition-owned.

Three concrete implementation/spec mismatches were confirmed during verification:

- `sdk:build-project-status-snapshot` preserves `graphHealth` when hotspot loading fails, although the merged SDK spec requires degrading the whole graph payload to `null`
- `core:compile-context` computes top-level `stepAvailable` from `isReady` only, although the merged spec defines availability as `isReady && isPermitted`
- `core:get-project-context` reuses cached optimized project context whenever it is fresh, even when `llmOptimizedContext` is disabled

The review also exposed a boundary error in the new extensibility model: `@specd/core` currently carries `graphStoreId`, `graphStoreFactories`, and builder methods such as `useGraphStore(...)`, even though graph-store composition is actually owned by `packages/code-graph/src/composition/create-code-graph-provider.ts` and not consumed by the core kernel itself. That leaves core with a code-graph-specific contract it should not own and creates the appearance of a cross-package override path that does not really drive SDK graph-provider bootstrap.

## Proposed solution

Refactor the public composition model so every kernel-mounted use case converges on the same contract shape:

- canonical factory form: `createX(deps)`
- convenience factory form: `createX(config, options?)`

The canonical `deps` form will accept already-resolved ports, services, and collaborator use cases only. It will not expose filesystem paths, concrete adapters, or adapter ids. A shared composition resolver will bootstrap those dependencies from `SpecdConfig` plus additive registrations for reuse by standalone factories. Any shared utility that resolves ports and collaborators from `config` must be reused by both `createX(config, options?)` and `createKernel(config, options?)`.

The reusable registry primitives under that resolver path must also become composition-generic. The source-of-truth layer below both `CompositionResolver` and `createKernel(...)` should no longer be presented as `kernel-internals` or `kernel-registries`, because that keeps the kernel looking like the owner of composition semantics.

That shared bootstrap must be treated as an explicit helper contract in the composition layer. It MUST NOT eagerly instantiate the full kernel dependency graph just to satisfy `createX(config, options?)`. Instead, it provides a shared resolution context with lazy, cacheable access to normalized dependencies.

Proposed helper contract at proposal level:

```ts
type CompositionResolutionOptions = {
  // additive registrations and composition-time overrides used by kernel
  // and by standalone createX(config, options?) calls
}

type CompositionResolver = {
  readonly config: SpecdConfig
  readonly options: CompositionResolutionOptions

  // low-level normalized dependency access
  getChangeRepository(): ChangeRepository
  getSpecRepositories(): ReadonlyMap<string, SpecRepository>
  getSchemaRegistry(): SchemaRegistry
  getSchemaProvider(): SchemaProvider
  getActorResolver(): ActorResolver
  getVcsAdapter(): VcsAdapter
  getHookRunner(): HookRunner
  getRunStepHooks(): RunStepHooks
}

declare function createCompositionResolver(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CompositionResolver
```

Architectural intent of this contract:

- `createCompositionResolver(...)` creates a shared resolution context, not a fully materialized kernel bundle
- each getter resolves only what is needed for the requested factory path
- shared dependencies MAY be cached within one resolver instance so repeated access reuses the same normalized ports/services
- the helper hides adapter-id dispatch, default adapter selection, registry lookup, and config-to-port wiring behind one shared mechanism
- standalone factories MUST consume this helper instead of rebuilding bespoke fs-shaped wiring branches
- the helper does not know individual use-case dependency objects; per-use-case `resolveXDeps(resolver)` helpers compose those dependency objects near each `createX(...)` factory

Under this model, the generic registry and registry-view contracts are composition infrastructure. They may be reused by the kernel, the resolver, and the builder, but they are not kernel-owned concepts.

That shared infrastructure must still remain package-local in scope. Core composition options and builder registrations should cover only core-owned concerns such as storage factories, parsers, VCS providers, actor providers, and external hook runners. Code-graph-specific backend selection, including graph-store registration and active backend choice, remains owned by `@specd/code-graph` and by any higher-level SDK host bootstrap that passes options into that package.

`createKernel(...)` will become a convenience layer that instantiates and groups the same `createX(...)` factories rather than maintaining separate wiring semantics. `createKernelBuilder()` will remain the fluent entry point for full-kernel construction, but its role will be narrowed to building additive composition options and registrations for the same shared resolver. It will not define a separate composition path for individual use cases.

In the same change, align the implementation with the already-existing specs that govern composition-adjacent orchestration:

- degrade SDK project-status graph payload consistently when any graph-loading stage fails
- compute `CompileContext.stepAvailable` from the full lifecycle-engine availability verdict
- gate optimized project-context reuse behind `llmOptimizedContext`

## Scope boundaries

This refactor changes the public composition contracts and the bootstrap/orchestration model around them. It does not change the domain behavior of the underlying use cases.

In scope:

- every kernel-mounted public `createX(...)` composition factory, not only the currently obvious fs-shaped ones
- the shared config-to-dependencies bootstrap/resolver helper that returns normalized resolved ports/deps for reuse by standalone `createX(config, options?)` and `createKernel(config, options?)`
- kernel assembly so grouped kernel entries are instantiated from the reusable `createX(...)` composition units
- `createKernelBuilder()` as the full-kernel additive registration surface over the same resolver and assembly semantics
- removing code-graph-specific graph-store registration and selection from `@specd/core` composition contracts, builder APIs, and extension exports so ownership returns to `@specd/code-graph` / `@specd/sdk`

Out of scope:

- changing application-layer use case constructor contracts away from their current port-based dependency model
- removing low-level repository factory APIs such as `createChangeRepository('fs', ...)`; those remain the lower-level adapter-facing escape hatch and are separate from the normalized use-case composition contract
- introducing a second builder or resolver API for individual use cases
- redesigning `@specd/code-graph` graph-store composition semantics beyond preserving it as the owning package for that concern

Source-of-truth rule for this change:

- reusable `createX(...)` composition logic is the primary source of truth for kernel-mounted use-case construction
- `createKernel(...)` is a convenience orchestration layer that reuses that logic
- the shared bootstrap helper that resolves deps from config is shared infrastructure used by both standalone factories and kernel construction, and its output is the normalized resolved-ports bundle consumed by canonical factory assembly
- the generic registry primitives below that helper are composition-owned shared infrastructure; the kernel consumes them but does not define them
- that helper is the single shared config-to-deps mechanism; individual factories must not reintroduce bespoke fs-shaped resolution branches beside it
- `createKernelBuilder()` is a convenience for producing a full kernel with additive registrations; it does not own separate per-use-case composition semantics
- composition-owned does not mean cross-package-owned: core only defines registry and selection semantics for concerns that belong to core itself, not for code-graph backend selection

Consumption model:

- `createX(deps)` receives a specific `XDeps` object and instantiates only that use case
- `createX(config, options?)` creates a `CompositionResolver`, calls `resolveXDeps(resolver)`, then delegates to canonical `createX(deps)`
- `createKernel(config, options?)` creates one `CompositionResolver`, calls the needed per-use-case `resolveXDeps(resolver)` helpers, and groups the resulting use cases
- `createKernel(config, options?)` remains a thin facade over resolver creation plus grouped assembly; it does not own a separate registry model under the hood
- `createKernelBuilder()` accumulates `CompositionResolutionOptions` inputs and ultimately builds a kernel through that same resolver path
- `createX(...)` does not add a third public `resolver` signature; the resolver stays in the composition layer as reusable assembly infrastructure

Factory-wrapper rule:

- the canonical public contract remains `createX(deps)`
- the convenience public contract remains `createX(config, options?)`
- the convenience form MUST internally perform: `createCompositionResolver(config, options?)` -> `resolveXDeps(resolver)` -> `createX(deps)`
- per-use-case `resolveXDeps(resolver)` helpers live with or near their corresponding factory code so dependency assembly stays local to the use case instead of centralizing all use-case knowledge inside the resolver
- `options` is only valid for the `config` form; `createX(deps)` MUST NOT accept composition options because deps are already resolved

Argument-normalization rule:

- composition factories SHOULD share one small entry helper that normalizes the two public call shapes before delegating to use-case-specific assembly
- that helper receives the common factory inputs (`deps` or `config`, plus optional `options`) and decides whether the caller is using the canonical deps path or the config-resolution path
- when the caller passes an invalid combination, especially `deps + options`, the helper MUST throw a shared typed `SpecdError` for invalid composition factory arguments instead of leaving each factory to invent its own validation behavior
- this helper is only responsible for argument normalization and shared error handling; it does not know per-use-case dependency assembly

Shared composition-factory error rule:

- if a suitable typed error does not already exist, this refactor SHOULD introduce `InvalidCompositionFactoryArgumentsError` as the dedicated `SpecdError` subtype for invalid composition-factory arguments
- that error contract MUST carry at least the target factory or use-case name so callers receive messages that identify which `createX(...)` entry was invoked incorrectly
- the shared argument-normalization helper SHOULD be the only place that throws this error for public factory signature misuse, so diagnostics stay consistent across all composition factories

## Specs affected

### New specs

- `core:composition-resolver`: define the shared composition resolver contract that turns `SpecdConfig` plus additive composition options into lazy, normalized dependency resolution for kernel-mounted factories, including its role, scope, visibility, caching expectations, and resolver methods.
  The spec also clarifies that the resolver sits on top of composition-generic registry primitives rather than kernel-owned registry abstractions.
  - Depends on (added): none
  - Depends on (removed): none

- `core:update-implementation-tracking`: define the application-level mutation contract for tracked implementation files and confirmed implementation links, and capture that its public composition entry now participates in the normalized `createX(deps)` plus `createX(config, options?)` model over the shared composition-resolver path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-implementation-review`: define the application-level read contract for implementation-tracking review and capture that its public composition entry now participates in the normalized `createX(deps)` plus `createX(config, options?)` model over the shared composition-resolver path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

### Modified specs

- `sdk:build-project-status-snapshot`: clarify and enforce that any graph-loading failure, including hotspot loading, degrades the graph snapshot to `graphHealth: null`.
  - Depends on (added): none
  - Depends on (removed): none

- `default:_global/architecture`: clarify that composition factories for kernel-mounted use cases expose canonical dependency-based construction, with config-based bootstrap as convenience over a shared resolver.
  - Depends on (added): none
  - Depends on (removed): none

- `default:_global/docs`: update the documentation obligations for the public composition surface so `docs/` explains the normalized `createX(deps)` plus `createX(config, options?)` contract, the role split between `createX`, `createKernel`, and `createKernelBuilder`, and the shared `CompositionResolver` path used for config-based bootstrap.
  - Depends on (added): `core:composition`, `core:kernel`, `core:kernel-builder`, `core:composition-resolver`
  - Depends on (removed): none

- `core:composition`: replace the current `(context, Fs*Options)` public explicit-factory contract with a normalized `createX(deps)` plus `createX(config, options?)` model, consume the dedicated composition-resolver contract, and state that standalone factories are the reusable composition unit consumed by kernel construction.
  It must also state that the reusable registry/view layer belongs to composition infrastructure, not to the kernel facade, and that core composition options/extension surfaces exclude code-graph-specific graph-store selection.
  - Depends on (added): `core:kernel-builder`, `core:composition-resolver`
  - Depends on (removed): none

- `core:kernel`: redefine kernel construction as convenience orchestration that instantiates and groups reusable `createX(...)` factories rather than acting as a parallel composition source, and formalize grouped assembly over the shared composition-resolver contract.
  It must explicitly stop being the naming or conceptual owner of the shared registry primitives reused by the resolver and builder, and it must stop exposing code-graph-specific graph-store options or merged registries.
  - Depends on (added): `core:kernel-builder`, `core:composition-resolver`
  - Depends on (removed): none

- `core:kernel-builder`: tighten the builder contract so it remains a full-kernel pre-construction registration surface over the same resolver/kernel semantics, not an alternate per-use-case composition model.
  It must reuse the same composition-generic registry primitives as the resolver and kernel facade, but only for core-owned concerns. Graph-store registration and selection are removed from the core builder surface.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:create-change`: clarify that the public composition entry for `CreateChange` must participate in the normalized `createX(deps)` plus `createX(config, options?)` model rather than exposing fs-specific explicit wiring contracts.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-status`: clarify that the public composition entry for `GetStatus` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:transition-change`: clarify that the public composition entry for `TransitionChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:draft-change`: clarify that the public composition entry for `DraftChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:restore-change`: clarify that the public composition entry for `RestoreChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:discard-change`: clarify that the public composition entry for `DiscardChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:archive-change`: clarify that the public composition entry for `ArchiveChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:validate-artifacts`: clarify that the public composition entry for `ValidateArtifacts` must participate in the normalized `createX(deps)` plus `createX(config, options?)` model and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:compile-context`: clarify that the public composition entry for `CompileContext` must participate in the normalized composition contract and shared config bootstrap path, and that top-level step availability reflects the full lifecycle-engine availability verdict rather than readiness alone.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:list-changes`: clarify that the public composition entry for `ListChanges` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:list-drafts`: clarify that the public composition entry for `ListDrafts` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:list-discarded`: clarify that the public composition entry for `ListDiscarded` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:edit-change`: clarify that the public composition entry for `EditChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:skip-artifact`: clarify that the public composition entry for `SkipArtifact` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:update-spec-deps`: clarify that the public composition entry for `UpdateSpecDeps` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:list-archived`: clarify that the public composition entry for `ListArchived` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-archived-change`: clarify that the public composition entry for `GetArchivedChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:run-step-hooks`: clarify that the public composition entry for `RunStepHooks` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-hook-instructions`: clarify that the public composition entry for `GetHookInstructions` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-artifact-instruction`: clarify that the public composition entry for `GetArtifactInstruction` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:approve-spec`: clarify that the public composition entry for `ApproveSpec` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:approve-signoff`: clarify that the public composition entry for `ApproveSignoff` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:list-specs`: clarify that the public composition entry for `ListSpecs` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-spec`: clarify that the public composition entry for `GetSpec` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:save-spec-metadata`: clarify that the public composition entry for `SaveSpecMetadata` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:invalidate-spec-metadata`: clarify that the public composition entry for `InvalidateSpecMetadata` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-active-schema`: clarify that the public composition entry for `GetActiveSchema` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:validate-specs`: clarify that the public composition entry for `ValidateSpecs` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:generate-metadata`: clarify that the public composition entry for `GenerateSpecMetadata` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-spec-context`: clarify that the public composition entry for `GetSpecContext` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:list-workspaces`: clarify that the public composition entry for `ListWorkspaces` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-project-context`: clarify that the public composition entry for `GetProjectContext` must participate in the normalized composition contract and shared config bootstrap path, and that optimized project context is only reused when `llmOptimizedContext` is enabled.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-config`: clarify that the public composition entry for `GetConfig` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:project-metadata`: clarify that the public composition entry for `GetProjectMetadata` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:update-project-metadata`: clarify that the public composition entry for `UpdateProjectMetadata` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:resolve-schema`: clarify that the public composition entry for `ResolveSchema` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:spec-overlap`: clarify that the public composition entry for `DetectOverlap` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-draft`: clarify that the public composition entry for `GetDraft` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-discarded`: clarify that the public composition entry for `GetDiscarded` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:invalidate-change`: clarify that the public composition entry for `InvalidateChange` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:search-specs`: clarify that the public composition entry for `SearchSpecs` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:preview-spec`: clarify that the public composition entry for `PreviewSpec` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:validate-schema`: clarify that the public composition entry for `ValidateSchema` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-spec-outline`: clarify that the public composition entry for `GetSpecOutline` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:update-implementation-tracking`: clarify that the public composition entry for `UpdateImplementationTracking` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:refresh-implementation-tracking`: clarify that the public composition entry for `RefreshImplementationTracking` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-implementation-review`: clarify that the public composition entry for `GetImplementationReview` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:update-spec-metadata`: clarify that the public composition entry for `UpdateSpecMetadata` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `core:get-project-summary`: clarify that the public composition entry for `GetProjectSummary` must participate in the normalized composition contract and shared config bootstrap path.
  - Depends on (added): `core:composition-resolver`
  - Depends on (removed): none

- `cli:change-implementation`: clarify that the CLI implementation-review surface depends explicitly on the dedicated core implementation-tracking read and mutation capabilities while remaining downstream from the shared composition refactor.
  - Depends on (added): `core:update-implementation-tracking`, `core:get-implementation-review`, `core:refresh-implementation-tracking`
  - Depends on (removed): none

## Impact

Affected code areas include:

- `packages/core/src/composition/use-cases/` for all kernel-mounted public `createX(...)` factories whose composition contracts currently diverge from the target model. This scope includes both the initially investigated lifecycle factories (`create-change`, `get-status`, `transition-change`, `draft-change`, `restore-change`, `discard-change`, `archive-change`) and the rest of the kernel-mounted composition surface (`validate-artifacts`, `compile-context`, list/get/update/archive helpers, hook helpers, approvals, draft/discarded readers, schema/spec/project queries, implementation-tracking helpers, preview/outline helpers, validation helpers, and overlap detection) so the refactor is applied consistently rather than partially.
- `packages/core/src/composition/kernel.ts` and `kernel-internals.ts`
- `packages/core/src/application/use-cases/compile-context.ts`
- `packages/core/src/application/use-cases/get-project-context.ts`
- `packages/sdk/src/orchestration/build-project-status-snapshot.ts`
- a shared composition resolver/helper in `packages/core/src/composition/` that provides lazy normalized dependency resolution from config plus additive registrations
- shared registry/bootstrap code in `packages/core/src/composition/`
- public export surfaces in `packages/core/src/public.ts`, `packages/core/src/composition/index.ts`, and related typing barrels
- composition and kernel tests, plus application/SDK tests for graph degradation, project-context optimization gating, and lifecycle availability projection
- documentation under `docs/` and any ADR/reference material that currently describes the old fs-shaped composition contracts or the previous relationship between standalone factories and kernel construction

The change is API-shaping but not intended to alter domain behaviour of the underlying use cases. Its impact is concentrated in composition contracts, adapter extensibility, and bootstrap consistency.

## Technical context

The investigation established that the problem is not in `application/use-cases`, which already depend on ports such as `ChangeRepository` and `ActorResolver`. The coupling lives in the public composition layer.

Concrete observations from code exploration:

- `packages/core/src/composition/use-cases/draft-change.ts`, `restore-change.ts`, `discard-change.ts`, and `create-change.ts` expose `Fs*Options` and hardcode repository factory calls with `'fs'`.
- `packages/core/src/composition/kernel-internals.ts` already registers built-in `FS_*_STORAGE_FACTORY` instances and resolves shared dependencies through merged registries.
- `packages/core/src/composition/kernel.ts` already behaves like a richer bootstrap path than standalone composition factories.
- Because the goal is a consistent public composition contract, any kernel-mounted composition factory that still follows the old explicit fs-oriented shape must be treated as in-scope implementation work for this change, even if only a subset was used as the initial investigative sample.

Architectural direction agreed during exploration:

- `createX(deps)` should be the canonical contract
- `createX(config, options?)` should be sugar over shared resolution plus canonical construction
- kernel should be a convenience layer that reuses `createX(...)`
- any shared config-to-dependencies bootstrap utility must be reused by both standalone factories and kernel construction
- that bootstrap should be modeled as an explicit helper that returns a normalized resolved dependency/ports bundle rather than raw fs-oriented option fragments
- builder should stay tied to full-kernel construction only
- config should continue to select adapters, while builder/options register additional available capabilities

Additional verification outcome now folded into scope:

- `createGetStatus(config)` and `createValidateSpecs(config)` were rechecked against the resolver path and do preserve `schemaPlugins` and `schemaOverrides` through `CompositionResolver`; they are not part of the bug set and do not require extra scope.
- The SDK mismatch is a modified-spec case, not a new-spec case: `sdk:build-project-status-snapshot` already exists and simply needs to be added to the change scope.

This proposal intentionally avoids implementation details such as exact type names or final file layout for the shared resolver; those belong in `design.md`.

## Open questions

- None at proposal stage. The direction, affected specs, added SDK scope, and the three confirmed contract fixes are settled enough to proceed into spec and design artifact revisions.
