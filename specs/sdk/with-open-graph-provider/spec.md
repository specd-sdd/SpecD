# SDK With Open Graph Provider

## Purpose

Graph operations require an opened `CodeGraphProvider`, but hosts should not reimplement open/close/error cleanup in every command. This spec defines a shared lifecycle helper that opens a provider from an `SdkHostContext`, runs a callback, and closes on success or failure.

## Requirements

### Requirement: withOpenGraphProvider signature

`withOpenGraphProvider<T>(ctx: SdkHostContext, fn: (provider: CodeGraphProvider) => Promise<T>, options?: WithOpenGraphProviderOptions): Promise<T>` SHALL:

1. Call `ctx.createGraphProvider()` to obtain a provider
2. If `options.beforeOpen` is provided, await it after provider creation and before `provider.open()`
3. Call `provider.open()`
4. Invoke `fn(provider)` and return its result
5. Call `provider.close()` after `fn` completes or throws
6. If `options.afterClose` is provided, await it after the helper finishes its close path, including error cleanup paths

`WithOpenGraphProviderOptions` SHALL support:

```ts
interface WithOpenGraphProviderOptions {
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>
}
```

### Requirement: Error propagation

When `fn` throws, `withOpenGraphProvider` MUST still attempt `provider.close()`. Close failures during error cleanup MUST NOT mask the original error from `fn`. The original error MUST propagate to the caller.

When `beforeOpen` succeeds but `provider.open()` later fails, the helper MUST still run the close/cleanup path and MUST still invoke `afterClose` after that cleanup attempt.

When `fn` succeeds and the primary `close()` path fails, the close failure MAY propagate to the caller. When `afterClose` fails after a successful operation, that cleanup failure MAY propagate as the terminal helper failure.

### Requirement: No process exit side effects

Unlike CLI-specific `withProvider`, the SDK helper MUST NOT call `process.exit()`. Signal handling and forced exit semantics remain the responsibility of the host adapter (CLI change 12).

### Requirement: Optional beforeOpen hook

`withOpenGraphProvider` MAY accept optional lifecycle hooks invoked around `open()` and `close()` for host-specific setup and teardown.

`beforeOpen` is invoked after provider creation and before `open()`.

`afterClose` is invoked after the helper has attempted to close the provider, regardless of whether the operation succeeded, threw, or failed during `open()` after `beforeOpen` had already run.

These hooks exist for host-local orchestration concerns; they MUST NOT change the underlying `CodeGraphProvider` contract, which remains directly usable by long-lived hosts without this helper.

## Spec Dependencies

- [`sdk:host-context`](../host-context/spec.md) — `SdkHostContext` and `createGraphProvider`
- [`code-graph:composition`](../../../../specs/code-graph/composition/spec.md) — `CodeGraphProvider` lifecycle methods
