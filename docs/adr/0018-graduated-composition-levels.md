---
status: accepted
date: 2026-03-13
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0018: Graduated Composition Levels — Factory, Kernel, ConfigLoader

## Context and Problem Statement

ADR-0015 established use-case-level composition with a kernel and config loader port. However, it did not explicitly document the design rationale for exposing three distinct composition levels, or when a consumer should use each one. The composition layer offers three entry points at different granularities — use-case factory, kernel, and config loader — and the choice between them affects coupling, testability, and convenience. Without clear guidance, consumers may default to the highest-level entry point (kernel) even when a lower-level one would be more appropriate.

## Decision Drivers

- Tests must be able to construct a single use case with explicit dependencies — no kernel, no config file, no filesystem
- Delivery mechanisms (CLI, MCP) need a convenient single-call entry point that wires everything
- Library consumers (plugins, custom tooling) may need a subset of use cases without the full kernel overhead
- The composition API must be intentional about what it exposes at each level

## Considered Options

- Single level — only the kernel, all consumers go through it
- Two levels — kernel + use-case factories
- Three levels — use-case factories + kernel + config loader port

## Decision Outcome

Chosen option: "Three levels", because each level serves a distinct consumer profile and no single level satisfies all three use cases (testing, delivery, library).

**Level 1 — Use-case factories** (lowest level):

Each use case has a factory function (e.g. `createArchiveChange`) that accepts either a `SpecdConfig` or explicit `(context, options)` arguments. The explicit form is the lowest public composition level and avoids kernel/config loading. In current code it is primarily explicit fs-oriented wiring; tests that need full dependency control may still instantiate use cases directly.

**Level 2 — Kernel** (mid level):

`createKernel(config: SpecdConfig)` calls every use-case factory with the same typed config and returns a structured object with all use cases grouped by domain area (`kernel.changes.*`, `kernel.specs.*`, `kernel.project.*`). This is the delivery-mechanism entry point — the CLI and MCP server call `createKernel` once at startup and route commands to the appropriate use case. The kernel is a convenience wrapper, not mandatory.

**Level 3 — Config loader** (highest level):

`ConfigLoader` is an application port that resolves a `SpecdConfig` from external sources. The delivery mechanism calls `loadConfig()` to obtain a `SpecdConfig`, then passes it to `createKernel` or to individual factories. This separation means the kernel is agnostic of where config comes from — YAML file, environment variables, or programmatic construction.

The graduated design means consumers bind at exactly the level they need:

| Consumer         | Level                         | Why                                     |
| ---------------- | ----------------------------- | --------------------------------------- |
| Unit test        | Factory or direct constructor | Full control, no kernel/config loading  |
| Integration test | Factory (`SpecdConfig`)       | Real wiring, in-memory config           |
| CLI / MCP        | Kernel + ConfigLoader         | Full convenience, one call              |
| Plugin / library | Factory (`SpecdConfig`)       | Subset of use cases, no kernel overhead |

### Consequences

- Good, because tests can stay below the kernel level — either through explicit factory wiring or direct constructor injection
- Good, because delivery mechanisms are reduced to `loadConfig → createKernel → route` — three lines of setup
- Good, because library consumers can pick individual use cases without building the full kernel
- Good, because the kernel is a convenience, not a requirement — it can grow without affecting consumers that don't use it
- Neutral, because the three-level API must be documented clearly so consumers choose the right entry point
- Neutral, because use-case factories that accept `SpecdConfig` duplicate some extraction logic — but this is trivial field access, not complex logic

### Current implementation note

The composition API has grown since this ADR was written:

- `createKernel(...)` is now asynchronous.
- `@specd/core` also exposes `createKernelBuilder(...)` as a fluent composition surface over the same additive registrations accepted by `createKernel(...)`.
- Built kernels now expose `kernel.registry`, making the merged registry surface part of the public API for integrators.

### Original confirmation criteria

- Every use-case factory accepts both `(context, options)` and `(config: SpecdConfig)` signatures
- At decision time, tests were expected to prefer the explicit `(context, options)` form rather than `createKernel`
- CLI and MCP use `createKernel` — no direct factory calls in delivery code
- `ConfigLoader` is defined as a port in `application/ports/` and implemented in `infrastructure/`

## More Information

### Spec

- [`specs/core/kernel/spec.md`](../../specs/core/kernel/spec.md)
- [`specs/core/composition/spec.md`](../../specs/core/composition/spec.md)
- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)

### Related ADRs

- [ADR-0001: Hexagonal Architecture](0001-hexagonal-architecture.md) — foundational port/adapter pattern
- [ADR-0005: Manual Dependency Injection](0005-manual-dependency-injection.md) — no IoC container, factories wire manually
- [ADR-0015: Use-Case-Level Composition](0015-use-case-level-composition.md) — established the three-level structure; this ADR documents the rationale for the graduation
