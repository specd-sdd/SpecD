# Composition Layer

## Overview

The `composition/` layer in `@specd/core` is the only layer permitted to import from `infrastructure/`. It exposes three levels of factory: use-case factories that wire ports internally, a kernel that builds all use cases from a resolved config object, and a config loader port that abstracts config sources. Delivery mechanisms (CLI, MCP) interact exclusively with this layer — they never import ports, infrastructure adapters, or use case constructors directly.

## Requirements

### Requirement: Use-case factories are the unit of composition

The composition layer exposes one factory function per use case (e.g. `createArchiveChange`, `createCompileContext`). Each factory constructs all ports the use case requires and returns the pre-wired use case instance. Use case constructors are not exported from `index.ts` — callers always go through the factory.

### Requirement: Use-case factories accept SpecdConfig or explicit options

Every use-case factory supports two call signatures:

- `createArchiveChange(config: SpecdConfig)` — extracts all required values from a fully resolved config object
- `createArchiveChange(context: ArchiveChangeContext, options: FsArchiveChangeOptions)` — accepts domain context and adapter options explicitly

Both signatures are public exports. The explicit form is used in tests and in scenarios where only a subset of the config is available. The `SpecdConfig` form is used by the kernel and by delivery mechanisms that have already loaded config.

### Requirement: Internal ports are never exported

Port implementations that have a single concrete class and no caller-visible configuration — `NodeHookRunner`, `GitCLIAdapter`, `FsFileReader` — are constructed inside use-case factories and never appear in any public export. Repository-level factories (`createSpecRepository`, `createChangeRepository`, `createArchiveRepository`) are also internal to the composition layer.

### Requirement: Kernel builds all use cases from SpecdConfig

`createKernel(config: SpecdConfig)` calls every use-case factory with the given config and returns an object containing all pre-wired use cases. The kernel object groups use cases by domain area:

```typescript
const kernel = createKernel(config)
kernel.changes.archive // ArchiveChange
kernel.changes.create // CreateChange
kernel.specs.approve // ApproveSpec
// …
```

The kernel is a convenience — it is not the mandatory entry point. Callers that need a single use case call its factory directly.

### Requirement: ConfigLoader is an application port

`ConfigLoader` is defined in `application/ports/config-loader.ts` as an interface. It has a single method `load(): Promise<SpecdConfig>`. The `FsConfigLoader` implementation reads `specd.yaml` and `specd.local.yaml`, with local values taking precedence. Future implementations (`EnvConfigLoader`, `CompositeConfigLoader`) add new config sources without touching the kernel or any delivery layer.

### Requirement: SpecdConfig is a plain typed object

`SpecdConfig` is a plain TypeScript interface with no methods. It represents the fully resolved configuration for a project. The kernel and use-case factories accept it but do not know how it was produced. `SpecdConfig` is defined in `domain/` or `application/` — not in `infrastructure/` or `composition/`.

## Constraints

- `composition/` is the only directory in `@specd/core` permitted to import from `infrastructure/`
- Concrete adapter classes (`FsSpecRepository`, `NodeHookRunner`, `GitCLIAdapter`, `FsFileReader`, `FsSchemaRegistry`, etc.) must not appear in `src/index.ts` or any re-export chain
- Repository-level factories (`createSpecRepository`, `createChangeRepository`, `createArchiveRepository`) must not appear in `src/index.ts`
- Use-case factories and the kernel are the only composition exports in `src/index.ts`
- `ConfigLoader` implementations live in `infrastructure/`; the port interface lives in `application/ports/`
- The kernel groups use cases under domain-area namespaces — use cases are not properties at the top level of the kernel object
- Both call signatures of every use-case factory must be public exports

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)

## ADRs

- [ADR-0015: Use-Case-Level Composition and Config Loading](../../../docs/adr/0015-use-case-level-composition.md)
