# ADR-0001: Hexagonal Architecture (Ports & Adapters)

## Status

Accepted

## Context

specd needs to expose the same core functionality through multiple delivery mechanisms: a CLI, an MCP server, and agent plugins. A CLI-first design tangles business logic with I/O, making it impossible to reuse logic across adapters without significant duplication. The core domain would also be untestable without a real filesystem.

## Decision

Adopt Hexagonal Architecture. `@specd/core` contains the domain and application layers with zero I/O dependencies. All external concerns (filesystem, git, process execution, network) are pushed behind port interfaces. CLI, MCP server, and plugins are adapters that translate between their delivery mechanism and the core use cases.

## Consequences

- `@specd/core` can be used as a standalone SDK
- All use cases are unit-testable with mocked ports — no filesystem required
- Adding new delivery mechanisms (HTTP API, IDE extension) requires no changes to core
- The infrastructure adapters (`FsSpecRepository`, etc.) live inside `@specd/core/infrastructure` — the separation is logical (layers), not physical (packages)
- More initial structure compared to a simple CLI-first approach

## Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
