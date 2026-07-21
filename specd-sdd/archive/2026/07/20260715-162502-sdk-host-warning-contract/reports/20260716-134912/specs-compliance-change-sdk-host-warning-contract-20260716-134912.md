# Specs Compliance Report

- Mode: `--change sdk-host-warning-contract`
- Generated: `2026-07-16 13:49:12`
- Change path: `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260715-162502-sdk-host-warning-contract`
- Graph freshness: fresh (`lastIndexedAt: 2026-07-16T10:19:31.894Z`, `stale: false`)

## Scope

- Change specs:
  - `sdk:host-context`
  - `cli:host-context`
  - `core:config`
- Direct dependencies reviewed for consistency:
  - `sdk:composition`
  - `core:kernel`
  - `core:composition`
  - `cli:entrypoint`
  - `core:vcs-adapter-port`
  - `default:_global/architecture`
- Project-wide constraints reviewed:
  - `default:_global/conventions`
  - `default:_global/docs`
  - `default:_global/error-handling-conventions`
  - `default:_global/eslint`
  - `default:_global/logging`
  - `default:_global/spec-layout`
  - `default:_global/testing`

## Summary

- Findings: `0`
- Drift detected: `0`
- Test gaps detected: `0` for the changed contract surface
- Overall status: `clean`

## Detailed Findings

### sdk:host-context

Status: `pass`

Evidence:

- `packages/sdk/src/composition/host-context.ts` defines `SdkHostContext` as `{ kernel, createGraphProvider }` with no config duplication or write methods.
- `createSdkContext` awaits `createKernel(config, options)` and returns a provider factory that closes over the same `config` reference.
- `openSpecdHost` rejects mixed `configPath` + `startDir`, uses `createDefaultConfigLoader` in the correct mode, forwards `kernelOptions`, resolves `configFilePath`, and preserves warnings only on `config.warnings`.
- `packages/sdk/test/composition/host-context.spec.ts` covers:
  - same config reference passed to kernel and provider factory
  - fresh provider instance per call
  - discovery from `process.cwd()`
  - explicit `startDir`
  - forced `configPath`
  - mixed-input rejection
  - warning preservation on `config`
  - absence of top-level `warnings` on the host result

### cli:host-context

Status: `pass`

Evidence:

- `packages/cli/src/helpers/cli-context.ts` delegates bootstrap to `openSpecdHost` from `@specd/sdk`.
- CLI warning emission reads only `host.config.warnings` and emits each warning once per successful bootstrap.
- `buildCliKernelOptions` preserves CLI-only logging concerns, including verbosity-driven console level and optional callback destination.
- Graph impact for `resolveCliContext` shows broad command adoption across configured CLI command handlers; `project/status` uses `openSpecdHost`, which is explicitly allowed by the spec.
- `packages/cli/package.json` declares `@specd/sdk` as the sole direct dependency among the constrained platform packages `@specd/core`, `@specd/code-graph`, and `@specd/sdk`.
- `packages/cli/src` contains no direct imports from `@specd/core` or `@specd/code-graph`.
- `packages/cli/test/helpers/cli-context.spec.ts` covers:
  - SDK host delegation
  - verbosity forwarding
  - warning consumption from `config.warnings`
  - single emission per warning
  - no emission when warnings are absent/empty

### core:config

Status: `pass` for the requirements touched by this change

Evidence:

- `packages/core/src/composition/config-loader.ts` preserves the discovery-root entrypoint contract through `createDefaultConfigLoader({ startDir })`.
- `packages/core/src/infrastructure/fs/config-loader.ts` preserves discovery behavior bounded by VCS root in discovery mode and forced-path behavior in forced mode.
- `parseRawAdapter` collects legacy-shape warnings without turning them into fatal errors and preserves them on the resolved `SpecdConfig`.
- `packages/core/src/application/specd-config.ts` exposes `warnings?: readonly string[]` as host-consumable non-fatal diagnostics.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts` covers:
  - discovery from `startDir`
  - no upward walk outside a VCS repo
  - legacy warning collection on `config.warnings`
  - no warning emission when storage defaults are merely omitted

## Consistency Review

- No contradiction found between the change specs and `default:_global/architecture`.
- The implementation remains within the established composition boundaries:
  - SDK composes core + code-graph
  - CLI consumes SDK as the bootstrap facade
  - core remains the source of resolved config warnings
- No documentation or testing convention violations were detected in the changed surface.

## Conclusion

The implementation and tests are consistent with the merged change specs for `sdk-host-warning-contract`. No compliance findings were identified in this audit.
