# CompositionResolver

## Purpose

Config-based public composition needs one shared way to resolve ports and services without forcing every `createX(config, options?)` factory to rebuild bespoke filesystem wiring. `CompositionResolver` defines that shared composition contract: a scoped, lazy, cacheable resolver that turns `SpecdConfig` plus additive composition options into normalized dependencies reused by standalone factories, the kernel facade, and the kernel builder.

## Requirements

### Requirement: Resolver is scoped to one composition session

`CompositionResolver` SHALL be created from one `SpecdConfig` plus composition-resolution options.

A resolver instance MUST represent one composition session only. It MUST NOT be a process-wide singleton and MUST NOT be reused across unrelated config or options inputs.

### Requirement: Resolver exposes normalized shared dependencies

The resolver SHALL expose normalized access to shared composition dependencies such as repositories, schema-resolution services, actor resolution, VCS integration, hook execution infrastructure, parsers, and other shared composition primitives required by kernel-mounted public factories.

The resolver contract MUST expose those dependencies in a way that is independent of fs-shaped public factory inputs.

The generic registry, merged-registry-view, and built-in-capability primitives consumed below the resolver SHALL belong to composition infrastructure. They MUST NOT be defined as kernel-owned concepts in the architecture contract.

### Requirement: Resolver is lazy and cacheable

The resolver MUST resolve shared dependencies lazily. It MUST NOT eagerly instantiate the entire kernel dependency graph when only one standalone public factory is requested.

A resolver instance MAY cache the shared dependencies it resolves so later reads during the same composition session reuse the same normalized instances.

### Requirement: Resolver does not own per-use-case dependency objects

The resolver MUST NOT centralize knowledge of every `XDeps` contract.

Per-use-case dependency assembly SHALL happen in helpers specific to each public factory, for example `resolveCreateChangeDeps(resolver)`, located with or near the corresponding `createX(...)` factory code.

### Requirement: Public config-based factories delegate through the resolver

For kernel-mounted public composition factories, the convenience form `createX(config, options?)` SHALL:

1. create a resolver instance for that composition session
2. derive `XDeps` through the per-use-case dependency-assembly helper
3. delegate to canonical `createX(deps)` construction

### Requirement: Canonical public factories remain dependency-based

`CompositionResolver` SHALL support public factory composition, but it SHALL NOT replace canonical dependency-based factory contracts.

The canonical public contract for kernel-mounted factory construction remains `createX(deps)`.

### Requirement: Invalid public argument combinations use one shared error

Argument normalization for public factory wrappers SHALL use one shared typed error: `InvalidCompositionFactoryArgumentsError`.

That error MUST identify at least the target factory or use-case name so the caller can see which `createX(...)` entry received an invalid argument combination.

## Constraints

- `CompositionResolver` is composition infrastructure, not a domain or application service.
- The resolver may reuse registry/view helpers shared with the kernel and builder, but those helpers are composition-owned shared infrastructure rather than kernel-owned abstractions.
- The resolver MUST NOT be exposed as a mandatory third public call shape for every `createX(...)` factory.
- The resolver MUST NOT require eager full-kernel construction for one standalone public factory call.

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition-layer boundaries and public wiring rules
- [`core:composition`](../composition/spec.md) — public factory surface that consumes the resolver
- [`core:kernel`](../kernel/spec.md) — grouped kernel assembly over shared composition semantics
- [`core:kernel-builder`](../kernel-builder/spec.md) — full-kernel builder integration over the same resolver path
