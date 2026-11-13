# SDK Host Context

## Purpose

Hosts need one call that loads project config, builds the kernel, and exposes a graph-provider factory bound to the same resolved config. Without this, every adapter repeats `createConfigLoader` + `createKernel` + `createCodeGraphProvider` wiring and risks config drift between kernel and graph subsystems.

## Requirements

### Requirement: SdkHostContext shape

SdkHostContext SHALL be a readonly object that also implements `AsyncDisposable`:

```ts
interface SdkHostContext extends AsyncDisposable {
  readonly kernel: Kernel
  readonly createGraphProvider: () => CodeGraphProvider
  readonly dispose: () => Promise<void>
}
```

The context MUST NOT store a duplicate copy of `SpecdConfig`. Config reads MUST go through `kernel.project.getConfig.execute()`.

The graph-provider factory MUST remain synchronous and MUST return a fresh `CodeGraphProvider` instance on every call.

### Requirement: createSdkContext

`createSdkContext(config: SpecdConfig, options?: SdkContextOptions): Promise<SdkHostContext>` SHALL:

1. Create a kernel builder from `config` and `options?.kernel` (`createKernelBuilder` from `@specd/core/extensions`). The builder MUST preserve every `KernelOptions` field of `options?.kernel`, including `additionalDestinations`, so log destinations supplied by the host (such as a callback destination) reach the kernel logger exactly as with direct kernel creation
2. Unless `options?.plugins === false`, await `registerPlugins(builder, config, { handlers })` from `@specd/plugin-manager` before building, where `handlers` are the handlers owned by plugin-manager plus `options?.pluginHandlers`
3. Await `builder.build()` to obtain the kernel
4. If `builder.build()` rejects, dispose the registration and rethrow the build error. If that disposal also throws, the build error MUST still be the error that propagates, and the disposal errors are attached to it as `rollbackErrors`; they MUST NOT replace it. A build error that cannot carry properties (a primitive, `null`, or a frozen or non-extensible object) still propagates unchanged and the disposal errors are reported through the ambient logger at `warn`; when no logger implementation has been configured yet they are not emitted
5. Return `{ kernel, createGraphProvider: () => createCodeGraphProvider(config, options?.graph), dispose, [Symbol.asyncDispose]: dispose }`, where `dispose` delegates to `kernel.dispose()`

`SdkContextOptions` SHALL be an SDK-owned bootstrap shape:

```ts
interface SdkContextOptions {
  readonly kernel?: KernelOptions
  readonly graph?: CodeGraphCompositionOptions
  /** Load and register configured plugins. Default `true`. `false` skips loading, `init` and the disposer. */
  readonly plugins?: boolean
  /** Additional contribution kind handlers supplied by the host. */
  readonly pluginHandlers?: readonly ContributionKindHandler[]
}
```

Plugin registration MUST happen in `createSdkContext`, not in `openSpecdHost`, which delegates to it. A failure while registering plugins MUST fail `createSdkContext` with the typed error naming the plugin, and no kernel is returned.

`createGraphProvider` MUST close over the same `config` instance passed to the kernel builder.

When `options?.graph` is omitted, `createGraphProvider()` MUST preserve the default `@specd/code-graph` composition behavior.

Hosts that must stay operational with a broken plugin, or that do not need plugins (the isolated graph-index worker and the `plugins *` management commands), MUST pass `plugins: false`.

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

### Requirement: Host disposal

`SdkHostContext.dispose()` SHALL delegate to `kernel.dispose()` and return its promise, so repeated and concurrent calls share one disposal and inherit the semantics defined by [`core:kernel`](../../core/kernel/spec.md) (reverse order, failure isolation with `AggregateError`, bounded timeout). The plugin cleanup registered by `registerPlugins` is one of those disposers, so `dispose()` runs each plugin's `destroy` in reverse order. `[Symbol.asyncDispose]` SHALL be the same function as `dispose`.

Because `openSpecdHost` spreads the context into its result, `OpenSpecdHostResult` SHALL carry `dispose` and `[Symbol.asyncDispose]`, and `await using host = await openSpecdHost(input)` SHALL release the host when the scope exits.

`dispose()` MUST NOT close `CodeGraphProvider` instances created through `createGraphProvider()`: callers own what they create and release it themselves (for example with `withOpenGraphProvider`).

A context SHALL only dispose a kernel it created. The SDK MUST NOT expose an API that wraps a kernel created elsewhere into an `SdkHostContext`.

### Requirement: Config mutation boundary

Host context bootstrap MUST NOT perform config file writes. `initProject`, `addPlugin`, and `removePlugin` remain on `createConfigWriter()` — not on `SdkHostContext` or `kernel.project`.

## Spec Dependencies

- [`sdk:composition`](../composition/spec.md) — package placement and export surface
- [`core:kernel`](../../core/kernel/spec.md) — `Kernel` type and `dispose()`
- [`core:kernel-builder`](../../core/kernel-builder/spec.md) — builder creation, `registerDisposer` and `build()`
- [`core:composition`](../../core/composition/spec.md) — `createDefaultConfigLoader` factory
- [`code-graph:composition`](../../code-graph/composition/spec.md) — `CodeGraphCompositionOptions` and `createCodeGraphProvider(...)`
- [`plugin-manager:register-plugins-use-case`](../../plugin-manager/register-plugins-use-case/spec.md) — plugin loading, `init` and `destroy`
- [`plugin-manager:plugin-errors`](../../plugin-manager/plugin-errors/spec.md) — typed errors surfaced when plugin registration fails
