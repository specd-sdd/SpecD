# ADR-0005: Manual Dependency Injection

## Status
Accepted

## Context
Use cases depend on port interfaces (`SpecRepository`, `HookRunner`, etc.) that must be swappable for testing and for future adapter implementations. IoC containers (tsyringe, inversify) provide automatic wiring but require decorators, `reflect-metadata`, and add a non-trivial dependency with its own learning curve. For a tool with a small number of use cases and a single entry point, this overhead is not justified.

## Decision
Dependencies are wired manually at the application entry point. The CLI entry point reads `specd.yaml`, constructs the appropriate infrastructure adapters, and passes them into use case constructors. No IoC container, no decorators, no `reflect-metadata`.

## Consequences
- Wiring code is explicit and easy to follow for any contributor
- Adding a new use case requires adding a few lines to the entry point wiring — no container registration
- If the number of use cases grows significantly, a simple factory pattern can be introduced without changing the use case code
- No additional runtime dependencies

## Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
