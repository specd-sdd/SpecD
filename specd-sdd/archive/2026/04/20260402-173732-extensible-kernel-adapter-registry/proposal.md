# Proposal: extensible-kernel-adapter-registry

## Motivation

The kernel is the main public composition entry point of `@specd/core`, but today it is effectively closed over a fixed built-in set of adapters. Consumers can call `createKernel(config, options?)`, but they cannot use that API to extend the system with new storage backends, VCS/actor providers, artifact parsers, or hook execution backends. That makes the public composition surface less capable than the domain and application abstractions underneath it.

This change is needed because the product already has clear extension use cases that the current kernel cannot support cleanly:

- read-only workspaces whose specs come from a remote git repository, an HTTP API, object storage, or another non-filesystem source
- projects that are not plain local git repositories and need custom VCS detection or custom actor identity resolution
- projects that need additional artifact formats beyond the built-in markdown/yaml/json/plaintext set
- projects that need workflow hooks to run somewhere other than the local shell, such as Docker or HTTP/webhook backends

Right now, supporting any of these cases means patching core internals or forking composition logic. That is exactly the sort of integration pressure the kernel should absorb with a supported extension seam.

## Current behaviour

Today `createKernel` constructs a fixed set of built-in adapter implementations and exposes no additive registry model.

The main limitations are:

- **Storage is fixed to the built-in filesystem composition path.** The config model already has an `adapter`-like concept around storage, but the kernel does not support plugging in named storage factories that build repositories for other backends.
- **Workspace VCS and project VCS are not extensible.** The current VCS/actor factories auto-detect the built-in git/hg/svn chain, but callers cannot prepend custom providers. This matters because workspace storage and project VCS are orthogonal concerns: a workspace may be backed by `fs`, `git`, or `http`, while the project itself may be git, Fossil, no VCS at all, or something else.
- **Actor resolution is similarly closed.** The current actor flow is VCS-oriented and does not offer a supported pre-kernel registration point for CI identity, SSO-backed identity, or other external identity providers.
- **Parser registration is effectively closed to callers.** The platform has an `ArtifactParserRegistry`, but kernel consumers cannot extend it via kernel construction. Formats such as TOML, OpenAPI, GraphQL, protobuf, or a project-specific DSL cannot be introduced through the kernel API.
- **Hook execution is limited to the current model.** The workflow model clearly distinguishes `instruction:` and shell `run:` hooks, but there is no supported path for externally dispatched hooks such as Docker execution or HTTP callbacks. The issue already proposes the direction to unlock this: introduce an explicit external hook form shaped as `external: { type, config }` and dispatch it through a registered external runner.
- **The available capabilities are not discoverable from the kernel.** Even where core internally knows about factories and registries, the kernel does not expose a merged view that consumers can inspect, validate against, or reuse.

The result is a mismatch between the system's abstractions and its public composition API: the internals are modular, but the kernel still behaves like a closed built-in-only assembly.

## Proposed solution

Extend kernel construction so callers can add capabilities through `KernelOptions` before the kernel is built, and expose the merged capability set from the resulting `Kernel`.

At a high level, the proposal is:

- add additive registries to `KernelOptions` for:
  - storage factories
  - VCS providers
  - actor providers
  - artifact parsers
  - external hook runners
- merge those registrations with the built-ins instead of replacing built-in behaviour
- expose the merged registries from the kernel so consumers can inspect what is available and use the same factories the kernel used
- keep kernel construction immutable and one-shot: registrations happen before `createKernel` finishes, not by mutating a live kernel afterward

The intended semantics are explicitly additive:

- built-ins remain present
- externals extend capability
- existing callers keep working unchanged when they do not register anything

This proposal **does** include a fluent builder API as part of the same extensibility story. The change should cover both:

- extending `createKernel(config, options)` with additive registration support
- adding a builder-style construction API on top of the same registration model for callers that need ergonomic conditional registration

The builder is not a separate feature with different semantics. It is an alternative construction surface over the same additive registry model and should preserve the same guarantees: built-ins remain available, registration happens before kernel construction completes, and the resulting kernel is immutable after creation.

The issue also gives the intended shape of this extension:

- **storage factories** are named by adapter key and are responsible for creating the repository and any workspace-specific VCS/null-VCS handling needed for that storage mode
- **VCS providers** extend the autodetect chain ahead of the built-in git/hg/svn order
- **actor providers** extend identity resolution ahead of the built-in VCS-backed chain
- **parsers** are merged into the existing parser registry by format name
- **external hooks** are represented explicitly in workflow data as `external: { type, config }` and dispatched through named external hook runners using that type plus opaque config
- **the internal `HookRunner` remains the shell runner for built-in `run:` hooks**; external hooks use a separate runner abstraction whose implementations declare which external hook types they accept so the runtime can dispatch them correctly

The kernel should also expose these merged registries so downstream consumers can do things like:

- discover available adapters and parsers
- validate config against registered names
- reuse the same factories for ad hoc composition
- inspect the final merged capability set in tests and tooling

Unknown adapter names are not a soft-failure case in this proposal. If configuration or workflow data references an adapter, provider, parser, or external hook type that is not present in the merged built-in + external registries, specd must fail with a clear error instead of silently ignoring it or deferring it as an ambiguous runtime condition.

This is still a proposal artifact, so it deliberately focuses on the change in public capability and system behavior, not the final implementation plan. The implementation details, construction order, and exact code structure belong in `design.md`.

## Specs affected

### New specs

- `core:core/kernel-builder`: define the fluent builder API for additive kernel registration, including its relationship to `createKernel(config, options)`, its supported registration methods, and the guarantee that `build()` produces the same kernel semantics as the lower-level construction path.
  - Depends on: `core:core/kernel`, `core:core/composition`
- `core:core/external-hook-runner-port`: define the contract for externally dispatched hook runners, including how they declare accepted hook types for runtime dispatch.
  - Depends on: `core:core/hook-execution-model`, `core:core/schema-format`

### Modified specs

- `core:core/kernel`: extend `KernelOptions` with additive registries, expose the merged registry from `Kernel`, and preserve the current guarantees around one-time shared construction and post-build immutability.
  - Depends on (added): none
- `core:core/composition`: extend the composition layer contract so the kernel extensibility story includes both `createKernel(config, options)` and a fluent builder entry point over the same underlying registration model.
  - Depends on (added): none
- `core:core/config`: update config expectations so workspace storage configuration can cooperate with registered adapter names and adapter-specific config blocks instead of assuming only the built-in composition path.
  - Depends on (added): none
- `core:core/storage`: define how named storage factories participate in kernel composition without weakening the existing storage abstraction boundaries.
  - Depends on (added): none
- `core:core/schema-format`: update schema/workflow shape so workflow hooks can describe explicit external hook entries in a schema-valid way.
  - Depends on (added): none
- `core:core/hook-execution-model`: extend hook semantics so explicit external hook entries have clear collection, execution, and failure behavior alongside existing `instruction:` and shell `run:` hooks.
  - Depends on (added): none
- `core:core/hook-runner-port`: clarify that `HookRunner` remains strictly the shell runner for built-in `run:` hooks and is not reused as the contract for external hook backends.
  - Depends on (added): none
- `core:core/artifact-parser-port`: preserve the existing parser registry contract while allowing callers to extend it additively at kernel-construction time.
  - Depends on (added): none
- `core:core/vcs-adapter`: extend VCS autodetection so custom providers can run before the built-in git/hg/svn chain while keeping the current fallback behavior.
  - Depends on (added): none
- `core:core/actor-resolver`: extend actor resolution so custom providers can run before the built-in VCS-backed chain while keeping the current fallback behavior.
  - Depends on (added): none
- `core:core/run-step-hooks`: extend runtime hook dispatch so explicit external hook entries are routed through external runners whose accepted types determine whether they can handle a given external hook.
  - Depends on (added): `core:core/external-hook-runner-port`
- `cli:cli/config-show`: align the CLI contract with the resolved `SpecdConfig` shape so JSON output explicitly covers adapter bindings and text output no longer promises removed `workflow` data.
  - Depends on (added): none

## Impact

This change primarily affects the public composition boundary of `@specd/core`, especially:

- `packages/core/src/composition/kernel.ts`
- `packages/core/src/composition/kernel-internals.ts`
- `packages/core/src/composition/vcs-adapter.ts`
- `packages/core/src/composition/actor-resolver.ts`
- `packages/core/src/infrastructure/artifact-parser/registry.ts`
- `packages/core/src/application/use-cases/run-step-hooks.ts`
- `packages/core/src/domain/services/build-schema.ts`
- `packages/core/src/application/specd-config.ts`
- `packages/cli/src/kernel.ts`
- `packages/cli/src/commands/config/show.ts`

The graph confirms this is a high-coupling change:

- `createKernel` is a `CRITICAL` hotspot
- it has `33` direct dependents

That means the proposal must preserve backward compatibility for the common case:

- `createKernel(config)` without new registrations must keep working exactly as today
- built-in capability names and behavior must remain available
- no existing caller should be forced to know about the new registries unless it wants to use them

That backward compatibility does not apply to unknown names. The proposal explicitly requires unknown adapter names to be rejected as configuration/runtime errors, because silently accepting them would make registry-based extensibility unsafe and difficult to debug.

The impact is not only in kernel composition. There are also likely downstream effects in:

- workflow hook modeling and runtime dispatch
- schema validation and workflow-step parsing
- config validation for named adapters
- test composition helpers and CLI kernel creation

This proposal does **not** aim to change use-case semantics unrelated to extensibility. The goal is to make composition more extensible without rewriting unrelated domain behavior.

## Technical context

The issue already provides more direction than a generic “make it extensible” request. The following points should be treated as established direction from the issue, not speculative design:

- the extension model is **additive**, not replacement-based
- built-ins stay available
- the kernel should expose the merged registries to consumers
- storage, VCS, actor, parser, and hook extensibility all belong to the same kernel-level registration story
- the builder API described in the issue is part of the intended public composition surface for this change
- the kernel remains immutable after construction

There are also important constraints from the current codebase and loaded specs:

- the kernel is a plain object and shared adapters are constructed once
- composition remains manual dependency injection, not runtime service discovery
- VCS and actor resolution already live behind composition factories, so extending provider chains should build on those factories rather than bypassing them
- the parser registry is already map-shaped, which aligns well with additive parser registration

The issue also sharpens two architectural distinctions that the proposal must preserve:

- **workspace storage vs project VCS are separate concerns**
  - a workspace may use `fs`, `git`, `http`, or another storage backend
  - the project itself may be under git, another VCS, or no VCS
  - the extension model should not collapse those two concerns into one
- **shell hooks vs externally dispatched hooks are separate concerns**
  - today the platform has `instruction:` and shell `run:` hooks
  - the issue already proposes explicit external hook entries for externally dispatched execution backends
  - the internal `HookRunner` stays with shell `run:` execution
  - external hook dispatch needs a separate runner contract, and those runners must declare which external hook types they accept

The strongest source of uncertainty is not whether extensibility is needed, but exactly where to draw the boundary between:

- public registration and discovery
- build-time structural validation
- runtime semantic validation against the merged registry, with unknown names treated as hard errors
- shell hook execution versus external hook execution responsibilities
- `createKernel` and the builder so both stay aligned on behavior and guarantees

Those are the areas where the design artifact will need to be precise.

## Open questions

_none_
