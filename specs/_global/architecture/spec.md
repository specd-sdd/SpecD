# Architecture

## Overview

specd uses Hexagonal Architecture (Ports & Adapters) combined with Domain-Driven Design tactical patterns. The domain is the center — all I/O is pushed to the edges. These principles apply to every package in the monorepo that contains business logic. Adapter packages (CLI, MCP, plugins) follow the same pattern at their level, delegating all logic to the core.

## Requirements

### Requirement: Layered structure for packages with business logic

Any package containing business logic must be organized in three layers: `domain`, `application`, and `infrastructure`. Each layer has strict import rules — inner layers never import from outer layers. Currently `@specd/core` is the only such package; any future package with domain logic must follow the same structure.

#### Scenario: Domain imports from infrastructure

- **WHEN** a file in `domain/` imports from `infrastructure/`
- **THEN** the TypeScript compiler must reject the import

#### Scenario: Application imports infrastructure directly

- **WHEN** a use case imports a concrete adapter instead of the port interface
- **THEN** the TypeScript compiler must reject the import

### Requirement: Domain layer is pure

The `domain` layer has zero I/O dependencies. No `fs`, no `net`, no `child_process`, no external HTTP. It depends only on the TypeScript standard library and other domain types. This applies to every package's `domain/` layer.

#### Scenario: Domain imports node:fs

- **WHEN** a file in `domain/` imports `node:fs` or any I/O module
- **THEN** the TypeScript compiler must reject the import

### Requirement: Application layer uses ports only

The `application` layer (use cases and application services) interacts with the outside world exclusively through port interfaces defined in `application/ports/`. It never imports infrastructure adapters directly. This applies to every package's `application/` layer.

#### Scenario: Use case receives port via constructor

- **WHEN** a use case needs to read specs
- **THEN** it receives a `SpecRepository` port via its constructor, not a concrete `FsSpecRepository`

### Requirement: Rich domain entities

Domain entities enforce their own invariants and state machine transitions. Invalid state transitions throw typed domain errors. Use cases do not duplicate invariant checks that belong to the entity. This applies to any domain entity defined in any package.

#### Scenario: Invalid state transition

- **WHEN** a use case attempts an invalid state transition on a domain entity
- **THEN** the entity throws a typed `SpecdError` subclass before any side effect occurs

### Requirement: Domain value objects expose behaviour, not structure

Domain value objects expose operations and computed properties via methods and getters. Internal representation (e.g. raw segment arrays, backing fields) must not be accessible from outside the class hierarchy. This applies to all value objects in any package's `domain/` layer.

#### Scenario: Value object exposes internal array

- **WHEN** a value object in `domain/` has a `public` getter that returns its internal backing field directly
- **THEN** it must be replaced with a method or getter that exposes only the behaviour the caller needs

#### Scenario: Infrastructure adapter accesses internal segments

- **WHEN** an infrastructure adapter needs a filesystem path from a domain path object
- **THEN** it must call `domainPath.toFsPath(sep)` — it must not access a `segments` property

### Requirement: Ports with shared construction are abstract classes

When a port has constructor arguments that are invariant across all implementations (e.g. `scope`, `ownership`, `isExternal`), it is defined as an `abstract class` rather than an `interface`. The abstract class sets those fields in its constructor and exposes them as methods. All storage operations are declared `abstract`. This lets the TypeScript compiler enforce both the construction contract and the method contract without relying on ESLint or convention.

All methods on port abstract classes — including the shared ones from the base — are explicit methods, never property signatures.

#### Scenario: Port has shared construction arguments

- **WHEN** every possible implementation of a port receives the same set of constructor arguments
- **THEN** the port is an `abstract class` with those arguments in its constructor, not an `interface`

#### Scenario: Port declares a property instead of a method

- **WHEN** a port class declares `readonly scope: string` instead of `scope(): string`
- **THEN** it must be changed to the method form

### Requirement: Pure functions for stateless domain services

Domain operations that are stateless and have no I/O are implemented as plain exported functions in `domain/services/`, not as classes. This applies to any package with a `domain/` layer.

#### Scenario: Domain service is a function

- **WHEN** a developer adds a stateless domain operation to any package
- **THEN** it is exported as a plain function, not as a class with methods

### Requirement: Manual dependency injection

Dependencies are wired manually at the application entry point of each package. No IoC container. Use case constructors receive their port implementations as arguments.

#### Scenario: Use case wired at entry point

- **WHEN** any package boots (CLI, MCP, or future entry points)
- **THEN** it constructs use cases manually, passing concrete adapters to each constructor

### Requirement: Adapter packages contain no business logic

Packages that serve as delivery mechanisms (`@specd/cli`, `@specd/mcp`, `@specd/plugin-*`) contain no business logic. They translate between their delivery mechanism and use cases. Any new adapter package must follow the same rule.

#### Scenario: Adapter package contains business logic

- **WHEN** a command, tool, or plugin implements domain logic instead of delegating to a use case
- **THEN** the logic must be moved to the appropriate core package

### Requirement: No circular dependencies between packages

Package dependency direction is strictly one-way: `plugin-*` → `skills` → `core`. `cli` → `core`. `mcp` → `core`. `schema-*` has no dependencies on other specd packages. Any new package must fit into this directed graph without introducing cycles.

#### Scenario: Cycle introduced by new package

- **WHEN** a new package declares a `workspace:*` dependency that creates a cycle
- **THEN** pnpm must reject it

## Constraints

- In any package with business logic, `domain/` must not import from `application/` or `infrastructure/`
- In any package with business logic, `application/` must not import from `infrastructure/`
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
