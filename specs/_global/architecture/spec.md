# Architecture

## Overview

specd uses Hexagonal Architecture (Ports & Adapters) combined with Domain-Driven Design tactical patterns. The domain is the center — all I/O is pushed to the edges. These principles apply to every package in the monorepo that contains business logic. Adapter packages (CLI, MCP, plugins) follow the same pattern at their level, delegating all logic to the core.

## Requirements

### Requirement: Layered structure for packages with business logic

Any package containing business logic must be organized in three layers: `domain`, `application`, and `infrastructure`. Each layer has strict import rules — inner layers never import from outer layers. Currently `@specd/core` is the only such package; any future package with domain logic must follow the same structure.

### Requirement: Domain layer is pure

The `domain` layer has zero I/O dependencies. No `fs`, no `net`, no `child_process`, no external HTTP. It depends only on the TypeScript standard library and other domain types. This applies to every package's `domain/` layer.

### Requirement: Application layer uses ports only

The `application` layer (use cases and application services) interacts with the outside world exclusively through port interfaces defined in `application/ports/`. It never imports infrastructure adapters directly. This applies to every package's `application/` layer.

### Requirement: Rich domain entities

Domain entities enforce their own invariants and state machine transitions. Invalid state transitions throw typed domain errors. Use cases do not duplicate invariant checks that belong to the entity. This applies to any domain entity defined in any package.

### Requirement: Domain value objects expose behaviour, not structure

Domain value objects expose operations and computed properties via methods and getters. Internal representation (e.g. raw segment arrays, backing fields) must not be accessible from outside the class hierarchy. This applies to all value objects in any package's `domain/` layer.

### Requirement: Ports with shared construction are abstract classes

When a port has constructor arguments that are invariant across all implementations (e.g. `scope`, `ownership`, `isExternal`), it is defined as an `abstract class` rather than an `interface`. The abstract class sets those fields in its constructor and exposes them as methods. All storage operations are declared `abstract`. This lets the TypeScript compiler enforce both the construction contract and the method contract without relying on ESLint or convention.

All methods on port abstract classes — including the shared ones from the base — are explicit methods, never property signatures.

### Requirement: Pure functions for stateless domain services

Domain operations that are stateless and have no I/O are implemented as plain exported functions in `domain/services/`, not as classes. This applies to any package with a `domain/` layer.

### Requirement: Manual dependency injection

Dependencies are wired manually at the application entry point of each package. No IoC container. Use case constructors receive their port implementations as arguments.

### Requirement: Composition layer for adapter construction

Each package with business logic may have a `composition/` layer above `infrastructure/`. This layer contains factory functions that construct infrastructure adapters and return the abstract port type. It is the only layer permitted to import from `infrastructure/`.

Factory functions must:

- Accept a discriminated union config (e.g. `{ type: 'fs', ...fsConfig }`) to remain extensible as new adapter types are added
- Return the abstract port type (`SpecRepository`, `ChangeRepository`), never the concrete class
- Be the only public export surface for infrastructure adapters — concrete adapter classes are never exported from `index.ts`

Adapter packages (CLI, MCP) import from `composition/` to construct their dependencies. They never import concrete infrastructure classes directly.

### Requirement: Adapter packages contain no business logic

Packages that serve as delivery mechanisms (`@specd/cli`, `@specd/mcp`, `@specd/plugin-*`) contain no business logic. They translate between their delivery mechanism and use cases. Any new adapter package must follow the same rule.

### Requirement: No circular dependencies between packages

Package dependency direction is strictly one-way: `plugin-*` → `skills` → `core`. `cli` → `core`. `mcp` → `core`. `schema-*` has no dependencies on other specd packages. Any new package must fit into this directed graph without introducing cycles.

## Constraints

- In any package with business logic, `domain/` must not import from `application/`, `infrastructure/`, or `composition/`
- In any package with business logic, `application/` must not import from `infrastructure/` or `composition/`
- In any package with business logic, `infrastructure/` must not import from `composition/`
- Only `composition/` may import from `infrastructure/`; concrete adapter classes must not be exported from `index.ts`
- Use cases receive all dependencies via constructor — no module-level singletons, in any package
- Domain entities must throw typed errors (subclasses of `SpecdError`) for invalid operations
- Stateless domain operations must be plain functions, not classes
- Ports with invariant constructor arguments are `abstract class`, not `interface`
- All port methods are explicit methods — no property signatures
- No package may introduce a circular `workspace:*` dependency

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0001: Hexagonal Architecture](../../../docs/adr/0001-hexagonal-architecture.md)
- [ADR-0004: Rich Domain Entities](../../../docs/adr/0004-rich-domain-entities.md)
- [ADR-0005: Manual Dependency Injection](../../../docs/adr/0005-manual-dependency-injection.md)
- [ADR-0006: Filesystem-Only Storage Adapter in v1](../../../docs/adr/0006-fs-only-adapter-v1.md)
