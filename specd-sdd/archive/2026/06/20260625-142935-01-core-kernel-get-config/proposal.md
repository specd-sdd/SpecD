# Proposal: 01-core-kernel-get-config

## Motivation

Hosts that receive a `Kernel` (CLI, future SDK/API) today also keep a parallel `SpecdConfig` in context objects such as `CliContext`, duplicating the snapshot already used to construct the kernel. Phase P0c of the core refactor introduces a single readonly escape hatch on the kernel so hosts can read project configuration without a second source of truth.

## Current behaviour

- `createKernel(config)` consumes a `SpecdConfig` but does not expose it back to callers.
- CLI `resolveCliContext` returns `{ config, configFilePath, kernel }`; commands read `config.projectRoot`, `config.approvals`, plugins, graph paths, etc. from the parallel field even though the kernel was built from the same object.
- No `GetConfig` use case or `kernel.project.getConfig` entry exists.
- Domain use cases that need config slices (e.g. `CompileContext` in change 03) still receive config via `execute` inputs — out of scope for this change.

## Proposed solution

Add a minimal application-layer use case `GetConfig` that returns the `SpecdConfig` snapshot captured at kernel construction time. Wire it as `kernel.project.getConfig`. The contract is readonly: hosts must not mutate the returned object; yaml edits continue through `ConfigWriter` composition factories (change 06).

`execute()` takes no input. If the yaml changes on disk, callers recreate the kernel — same rule as today.

This change does **not** migrate CLI/SDK hosts off `CliContext.config`; that belongs to later changes (11–12).

## Specs affected

### New specs

- `core:get-config`: Defines the `GetConfig` use case — constructor receives the kernel's `SpecdConfig` snapshot; `execute()` returns `Readonly<SpecdConfig>` without re-reading disk.
  - Depends on: `core:config`, `default:_global/architecture`

### Modified specs

- `core:kernel`: Add `getConfig` under `kernel.project`; require `createKernel` to retain the config snapshot and wire the use case. Clarify that this is the host-level readonly view, not a substitute for baking config slices inside other use cases.
  - Depends on (added): `core:get-config`
  - Depends on (removed): none

## Impact

- **Code:** `packages/core` — new `get-config.ts` use case, `kernel.ts` / `kernel-internals.ts` wiring, unit tests.
- **API surface:** `Kernel.project.getConfig` added; no breaking removals.
- **Hosts:** No mandatory migration in this change; CLI `cli-context.ts` unchanged until change 12.
- **Downstream:** Unblocks `11-sdk-host-facade` (`createSdkContext` reads config via kernel).

## Technical context

From `core-refactor-on-main.md` (P0c):

```ts
export class GetConfig {
  constructor(config: SpecdConfig) {
    this._snapshot = structuredClone(config)
  }
  execute(): Readonly<SpecdConfig> {
    return this._snapshot
  }
}
```

- Snapshot is from kernel construction — not a live disk read.
- `getConfig` is for integrators/hosts, not for domain use cases to re-inject full yaml into `execute` inputs.
- Precedent: `GetStatus` already bakes `config.approvals` at construction; this change exposes the full config snapshot for host needs.
- Graph impact on `kernel.ts` is **LOW** (kernel + kernel-internals only).

### Resolved: immutability strategy

**Decision:** `structuredClone(config)` once in the `GetConfig` constructor; `execute()` returns that clone typed as `Readonly<SpecdConfig>`.

**Why — external host boundary, not internal wiring:**

| Concern       | Kernel internals (`ListWorkspaces`, etc.) | `GetConfig`                          |
| ------------- | ----------------------------------------- | ------------------------------------ |
| Who consumes  | Composition trust zone                    | Hosts outside the kernel             |
| Config object | Live reference wired at `createKernel`    | **Detached clone** for host reads    |
| Host mutates? | N/A (not exposed)                         | Must **not** affect kernel behaviour |

**Why a clone (not shared reference):**

1. **Runtime safety** — TypeScript `Readonly` does not stop mutation; a shared reference would let hosts corrupt kernel state silently.
2. **Correct mental model** — hosts must not believe that mutating the returned object reconfigures the kernel or persists to `specd.yaml`. A clone makes that impossible: edits stay on a throwaway snapshot.
3. **Distinct from internal use** — `ListWorkspaces` keeping the live `SpecdConfig` for wiring is intentional; `GetConfig` is a separate host-facing read path.

**Why not `deepFreeze` on the live reference instead of clone:**

- Freezing the live object would affect internal use cases sharing that reference.
- Clone + `Readonly` type + JSDoc is sufficient; yaml mutations go through `ConfigWriter` factories (change 06).

**Rejected:**

| Option                                 | Why                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Return `createKernel`'s live reference | Host mutation can affect kernel; hosts may think in-place edits apply to the running kernel |
| Contract-only `Readonly` (no clone)    | No runtime isolation; same confusion risk                                                   |
| `structuredClone` on every `execute()` | Unnecessary; one clone at construction is enough                                            |

**Tests (verify.md):** returned value is deep-equal to construction config but **not** referentially equal to the object used by internal wiring; mutating nested fields on the return value does not change kernel behaviour on a subsequent `listWorkspaces` or second `getConfig` call.

## Open questions

None — immutability strategy resolved above.
