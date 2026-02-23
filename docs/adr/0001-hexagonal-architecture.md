---
status: accepted
date: 2026-02-19
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0001: Hexagonal Architecture (Ports & Adapters)

## Context and Problem Statement

specd needs to expose the same core functionality through multiple delivery mechanisms: a CLI, an MCP server, and agent plugins. A CLI-first design tangles business logic with I/O, making it impossible to reuse logic across adapters without significant duplication. The core domain would also be untestable without a real filesystem.

## Decision Drivers

- Multiple delivery mechanisms (CLI, MCP server, plugins) must all consume the same business logic without duplication
- Use cases must be unit-testable without a real filesystem or network
- Adding new delivery mechanisms (HTTP API, IDE extension) must not require changes to core business logic

## Decision Outcome

Chosen option: "Hexagonal Architecture (Ports & Adapters)", because it isolates the domain and application layers from all I/O concerns while making each delivery mechanism an independent adapter.

`@specd/core` contains the domain and application layers with zero I/O dependencies. All external concerns (filesystem, git, process execution, network) are pushed behind port interfaces. CLI, MCP server, and plugins are adapters that translate between their delivery mechanism and the core use cases.

### Consequences

- Good, because `@specd/core` can be used as a standalone SDK
- Good, because all use cases are unit-testable with mocked ports — no filesystem required
- Good, because adding new delivery mechanisms requires no changes to core
- Good, because the infrastructure adapters (`FsSpecRepository`, etc.) live inside `@specd/core/infrastructure` — the separation is logical (layers), not physical (packages)
- Bad, because there is more initial structure compared to a simple CLI-first approach

### Confirmation

ESLint `no-restricted-imports` rules in `@specd/core` enforce that `domain/` does not import from `application/` or `infrastructure/`, and `application/` does not import from `infrastructure/`. CI fails if these boundaries are violated.

## More Information

### Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
