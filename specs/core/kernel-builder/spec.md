# Kernel Builder

## Purpose

Consumers that need to register kernel extensions conditionally or incrementally should not have to assemble a large `KernelOptions` object manually before every kernel construction. The kernel builder provides a fluent composition surface over the same additive registry model as `createKernel(config, options)`, letting callers accumulate registrations ergonomically while preserving the kernel's existing guarantees around manual dependency injection, additive extension, and post-build immutability.

## Requirements

### Requirement: Builder accumulates additive kernel registrations

A fluent kernel builder SHALL exist as a public composition entry point for `@specd/core`. It SHALL accumulate the same additive registrations supported by `KernelOptions`, including storage factories, graph-store factories, parsers, VCS providers, actor providers, and external hook runners, before kernel construction occurs.

The builder SHALL be a pre-construction composition surface only. It MUST NOT mutate an already-built kernel.

### Requirement: Builder supports fluent registration methods

The builder SHALL expose fluent registration methods for each additive registry category that this change introduces. At minimum, it SHALL support:

- spec storage registration
- schema storage registration
- change storage registration
- archive storage registration
- graph-store registration via `registerGraphStore(id, factory)`
- graph-store selection via `useGraphStore(id)`
- parser registration
- external hook runner registration
- VCS provider registration
- actor provider registration

Each registration method SHALL return the builder itself so callers can chain registrations conditionally and ergonomically.

`useGraphStore(id)` selects the single active graph-store backend for the kernel being built. It does not register a backend by itself.

### Requirement: Builder builds kernels with createKernel-equivalent semantics

Calling `build()` on the builder SHALL produce a kernel with the same semantics as calling `createKernel(config, options)` with the equivalent accumulated registrations and selected `graphStoreId`.

This equivalence includes:

- built-in capabilities remain available
- external registrations extend rather than replace built-ins
- the selected graph-store backend id is passed through exactly as if it had been supplied in `KernelOptions`
- shared adapters are constructed once
- the resulting kernel is immutable after construction

### Requirement: Builder rejects conflicting registrations

The builder SHALL reject conflicting registrations instead of silently overwriting them. Attempting to register a capability name that collides with an existing built-in or already-registered external entry for the same registry category MUST fail with an error.

The builder SHALL also reject `useGraphStore(id)` when `id` is not present in the merged built-in plus externally-registered graph-store registry available at build time.

### Requirement: Builder accepts base registration state

The builder SHALL support initialization from a resolved project configuration plus optional base registration state, so callers can start from a partially-prepared additive registry set before applying additional fluent registrations.

## Constraints

- The builder is part of the composition layer, not the domain or application layers
- The builder is an alternative construction surface over the same additive kernel registration model; it does not define a second extensibility model
- The builder does not mutate built kernels after `build()`
- Conflicting registration names are errors

## Spec Dependencies

- [`core:core/kernel`](../kernel/spec.md) — kernel shape, additive registries, merged registry exposure
- [`core:core/composition`](../composition/spec.md) — composition-layer exports and construction responsibilities
- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition-layer boundaries
