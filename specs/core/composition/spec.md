# Composition Layer

## Purpose

Delivery mechanisms must not know how ports, adapters, and use cases are wired together, yet something needs to assemble these pieces. The `composition/` layer in `@specd/core` serves this role as the only layer permitted to import from `infrastructure/`, exposing three levels of factory: use-case factories that wire ports internally, a kernel that builds all use cases from a resolved config object, and a config loader port that abstracts config sources. CLI, MCP, and plugin adapters interact exclusively with this layer.

## Requirements

### Requirement: Use-case factories are the unit of composition

The composition layer exposes one factory function per use case (e.g. `createArchiveChange`, `createCompileContext`). Each factory constructs all ports the use case requires and returns the pre-wired use case instance. Use case constructors are not exported from `index.ts` — callers always go through the factory.

### Requirement: Use-case factories accept SpecdConfig or explicit options

Every use-case factory supports two call signatures:

- `createArchiveChange(config: SpecdConfig)` — extracts all required values from a fully resolved config object
- `createArchiveChange(context: ArchiveChangeContext, options: FsArchiveChangeOptions)` — accepts domain context and adapter options explicitly

Both signatures are public exports. The explicit form is used in tests and in scenarios where only a subset of the config is available. The `SpecdConfig` form is used by the kernel and by delivery mechanisms that have already loaded config.

### Requirement: Internal ports are never exported

Port implementations that have a single concrete class and no caller-visible configuration — `NodeHookRunner`, `GitVcsAdapter`, `FsFileReader` — are constructed inside use-case factories and never appear in any public export. Repository-level factories (`createSpecRepository`, `createChangeRepository`, `createArchiveRepository`) are also internal to the composition layer.

### Requirement: Use-case factories must use auto-detect for VCS-dependent adapters

Standalone use-case factories that need an `ActorResolver` must call `createVcsActorResolver()` instead of constructing a specific implementation (e.g. `new GitActorResolver()`). The auto-detect chain (git → hg → svn → null) ensures the correct implementation is selected based on the project's actual VCS.

The same applies to any factory that needs a `VcsAdapter` — it must call `createVcsAdapter()`.

### Requirement: FsChangeRepository options include artifact type resolution

`FsChangeRepositoryOptions` accepts two optional fields for artifact sync:

- **`artifactTypes`** (`readonly ArtifactType[]`, optional) — resolved artifact types from the active schema. When provided, the repository uses these directly for `syncArtifacts` on every `get()` and `save()`.
- **`resolveArtifactTypes`** (`() => Promise<readonly ArtifactType[]>`, optional) — async resolver for artifact types. Used when artifact types aren't known at construction time (e.g. kernel-level repo created before schema is resolved). Resolved lazily on first use and cached thereafter.

At least one of these should be provided; if neither is available, artifact sync is a no-op (empty artifact types array).

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

### Requirement: Composition layer exposes a kernel builder

The composition layer SHALL expose a fluent kernel builder entry point in addition to `createKernel(config, options)`. The builder SHALL accumulate the same additive registrations supported by `KernelOptions` and SHALL build kernels with behavior equivalent to the lower-level construction path.

The builder is part of the public composition surface. It MUST NOT introduce a second, incompatible extensibility model.

### Requirement: ConfigLoader is an application port

`ConfigLoader` is defined in `application/ports/config-loader.ts` as an interface. It has a single method `load(): Promise<SpecdConfig>`. The `FsConfigLoader` implementation reads `specd.yaml` and `specd.local.yaml`, with local values taking precedence. Future implementations (`EnvConfigLoader`, `CompositeConfigLoader`) add new config sources without touching the kernel or any delivery layer.

### Requirement: SpecdConfig is a plain typed object

`SpecdConfig` is a plain TypeScript interface with no methods. It represents the fully resolved configuration for a project. The kernel and use-case factories accept it but do not know how it was produced. `SpecdConfig` is defined in `domain/` or `application/` — not in `infrastructure/` or `composition/`.

`SpecdConfig` includes the following fields relevant to schema customisation:

- `schemaPlugins` (`readonly string[]`, optional) — schema-plugin references in declaration order
- `schemaOverrides` (`SchemaOperations | undefined`, optional) — inline merge operations

The fields `artifactRules` and `workflow` (project-level hook additions) are no longer part of `SpecdConfig` — they have been replaced by `schemaOverrides`.

### Requirement: ResolveSchema factory wiring

`createResolveSchema(config: SpecdConfig)` must construct a `ResolveSchema` use case with:

- The `SchemaRegistry` adapter
- `config.schema` as the schema reference
- The resolved workspace schemas paths map
- `config.schemaPlugins` (defaulting to `[]` if absent)
- `config.schemaOverrides` (defaulting to `undefined` if absent)

`createGetActiveSchema(config: SpecdConfig)` must construct `GetActiveSchema` with a `ResolveSchema` instance from `createResolveSchema(config)`.

## Constraints

- `composition/` is the only directory in `@specd/core` permitted to import from `infrastructure/`
- Concrete adapter classes (`FsSpecRepository`, `NodeHookRunner`, `GitVcsAdapter`, `FsFileReader`, `FsSchemaRegistry`, etc.) must not appear in `src/index.ts` or any re-export chain
- Repository-level factories (`createSpecRepository`, `createChangeRepository`, `createArchiveRepository`) must not appear in `src/index.ts`
- Use-case factories and the kernel are the only composition exports in `src/index.ts`
- `ConfigLoader` implementations live in `infrastructure/`; the port interface lives in `application/ports/`
- The kernel groups use cases under domain-area namespaces — use cases are not properties at the top level of the kernel object
- Both call signatures of every use-case factory must be public exports

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
- [`specs/core/resolve-schema/spec.md`](../resolve-schema/spec.md) — `ResolveSchema` use case wiring

## ADRs

- [ADR-0015: Use-Case-Level Composition and Config Loading](../../../docs/adr/0015-use-case-level-composition.md)
