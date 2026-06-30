# CLI Host Context

## Purpose

Most CLI commands need a loaded `SpecdConfig`, config file path, and wired `Kernel`. `resolveCliContext` is the shared host bootstrap entry: it delegates to `openSpecdHost` from `@specd/sdk` and returns a stable `CliContext` so commands never duplicate config loading or kernel construction.

## Requirements

### Requirement: resolveCliContext delegates to openSpecdHost

`resolveCliContext` in `packages/cli/src/helpers/cli-context.ts` MUST call `openSpecdHost` from `@specd/sdk` with:

- `configPath` from caller options when provided
- `kernelOptions` derived from CLI-specific logging configuration (verbosity from argv, console log destination, optional callback destination)

It MUST return `{ config, configFilePath, kernel }` as `CliContext`.

### Requirement: CLI kernel options preservation

CLI-specific kernel wiring (verbosity-based log levels, TTY-aware console format, optional `onLog` callback destination) MUST remain in the CLI layer and MUST be passed through `openSpecdHost` input.

### Requirement: Host bootstrap entry point

CLI command handlers and helpers (except tests) MUST obtain host context through `resolveCliContext` or `openSpecdHost` for steady-state bootstrap.

### Requirement: CLI package runtime dependencies

The `@specd/cli` package runtime dependencies MUST include `@specd/sdk` as the sole direct workspace dependency on specd platform packages (`@specd/core`, `@specd/code-graph`, `@specd/sdk`). Plugin and schema dependencies are unaffected. Core and code-graph symbols used by CLI code MUST be imported from `@specd/sdk` re-exports.

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery semantics consumed by host bootstrap
- [`sdk:host-context`](../../sdk/host-context/spec.md) — `openSpecdHost` and `SdkHostContext`
- [`sdk:composition`](../../sdk/composition/spec.md) — SDK package boundary and re-exports
