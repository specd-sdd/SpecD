# plugin-manager:register-plugins-use-case

## Purpose

Hosts need one call that turns the `plugins` list of `specd.yaml` into running plugins: loaded, validated, initialized, with their contributions registered on the kernel builder and their cleanup tied to the kernel's disposal. Without it every host would reimplement ordering, error isolation and partial-failure cleanup. `registerPlugins` is that single entry; it is the runtime lifecycle of plugins.

## Requirements

### Requirement: Signature

```typescript
function registerPlugins(
  builder: KernelBuilder,
  config: SpecdConfig,
  input?: RegisterPluginsInput,
): Promise<PluginRegistration>

interface PluginRegistration {
  /** Destroys the initialized plugins in reverse order. Idempotent; the same function is registered as the builder disposer. */
  readonly dispose: () => Promise<void>
}

interface RegisterPluginsInput {
  /** Handlers for contribution kinds supplied by the owners of each kind; defaults to none (the built-in `agents` handler is always present). */
  readonly handlers?: readonly ContributionKindHandler[]
  /** Loader used to resolve plugins; defaults to the standard plugin loader. */
  readonly loader?: PluginLoader
}
```

`RegisterPluginsInput` MUST be exported by name from the package public surface. The `input` argument defaults to `{}`. The built-in `agents` handler is always registered first. If two handlers (including a host-supplied handler for `agents`) declare the same `kind`, `registerPlugins` MUST reject its returned promise with `DuplicateHandlerKindError` when it is set up, before loading any plugin. `registerPlugins` MUST NOT throw synchronously: every failure, including this one and including the case where the caller supplies its own `loader`, is reported as a rejection of the returned promise.

`registerPlugins` MUST be called before `builder.build()`. It MUST return only after every configured plugin has been initialized and every contribution registered. The returned `dispose` lets a caller whose later step fails (for example `builder.build()` rejecting) tear the plugins down without a kernel. With no configured plugins it returns a registration whose `dispose` is a no-op. A second `dispose()` call, concurrent or later, returns the outcome of the first: while the first is in flight both callers await the same promise and see the same error.

### Requirement: Registration order

For the configured `plugins` list, `registerPlugins` MUST:

1. Load and validate every plugin (manifest, config, contribution allowlist) before running any `init`, so an invalid plugin fails startup before any `init` runs. Loading a plugin imports its code and runs its `create()` factory (never `init`); the factories of earlier plugins therefore run before a later plugin is found invalid, which is permitted because a factory MUST NOT cause side effects
2. Call `init` on every plugin, in list order, with a `PluginContext` (`config`, validated `pluginConfig`)
3. For each plugin and each selected contribution, dispatch to the handler of its kind; handlers without `activate` are skipped
4. Register ONE named disposer on the builder (`registerDisposer`) that runs plugin cleanup when the kernel is disposed

`init` is called for every configured plugin of any kind, with configuration only. A contribution that is not in the plugin's `contributions` allowlist MUST NOT be activated.

### Requirement: Selection and config validation

For each configured entry:

- `contributions` absent selects every contribution declared in the manifest; present selects exactly those ids, and an id not declared by the manifest MUST raise `UnknownContributionError`
- `config` MUST be validated against the manifest `configSchema` with defaults applied; failure raises `InvalidPluginConfigError`
- `config` provided for a plugin without `configSchema` MUST raise `InvalidPluginConfigError`
- A plugin name appearing twice in the list MUST raise `PluginValidationError`

### Requirement: Destroy and error isolation

The registered disposer MUST call `destroy` on every successfully initialized plugin in reverse list order. An error thrown by one `destroy` MUST NOT prevent the remaining `destroy` calls; the errors MUST be aggregated into one `PluginDestroyError` (a `SpecdError`, never a plain `AggregateError`) whose `errors` lists every failure in destroy order, and reported once after all calls ran. The disposer MUST be idempotent.

### Requirement: Failure policy

Any failure to load, validate or initialize a plugin MUST fail `registerPlugins` with a typed error naming the plugin. A throwing `init` is reported as follows: a `SpecdError` thrown by `init` propagates unchanged; any other error is wrapped in `PluginInitError` (with the original as `cause`). A failure of a contribution handler's `activate` is wrapped the same way and triggers the same rollback. When an `init` or `activate` fails, the plugins already initialized MUST be destroyed in reverse order before the error propagates, and no disposer remains registered. A caller-supplied `loader` that rejects with something other than a `SpecdError` is wrapped in `PluginValidationError` (`fields: ['load']`) naming the plugin, with the original as `cause`; a `SpecdError` from the loader propagates unchanged. A loader that resolves to something that is not `{ plugin, manifest }` is a load failure of the same kind (`fields: ['load']`). If `builder.registerDisposer` itself throws, the failure is a `PluginInitError` naming the configured plugins joined by `, ` (never an empty name), raised after the rollback of the initialized plugins. There is no per-plugin tolerance: a broken configured plugin fails startup. If destroying the already-initialized plugins during this rollback itself fails, the original typed error (the unchanged `SpecdError`, the `PluginInitError` or the validation error) MUST still be the error that propagates; rollback failures MUST NOT replace it and are attached to it as a `rollbackErrors` property; when the original error cannot carry properties (frozen or non-extensible) it still propagates unchanged and the rollback failures are logged at `warn`.

### Requirement: Bypass

`registerPlugins` is not called when the host disabled plugins (`plugins: false` in the SDK options). In that case no plugin is loaded, no `init` is called and no disposer is registered. An empty or absent `plugins` list MUST register nothing and no disposer. The handler merge (built-in first, duplicate kinds rejected) runs before this empty-list short-circuit, so a host wiring error (`DuplicateHandlerKindError`) is reported even when no plugin is configured.

## Constraints

- Plugin code is imported only after its manifest is validated; the plugin `config` and the `contributions` allowlist are validated before `init` is called on any plugin.
- `registerPlugins` depends on `KernelBuilder` (core) and MUST NOT import infrastructure of other packages.
- Handlers for kinds other than those owned by plugin-manager are supplied by the caller through `input.handlers`.
- The handler list is merged (built-in first, duplicate kinds rejected) by one shared routine used by both the loader and `registerPlugins`; when `registerPlugins` creates the default loader the routine runs in both places with identical inputs and results, which is permitted.
- Registering plugins does not change workflow state and does not write to disk.

## Spec Dependencies

- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — plugin contract, manifest and kind handlers
- [`plugin-manager:plugin-loader`](../plugin-loader/spec.md) — loads and validates plugins
- [`plugin-manager:plugin-errors`](../plugin-errors/spec.md) — typed errors
- [`core:kernel-builder`](../../core/kernel-builder/spec.md) — registration surface and disposer
- [`core:config`](../../core/config/spec.md) — plugins list
