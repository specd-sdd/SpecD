# Architecture

## Overview

specd uses Hexagonal Architecture (Ports & Adapters) combined with Domain-Driven Design tactical patterns. The domain is the center — all I/O is pushed to the edges.

## Requirements

### Requirement: Layered structure within @specd/core

The `@specd/core` package is organized in three layers: `domain`, `application`, and `infrastructure`. Each layer has strict import rules — inner layers never import from outer layers.

### Requirement: Domain layer is pure

The `domain` layer has zero I/O dependencies. No `fs`, no `net`, no `child_process`, no external HTTP. It depends only on the TypeScript standard library and other domain types.

### Requirement: Application layer uses ports only

The `application` layer (use cases and application services) interacts with the outside world exclusively through port interfaces defined in `application/ports/`. It never imports infrastructure adapters directly.

### Requirement: Rich domain entities

Domain entities (`Change`, `Spec`, `Artifact`, `Delta`) enforce their own invariants and state machine transitions. Invalid state transitions throw typed domain errors. Use cases do not duplicate invariant checks that belong to the entity.

### Requirement: Pure functions for stateless domain services

Domain operations that are stateless and have no I/O (e.g. delta merging, snapshot hashing) are implemented as plain exported functions in `domain/services/`, not as classes.

### Requirement: Manual dependency injection

Dependencies are wired manually at the application entry point (CLI, MCP server). No IoC container. Use case constructors receive their port implementations as arguments.

### Requirement: Packages as adapters

`@specd/cli`, `@specd/mcp`, and `@specd/plugin-*` are adapters. They have no business logic. They translate between their delivery mechanism and `@specd/core` use cases.

### Requirement: No circular dependencies between packages

Package dependency direction is strictly one-way: `plugin-*` → `skills` → `core`. `cli` → `core`. `mcp` → `core`. `schema-*` has no dependencies on other specd packages.

## Constraints

- The `domain/` layer must not import from `application/` or `infrastructure/`
- The `application/` layer must not import from `infrastructure/`
- Use cases receive all dependencies via constructor — no module-level singletons
- Domain entities must throw typed errors (subclasses of `SpecdError`) for invalid operations
- Stateless domain operations must be plain functions, not classes
- Packages must not have circular `workspace:*` dependencies

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0001: Hexagonal Architecture](../../../docs/adr/0001-hexagonal-architecture.md)
- [ADR-0004: Rich Domain Entities](../../../docs/adr/0004-rich-domain-entities.md)
- [ADR-0005: Manual Dependency Injection](../../../docs/adr/0005-manual-dependency-injection.md)
- [ADR-0006: Filesystem-Only Storage Adapter in v1](../../../docs/adr/0006-fs-only-adapter-v1.md)
