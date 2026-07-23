# Architecture

## Purpose

Business logic coupled to I/O becomes untestable and resistant to change. specd uses Hexagonal Architecture (Ports & Adapters) combined with DDD tactical patterns — the domain is the center, all I/O is pushed to the edges. These principles apply to every package with business logic; adapter packages (CLI, MCP, plugins) follow the same pattern at their level, delegating all logic to the core.

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

### Requirement: Composition layer for use-case wiring

Each package with business logic may have a `composition/` layer above `infrastructure/`. This layer is the only layer permitted to import from `infrastructure/`. It exposes:

- **Kernel** — `createKernel(config: SpecdConfig, options?)` wires domain use cases and returns grouped use cases. Config mutation is not wired into the kernel. Hosts read config via `kernel.project.getConfig` when needed.
- **Config loader port** — `createDefaultConfigLoader()` returns a `ConfigLoader`. Implementations live in `infrastructure/`.
- **Config writer port** — `createConfigWriter()` returns a `ConfigWriter` for mutating `specd.yaml`. Delivery mechanisms call port methods on the returned instance.

Every capability mounted on `Kernel` MUST also be obtainable without `createKernel`. Public use-case factories MUST expose canonical dependency-based construction as `createX(deps)` and MAY expose a convenience bootstrap form as `createX(config, options?)`. The config-based form MUST delegate through one shared composition-resolver path that resolves normalized dependencies from config instead of reintroducing per-factory fs-specific wiring branches.

`createKernel` is a convenience orchestration layer over the same reusable factory logic. `createKernelBuilder` is a convenience surface for full-kernel additive registration over that same resolver path; neither one defines a second source of truth for per-use-case composition semantics.

Concrete adapter classes are never exported from public entry points. Delivery hosts (`@specd/cli`, `@specd/mcp`) that use both core and code-graph MUST import from `@specd/sdk` per the import policy in `sdk:composition`.

### Requirement: YAML inputs validated at the infrastructure boundary

Infrastructure adapters that read external YAML files (config, schema, metadata) must validate the parsed input at the filesystem boundary using a schema validator before constructing domain or application objects. Validation failures must surface as typed errors (`ConfigValidationError`, `SchemaValidationError`) that extend `SpecdError`. Raw YAML structures must never reach domain or application code without prior validation.

### Requirement: Adapter packages contain no business logic

Packages that serve as delivery mechanisms (`@specd/cli`, `@specd/mcp`, `@specd/plugin-*`) contain no business logic. They translate between their delivery mechanism and use cases. Any new adapter package must follow the same rule.

### Requirement: No circular dependencies between packages

Package dependency direction is strictly one-way: `plugin-*` → `skills` → `core`. `cli` → `sdk`. `mcp` → `sdk`. `sdk` → `core`, `code-graph`. `schema-*` has no dependencies on other specd packages. Any new package must fit into this directed graph without introducing cycles.

### Requirement: Curated public package entry points

Packages with business logic (`@specd/core`, `@specd/code-graph`) and the host facade (`@specd/sdk`) MUST expose curated public barrels through `package.json` `exports`:

- `"."` — integrator-facing surface (composition bootstrap, kernel types, kernel-equivalent factories, domain types, errors). MUST NOT export concrete adapter classes or infrastructure implementations.
- `"./ports"` (`@specd/core` only) — port interfaces and abstract classes plus associated `*Config` / `*Result` types. MUST NOT export adapter implementations.
- `"./extensions"` (`@specd/core` only) — kernel registry and storage-factory registration types (`*StorageFactory`, `KernelRegistryInput`, `KernelBuilder`, hook/VCS/actor providers). MUST NOT export builtin factory markers or infrastructure wiring.
- `"./internal"` — full development barrel for monorepo tests and advanced callers only.

`@specd/sdk` MUST additionally expose `"./ports"` and `"./extensions"` as re-exports of the corresponding `@specd/core` subpaths.

## Constraints

- In any package with business logic, `domain/` must not import from `application/`, `infrastructure/`, or `composition/`
- In any package with business logic, `application/` must not import from `infrastructure/` or `composition/`
- In any package with business logic, `infrastructure/` must not import from `composition/`
- Only `composition/` may import from `infrastructure/`; concrete adapter classes and repository-level factories must not be exported from `index.ts`
- Delivery mechanisms import use-case factories, the kernel, `createDefaultConfigLoader`, and `createConfigWriter` — they MAY call methods on the returned `ConfigLoader` and `ConfigWriter` port instances but MUST NOT import infrastructure adapters or construct use cases directly
- Use cases receive all dependencies via constructor — no module-level singletons, in any package
- Domain entities must throw typed errors (subclasses of `SpecdError`) for invalid operations
- Stateless domain operations must be plain functions, not classes
- Ports with invariant constructor arguments are `abstract class`, not `interface`
- All port methods are explicit methods — no property signatures
- No package may introduce a circular `workspace:*` dependency
- Infrastructure adapters that read external YAML files must validate the parsed content with a schema validator before constructing any domain or application objects; unvalidated YAML must never reach domain or application code
- Public `"."` barrels MUST NOT export concrete adapter classes or infrastructure implementations
- Public `"."` barrels MUST export kernel-equivalent `createX` use-case factories and repository-level factories for every capability on `Kernel`
- Port contracts live on `@specd/core/ports` (and `@specd/sdk/ports`); extension registration types live on `@specd/core/extensions` (and `@specd/sdk/extensions`)
- Delivery hosts (`cli`, `mcp`) MUST NOT declare direct runtime dependencies on both `@specd/core` and `@specd/code-graph` when `@specd/sdk` covers their needs

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0001: Hexagonal Architecture](../../../docs/adr/0001-hexagonal-architecture.md)
- [ADR-0004: Rich Domain Entities](../../../docs/adr/0004-rich-domain-entities.md)
- [ADR-0005: Manual Dependency Injection](../../../docs/adr/0005-manual-dependency-injection.md)
- [ADR-0006: Filesystem-Only Storage Adapter in v1](../../../docs/adr/0006-fs-only-adapter-v1.md)
- [ADR-0015: Use-Case-Level Composition and Config Loading](../../../docs/adr/0015-use-case-level-composition.md)
