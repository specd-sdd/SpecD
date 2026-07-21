# SDK Host Context

## Purpose

Hosts need one call that loads project config, builds the kernel, and exposes a graph-provider factory bound to the same resolved config. Without this, every adapter repeats `createConfigLoader` + `createKernel` + `createCodeGraphProvider` wiring and risks config drift between kernel and graph subsystems.

## Requirements

### Requirement: SdkHostContext shape

SdkHostContext SHALL be a readonly object:

```ts
interface SdkHostContext {
  readonly kernel: Kernel
  readonly createGraphProvider: () => CodeGraphProvider
}
```

The context MUST NOT store a duplicate copy of `SpecdConfig`. Config reads MUST go through `kernel.project.getConfig.execute()`.

The graph-provider factory MUST remain synchronous and MUST return a fresh `CodeGraphProvider` instance on every call.

### Requirement: createSdkContext

`createSdkContext(config: SpecdConfig, options?: SdkContextOptions): Promise<SdkHostContext>` SHALL:

1. Await `createKernel(config, options?.kernel)` from `@specd/core`
2. Return `{ kernel, createGraphProvider: () => createCodeGraphProvider(config, options?.graph) }`

`SdkContextOptions` SHALL be an SDK-owned bootstrap shape:

```ts
interface SdkContextOptions {
  readonly kernel?: KernelOptions
  readonly graph?: CodeGraphCompositionOptions
}
```

`createGraphProvider` MUST close over the same `config` instance passed to `createKernel`.

When `options?.graph` is omitted, `createGraphProvider()` MUST preserve the default `@specd/code-graph` composition behavior.

### Requirement: openSpecdHost

`openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult>` SHALL:

1. Reject any call that provides both `input.configPath` and `input.startDir`, because forced-file bootstrap and discovery-root bootstrap are distinct modes and the caller MUST choose one explicitly
2. Use `createDefaultConfigLoader()` to load config:
   - `input.configPath` maps to loader forced mode when provided
   - otherwise `input.startDir` maps to loader discovery mode when provided
   - otherwise discovery mode starts from `process.cwd()`
3. Await `createSdkContext(config, input.options)`
4. Return `{ config, configFilePath, ...ctx }` where `configFilePath` is the absolute path to the loaded `specd.yaml`, or `null` when not locatable

Configuration warnings exposed through `SpecdConfig.warnings` SHALL remain attached to `config`; `openSpecdHost` MUST NOT duplicate them as a top-level result field.

`OpenSpecdHostInput` MAY include optional `startDir` for host-selected discovery roots, and MAY include `options?: SdkContextOptions` so the same kernel and graph composition options are available through both host bootstrap entry points.

`OpenSpecdHostInput` SHALL also support `allowBootstrapFallback?: boolean`, defaulting to `false`. When it is `true` and discovery from `startDir` (or `process.cwd()`) finds no configuration, `openSpecdHost` SHALL resolve the VCS root and construct a synthetic graph-capable configuration for that root. It MUST preserve the normal error when no VCS root can be resolved, and it MUST NOT apply this fallback to an explicit `configPath` request.

### Requirement: Config mutation boundary

Host context bootstrap MUST NOT perform config file writes. `initProject`, `addPlugin`, and `removePlugin` remain on `createConfigWriter()` — not on `SdkHostContext` or `kernel.project`.

### Requirement: Studio host bootstrap

Delivery hosts that bootstrap project-local kernels SHALL compose through
`createSdkContext` instead of calling `createKernel` from `@specd/core`
directly.

At minimum:

- `createApiServer` MUST create one SDK host context per process bootstrap and
  derive request handling from that shared context
- desktop main-process local project bootstrap MUST call `createSdkContext`
  when opening a project and MUST NOT import `createKernel` directly for that
  host path

This keeps API and desktop host wiring aligned on the same kernel plus
graph-provider composition contract.

## Spec Dependencies

- [`sdk:composition`](../composition/spec.md) — package placement and export surface
- [`core:kernel`](../../../../specs/core/kernel/spec.md) — `Kernel` type and `createKernel`
- [`core:composition`](../../../../specs/core/composition/spec.md) — `createDefaultConfigLoader` factory
- [`code-graph:composition`](../../../../specs/code-graph/composition/spec.md) — `CodeGraphCompositionOptions` and `createCodeGraphProvider(...)`
