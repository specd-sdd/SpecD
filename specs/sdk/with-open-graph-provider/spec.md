# SDK With Open Graph Provider

## Purpose

Graph operations require an opened `CodeGraphProvider`, but hosts should not reimplement open/close/error cleanup in every command. This spec defines a shared lifecycle helper that opens a provider from an `SdkHostContext`, runs a callback, and closes on success or failure.

## Requirements

### Requirement: withOpenGraphProvider signature

`withOpenGraphProvider<T>(ctx: SdkHostContext, fn: (provider:
CodeGraphProvider) => Promise<T>, options?: WithOpenGraphProviderOptions):
Promise<T>` SHALL create a provider, run `beforeOpen` after creation, call
parameterless `provider.open()`, invoke `fn`, close the provider, and then run
`afterClose` under the existing ordering and error rules.

`WithOpenGraphProviderOptions` retains `beforeOpen?: (provider:
CodeGraphProvider) => Promise<void>` and `afterClose?: (provider:
CodeGraphProvider) => Promise<void>`.

`WithOpenGraphProviderOptions` SHALL additionally support an optional generic
`recoverOpenFailure(error, provider): Promise<boolean>` callback. Following an
initial open failure, the helper MUST first attempt `provider.close()`, then invoke
the callback with that closed provider and the original error. If the callback
resolves `true`, the helper SHALL retry `provider.open()` exactly once; it MUST NOT
call the callback again for a failed retry. A false result preserves the original
error. This option does not alter the `CodeGraphProvider.open()` contract.

### Requirement: Error propagation

When `fn` throws, the helper MUST attempt close without masking the original error.
When initial open fails, it MUST close before optional recovery. A recovery callback
failure or a retry-open failure is terminal; `afterClose` still runs after final
cleanup. The helper MUST never retry implicitly, swallow non-recoverable errors, or
call `process.exit()`.

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
