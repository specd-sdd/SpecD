# SDK With Open Graph Provider

## Purpose

Graph operations require an opened `CodeGraphProvider`, but hosts should not reimplement open/close/error cleanup in every command. This spec defines a shared lifecycle helper that opens a provider from an `SdkHostContext`, runs a callback, and closes on success or failure.

## Requirements

### Requirement: withOpenGraphProvider signature

`withOpenGraphProvider<T>(ctx: SdkHostContext, fn: (provider: CodeGraphProvider) => Promise<T>): Promise<T>` SHALL:

1. Call `ctx.createGraphProvider()` to obtain a provider
2. Call `provider.open()`
3. Invoke `fn(provider)` and return its result
4. Call `provider.close()` in a `finally` block after `fn` completes or throws

### Requirement: Error propagation

When `fn` throws, `withOpenGraphProvider` MUST still attempt `provider.close()`. Close failures during error cleanup MUST NOT mask the original error from `fn`. The original error MUST propagate to the caller.

### Requirement: No process exit side effects

Unlike CLI-specific `withProvider`, the SDK helper MUST NOT call `process.exit()`. Signal handling and forced exit semantics remain the responsibility of the host adapter (CLI change 12).

### Requirement: Optional beforeOpen hook

`withOpenGraphProvider` MAY accept an optional `beforeOpen` callback invoked after provider creation and before `open()`, for host-specific setup (e.g. lock acquisition in CLI). When omitted, the flow proceeds directly to `open()`.

## Spec Dependencies

- [`sdk:host-context`](../host-context/spec.md) — `SdkHostContext` and `createGraphProvider`
- [`code-graph:composition`](../../../../specs/code-graph/composition/spec.md) — `CodeGraphProvider` lifecycle methods
