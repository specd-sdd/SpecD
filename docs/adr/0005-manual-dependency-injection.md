---
status: accepted
date: 2026-02-19
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0005: Manual Dependency Injection

## Context and Problem Statement

Use cases depend on port interfaces (`SpecRepository`, `HookRunner`, etc.) that must be swappable for testing and for future adapter implementations. IoC containers (tsyringe, inversify) provide automatic wiring but require decorators, `reflect-metadata`, and add a non-trivial dependency with its own learning curve. For a tool with a small number of use cases and a single entry point, this overhead is not justified.

## Decision Drivers

- Dependencies must be swappable — use cases receive ports, not concrete implementations
- Simplicity: no decorators, no `reflect-metadata`, no additional runtime dependencies
- Wiring must be explicit and easy to follow for any contributor

## Considered Options

- IoC container (tsyringe or inversify) — automatic constructor injection via decorators
- Manual DI — dependencies wired explicitly at the application entry point

## Decision Outcome

Chosen option: "Manual DI", because the number of use cases and entry points is small enough that explicit wiring is simpler than the overhead an IoC container introduces.

Dependencies are wired manually at the application entry point. The CLI entry point reads `specd.yaml`, constructs the appropriate infrastructure adapters, and passes them into use case constructors. No IoC container, no decorators, no `reflect-metadata`.

### Consequences

- Good, because wiring code is explicit and easy to follow for any contributor
- Good, because there are no additional runtime dependencies
- Good, because adding a new use case requires adding a few lines to the entry point — no container registration ceremony
- Good, because if the number of use cases grows significantly, a simple factory pattern can be introduced without changing the use case code
- Bad, because as the number of use cases grows, the entry point wiring block grows in proportion

### Confirmation

`package.json` files across the monorepo contain no references to `tsyringe`, `inversify`, `reflect-metadata`, or `@injectable`/`@inject` decorator packages. No source files use `reflect-metadata` or the `@Injectable` / `@Inject` decorator pattern. This is verified by a `grep` check in CI.

## Pros and Cons of the Options

### IoC container (tsyringe / inversify)

- Good, because wiring is automatic — add a decorator and the container resolves the dependency graph
- Bad, because it requires `experimentalDecorators` and `emitDecoratorMetadata`, which conflict with ESM and strict TypeScript settings
- Bad, because `reflect-metadata` must be imported at the process entry point — a global side-effect
- Bad, because it adds a runtime dependency and a learning curve for contributors unfamiliar with the container

### Manual DI

- Good, because it is fully explicit — the wiring is plain TypeScript code any contributor can read and trace
- Good, because there are no decorators, no reflection, no additional dependencies
- Good, because it is fully compatible with strict TypeScript and ESM
- Bad, because the entry point grows linearly with the number of use cases; may need a factory helper if it becomes unwieldy

## More Information

### Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
