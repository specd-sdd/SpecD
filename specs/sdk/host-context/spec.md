# SDK Host Context

## Purpose

Hosts need one call that loads project config, builds the kernel, and exposes a graph-provider factory bound to the same resolved config. Without this, every adapter repeats `createConfigLoader` + `createKernel` + `createCodeGraphProvider` wiring and risks config drift between kernel and graph subsystems.

## Requirements

### Requirement: SdkHostContext shape

`SdkHostContext` SHALL be a readonly object:

```typescript
interface SdkHostContext {
  readonly kernel: Kernel
  readonly createGraphProvider: () => CodeGraphProvider
}
```

The context MUST NOT store a duplicate copy of `SpecdConfig`. Config reads MUST go through `kernel.project.getConfig.execute()`.

### Requirement: createSdkContext

`createSdkContext(config: SpecdConfig, options?: KernelOptions): Promise<SdkHostContext>` SHALL:

1. Await `createKernel(config, options)` from `@specd/core`
2. Return `{ kernel, createGraphProvider: () => createCodeGraphProvider(config) }`

`createGraphProvider` MUST close over the same `config` instance passed to `createKernel`. Each call to `createGraphProvider()` MUST return a new `CodeGraphProvider` instance (not a shared singleton).

### Requirement: openSpecdHost

`openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult>` SHALL:

1. Use `createConfigLoader()` to load config — `input.configPath` maps to loader forced mode when provided; otherwise discovery mode from `process.cwd()`
2. Await `createSdkContext(config, input.kernelOptions)`
3. Return `{ config, configFilePath, ...ctx }` where `configFilePath` is the absolute path to the loaded `specd.yaml`, or `null` when not locatable

`OpenSpecdHostInput` MAY include optional `kernelOptions` for host-specific logging or kernel overrides (e.g. CLI log destinations).

### Requirement: Config mutation boundary

Host context bootstrap MUST NOT perform config file writes. `initProject`, `addPlugin`, and `removePlugin` remain on `createConfigWriter()` — not on `SdkHostContext` or `kernel.project`.

### Requirement: Studio host bootstrap

`@specd/api` and the Electron desktop main process MUST obtain their process-scoped kernel and `createGraphProvider` factory through `createSdkContext` (or `openSpecdHost`) from `@specd/sdk`.

API server state (`ApiServerState`) and per-request API context (`ApiContext`) MAY extend `SdkHostContext` with host-specific fields (for example resolved `SpecdConfig`, auth type, and request actor) but MUST NOT construct a parallel kernel or graph provider outside the SDK bootstrap path.

## Spec Dependencies

- [`sdk:composition`](../composition/spec.md) — package placement and export surface
- [`core:kernel`](../../../../specs/core/kernel/spec.md) — `Kernel` type constructed inside `createSdkContext`
- [`core:composition`](../../../../specs/core/composition/spec.md) — config loader factory used by `openSpecdHost`
