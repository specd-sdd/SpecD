# GetConfig

## Purpose

Delivery hosts (CLI, SDK, API, MCP) that receive a wired `Kernel` need to read the project configuration snapshot the kernel was built from without maintaining a parallel `SpecdConfig` in host context. `GetConfig` exposes that snapshot as a host-facing, read-only view. It does not re-read `specd.yaml` from disk and does not replace internal use cases that retain the live configuration reference for composition wiring.

## Requirements

### Requirement: Constructor captures construction-time config

`GetConfig` MUST accept a `SpecdConfig` in its constructor — the same object passed to `createKernel` at kernel construction time.

The constructor MUST store `structuredClone(config)` as an internal snapshot. The live reference passed to other kernel use cases MUST NOT be returned from `execute()`.

### Requirement: execute returns a parameterless host snapshot

`GetConfig.execute()` MUST accept no input parameters.

On success, `execute()` MUST return `Readonly<SpecdConfig>` representing the construction-time snapshot.

The returned object MUST be referentially identical across multiple `execute()` calls on the same `GetConfig` instance.

### Requirement: No disk I/O

`GetConfig` MUST NOT read from the filesystem, invoke `ConfigLoader`, or invoke `ConfigWriter`.

If `specd.yaml` changes on disk after kernel creation, hosts MUST recreate the kernel to observe the new configuration.

### Requirement: Host read path only

`GetConfig` is a host-facing read API. It MUST NOT be used by domain use cases to re-inject full project configuration into other use case `execute` inputs.

Persisting configuration changes to `specd.yaml` MUST go through `ConfigWriter` composition factories, not through mutation of the object returned by `GetConfig`.

### Requirement: Standalone factory

`createGetConfig(config: SpecdConfig)` in `composition/use-cases/` MUST construct and return a `GetConfig` instance without requiring a full kernel.

### Requirement: Config-based factory delegates through resolveGetConfigDeps

The config-based `createGetConfig(config, options?)` form MUST derive `GetConfigDeps` through `resolveGetConfigDeps(resolver)` and then delegate to canonical `createGetConfig(deps)`.

`resolveGetConfigDeps(resolver)` MUST resolve:

- `config: SpecdConfig`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST NOT mutate the internal snapshot after construction.
- The use case MUST NOT expose the live `SpecdConfig` reference used by internal kernel wiring (e.g. `ListWorkspaces`).

## Spec Dependencies

- [`core:config`](../config/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
