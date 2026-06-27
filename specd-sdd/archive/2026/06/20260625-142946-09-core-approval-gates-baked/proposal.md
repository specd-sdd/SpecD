# Proposal: 09-core-approval-gates-baked

## Motivation

Two related problems in approval-gate host wiring:

1. `TransitionChange`, `ApproveSpec`, and `ApproveSignoff` require hosts to pass `approvalsSpec` / `approvalsSignoff` on every `execute()` though the kernel is built from `config.approvals` — duplicates config and diverges from `GetStatus`.
2. `ApproveSpec` and `ApproveSignoff` are change-lifecycle gates but live under `kernel.specs` — mismatched with CLI (`specd change approve`) and domain (`ChangeRepository` mutations).

## Current behaviour

- Per-execute approval flags on `TransitionChangeInput`, `ApproveSpecInput`, `ApproveSignoffInput`.
- CLI passes `config.approvals` on every call.
- `kernel.specs.approveSpec` / `kernel.specs.approveSignoff` — wrong namespace.
- `GetStatus` already bakes `config.approvals` at construction.

## Proposed solution

**Bake approvals at construction** (same `ApprovalGates` as `GetStatus`):

```ts
type ApprovalGates = { readonly spec: boolean; readonly signoff: boolean }
```

- Remove approval flags from execute inputs.
- Pass `config.approvals` from factories and kernel wiring.

**Relocate kernel entries** to the change lifecycle group:

```ts
kernel.changes.approveSpec // was kernel.specs.approveSpec
kernel.changes.approveSignoff // was kernel.specs.approveSignoff
```

Runtime behaviour unchanged: same routing, same errors, same gate semantics.

## Specs affected

### New specs

_none_

### Modified specs

- `core:transition-change`: bake approvals at construction; remove approval fields from input
- `core:approve-spec`: bake spec gate; kernel entry under `changes.approveSpec`
- `core:approve-signoff`: bake signoff gate; kernel entry under `changes.approveSignoff`
- `core:kernel`: move approve entries from `kernel.specs` to `kernel.changes` in entry mapping
- `core:composition`: update kernel grouping example
- `cli:change-transition`: stop passing approval flags to `TransitionChange.execute`
- `cli:change-approve`: use `kernel.changes.approveSpec` / `approveSignoff`; stop passing gate flags

## Impact

| Area                                      | Change                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Use cases                                 | Constructor baking; input slimmed                                  |
| `packages/core/src/composition/kernel.ts` | Move `approveSpec`/`approveSignoff` to `changes` namespace         |
| CLI/MCP/tests                             | `kernel.changes.approveSpec` instead of `kernel.specs.approveSpec` |

Blast radius: **HIGH** — `TransitionChange` + kernel interface + all approve callers.

**Overlap:** `core:kernel` and `core:composition` also targeted by `11-sdk-host-facade` and `13-public-api-surface` — archive **09** first; downstream explorations updated to assume new paths.

**Out of scope:** API mutate handler (feature branch); approval manifest redesign (`approval-system-notes.md`).

**Sequencing:** After P0–P2. Downstream 11–13 must consume `kernel.changes.approve*` after 09 archives.

## Technical context

Kernel relocation rationale: approve use cases load/mutate `Change` via `ChangeRepository`, transition lifecycle state, capture artifact hashes at gate boundaries — same domain as `changes.transition`, `changes.archive`.

Reference pattern (`createGetStatus`):

```typescript
return new GetStatus(changeRepo, schemaProvider, opts.approvals, refresh, lifecycle)
```

Post-change paths:

```typescript
kernel.changes.approveSpec.execute({ name, reason })
kernel.changes.approveSignoff.execute({ name, reason })
kernel.changes.transition.execute({ name, to, skipHookPhases? })
```

## Open questions

_none_
