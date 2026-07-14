# Main Follow-ups Identified During the UI Merge

## Purpose

This document records reusable changes discovered while preparing the merge of
`main` into the UI branch. These changes should not be implemented as incidental
extensions of the UI branch because they modify generic core or SDK contracts.

Each item should be evaluated and implemented through its own specd change on
`main`. The UI branch should consume the public APIs currently provided by `main`
until these follow-ups are available.

## 1. Support an explicit discovery root in `openSpecdHost`

### Current behavior

`OpenSpecdHostInput` accepts an optional `configPath`. Without it,
`openSpecdHost()` discovers configuration from `process.cwd()`.

This covers CLI processes, but it does not cover hosts that manage a project selected
at runtime while their process working directory remains elsewhere. Examples include
IDEs, language servers, desktop applications, test harnesses, and daemon processes.

Those hosts currently have to call:

```typescript
const loader = await createDefaultConfigLoader({ startDir: selectedProjectRoot })
const config = await loader.load()
const host = await createSdkContext(config, kernelOptions)
```

Passing `<selectedProjectRoot>/specd.yaml` as `configPath` is not equivalent. It uses
forced mode, which follows only that file's `extends` chain and does not automatically
activate later candidates such as `specd.local.yaml`.

### Proposed change

Add an optional discovery directory to the generic SDK input:

```typescript
export interface OpenSpecdHostInput {
  readonly configPath?: string
  readonly startDir?: string
  readonly kernelOptions?: KernelOptions
}
```

`openSpecdHost` should use forced mode for `configPath`, discovery mode for
`startDir`, and `process.cwd()` when neither is supplied. Supplying both should be
rejected with an actionable error.

### Why this belongs in main

- The requirement is host-agnostic and not specific to Studio or Electron.
- It keeps configuration discovery semantics in one SDK entry point.
- It prevents every non-CLI host from duplicating loader and kernel bootstrap.
- It preserves discovery cascades and local variants.

### Required verification

- Default discovery from `process.cwd()` remains unchanged.
- Discovery from an explicit `startDir` uses the normal cascade rules.
- Forced `configPath` behavior remains unchanged.
- Simultaneous `configPath` and `startDir` is rejected.
- Kernel options are forwarded once and only one kernel is created.

## 2. Allow host-specific graph-provider composition in the SDK

### Current behavior

`createSdkContext` always closes over the standard
`createCodeGraphProvider(config)` factory from `@specd/code-graph`.

This assumes every host uses the standard runtime. A host with a compatible provider
implemented by another package must currently wrap the returned kernel and config with
its own typed provider factory.

### Proposed change

Introduce a generic provider-factory option without importing any host-specific
package into SDK:

```typescript
export type SdkGraphProviderFactory = (config: SpecdConfig) => CodeGraphProvider

export interface SdkContextOptions extends KernelOptions {
  readonly graphProviderFactory?: SdkGraphProviderFactory
}
```

`createSdkContext` should use the supplied factory when present and retain
`createCodeGraphProvider` as the default. Each invocation of
`host.createGraphProvider()` should return a new provider.

### Why this belongs in main

- Provider substitution is a generic SDK composition concern.
- It benefits tests, alternate storage runtimes, embedded hosts, and future adapters.
- SDK should define the provider lifecycle boundary without knowing about Electron.
- Adding this only in the UI branch would create a divergent public SDK API.

### Required verification

- Existing `createSdkContext(config, kernelOptions)` calls remain source compatible.
- The default provider factory remains unchanged.
- A supplied factory receives the same resolved config as the kernel.
- SDK gains no dependency on a concrete alternate-provider package.

## 3. Define warning propagation for host bootstrap

### Current behavior

`SpecdConfig` can contain non-fatal `warnings`. CLI configuration loading prints
them, while `openSpecdHost` returns the config and leaves warning handling to each
host.

This is workable but underspecified for reusable hosts. It is easy for a host to drop
warnings or print them more than once when it performs separate config and host
bootstrap operations.

### Proposed change

Define one main-owned contract for warning propagation. Two valid designs are:

1. Keep warnings on `OpenSpecdHostResult.config.warnings` and explicitly require each
   delivery host to report them once.
2. Add a normalized readonly `warnings` field to `OpenSpecdHostResult` while retaining
   the config field for compatibility.

The SDK should not write to stdout or stderr. Formatting and output remain delivery
responsibilities.

### Why this belongs in main

- Config warnings originate in core and cross every delivery boundary.
- The behavior applies to CLI, MCP, servers, IDEs, and embedded hosts.
- A main-owned contract prevents duplicate or silently discarded diagnostics.

### Required verification

- Warnings survive config loading and host bootstrap unchanged.
- Hosts can report each warning exactly once.
- No warning is promoted to an error.
- SDK performs no console I/O.

## Changes that should remain in the UI branch

The following work is specific to the UI branch and should not be moved to `main`
unless those packages are first adopted there:

- API authentication, CORS, OpenAPI, static UI, and log-readback composition.
- Desktop project selection, Electron graph runtime, IPC lifecycle, and project-switch
  cancellation.
- `@specd/client` DTOs, ports, adapters, and shared HTTP/IPC project-status mapping.
- Studio artifact reading, saving, outlining, batch validation, and UI-facing kernel
  exposure.

The UI branch may adapt these capabilities to main's existing composition conventions,
but it should not expand generic SDK or core APIs solely to make that adaptation more
convenient.
