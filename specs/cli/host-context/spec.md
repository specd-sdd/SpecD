# CLI Host Context

## Purpose

Most CLI commands need a loaded `SpecdConfig`, config file path, and wired `Kernel`. `resolveCliContext` is the shared host bootstrap entry: it delegates to `openSpecdHost` from `@specd/sdk` and returns a stable `CliContext` so commands never duplicate config loading or kernel construction.

## Requirements

### Requirement: resolveCliContext delegates to openSpecdHost

`resolveCliContext` in `packages/cli/src/helpers/cli-context.ts` MUST obtain the host through the CLI host-opening helper (see **CLI host-opening helper**), which calls `openSpecdHost` from `@specd/sdk` with:

- `configPath` from caller options when provided
- `kernelOptions` derived from CLI-specific logging configuration (verbosity from argv, console log destination, optional callback destination)

It MUST return the opened host as `CliContext`: an `SdkHostContext` extended with `config` and `configFilePath`, so the result carries `kernel`, `createGraphProvider`, `dispose` and `[Symbol.asyncDispose]`.

When the loaded config contains warnings, CLI MUST treat `config.warnings` as the canonical bootstrap warning source. It MUST emit each warning at most once per `resolveCliContext` call and MUST NOT depend on a duplicate top-level `warnings` field on `OpenSpecdHostResult`.

### Requirement: CLI kernel options preservation

CLI-specific kernel wiring (verbosity-based log levels, TTY-aware console format, optional `onLog` callback destination) MUST remain in the CLI layer and MUST be passed through `openSpecdHost` input.

### Requirement: Host bootstrap entry point

CLI command handlers and helpers (except tests and the graph index worker) MUST obtain host context through `resolveCliContext` or the CLI host-opening helper for steady-state bootstrap. They MUST NOT call `openSpecdHost` or `createSdkContext` directly.

### Requirement: CLI host-opening helper

The CLI SHALL provide one host-opening helper in `packages/cli/src/helpers/` (referred to here as `openCliHost`) that wraps both SDK bootstrap forms: `openSpecdHost` (config discovery or forced file) and `createSdkContext` (config already resolved, used by graph helpers). Callers SHALL supply the CLI kernel options (`buildCliKernelOptions()`) in the input; the helper SHALL forward its input unchanged to the SDK bootstrap function and SHALL register the resulting host's `dispose` in the CLI cleanup registry before returning the host. Opening failures register nothing.

The CLI MUST NOT wrap a kernel it did not create into an `SdkHostContext`: `resolveSdkHostContext` and the hand-built `{ kernel, createGraphProvider }` object in `withProvider` are removed, and callers use the host that `resolveCliContext` or the helper returned.

### Requirement: CliContext exposes dispose

`CliContext` SHALL extend `SdkHostContext` with `config` and `configFilePath`. Its `dispose` and `[Symbol.asyncDispose]` SHALL be the host's idempotent disposal. Commands MAY call it but are not required to, because the cleanup registry guarantees that every host opened through the helper is released before the process exits.

### Requirement: CLI cleanup registry

The CLI SHALL provide a cleanup registry (`registerCliCleanup(fn)` and `runCliCleanup()`) in `packages/cli/src/helpers/`. `runCliCleanup()` SHALL run the registered cleanups in reverse registration order, awaiting each one, and SHALL be idempotent: a second or concurrent call returns the same promise and each cleanup runs at most once. A failing cleanup MUST NOT stop the others; its failure SHALL be reported on stderr as a `warning:` line and MUST NOT change the process exit code.

Once `runCliCleanup()` has started, a cleanup passed to `registerCliCleanup` SHALL be invoked immediately instead of being queued; its failure is reported as a `warning:` line like any other and MUST NOT change the exit code.

The entrypoint, not individual commands, SHALL trigger the registry on every exit path (see [`cli:entrypoint`](../entrypoint/spec.md)).

### Requirement: Graph index worker releases its host

`packages/cli/src/graph-index-task.ts` runs in its own process and SHALL NOT depend on the CLI cleanup registry. It SHALL dispose the host it opens, in a `finally` block, before the worker finishes, on success and on failure.

### Requirement: CLI package runtime dependencies

The `@specd/cli` package runtime dependencies MUST include `@specd/sdk` as the sole direct workspace dependency on specd platform packages (`@specd/core`, `@specd/code-graph`, `@specd/sdk`). Plugin and schema dependencies are unaffected. Core and code-graph symbols used by CLI code MUST be imported from `@specd/sdk` re-exports.

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery semantics consumed by host bootstrap; exit paths that trigger cleanup
- [`sdk:host-context`](../../sdk/host-context/spec.md) — `openSpecdHost`, `SdkHostContext` and `dispose`
- [`sdk:composition`](../../sdk/composition/spec.md) — SDK package boundary and re-exports
- [`core:kernel`](../../../../specs/core/kernel/spec.md) — disposal semantics (order, aggregation, timeout) inherited through the SDK host
