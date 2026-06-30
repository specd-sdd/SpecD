# Proposal: 02-core-host-orchestration-status

## Motivation

CLI `change status` and `change transition` duplicate the same host-orchestration prelude: probe whether the change is active, then call `RefreshImplementationTracking` before the core read/transition use case. That side-effect policy belongs in `GetStatus` and `TransitionChange` with explicit defaults so every host (CLI, SDK, MCP) gets consistent behaviour without copy-pasted prelude blocks.

## Current behaviour

Today:

- `packages/cli/src/commands/change/status.ts` calls `kernel.changes.repo.get(name)` and, when non-null, `kernel.changes.refreshImplementationTracking.execute({ name })` before `GetStatus`.
- `packages/cli/src/commands/change/transition.ts` performs the same refresh prelude before reading status and invoking `TransitionChange`.
- `GetStatus` and `TransitionChange` specs require callers to refresh explicitly; the use cases project persisted implementation-tracking state only.

## Proposed solution

**P0a — GetStatus:** extend `GetStatusInput` with `refreshImplementationTracking?: boolean` (default `true` when omitted). When enabled, invoke `RefreshImplementationTracking` **only for active changes** (`ChangeRepository.get(name) !== null`). Draft-only reads never refresh. Wire `RefreshImplementationTracking` into `GetStatus` via constructor injection.

**P0b — TransitionChange:** extend `TransitionChangeInput` with `refreshImplementationTrackingBefore?: boolean` (default `true` when omitted). When enabled, invoke `RefreshImplementationTracking` **only for active changes** before lifecycle evaluation and mutation. `TransitionChange` still MUST NOT call `ImplementationDetector` directly.

**CLI thinning:** remove manual refresh blocks from `change status` and `change transition`. Status calls `GetStatus` with defaults. Transition calls `GetStatus` with `refreshImplementationTracking: false` for the pre-transition state read (refresh is owned by `TransitionChange`) and does not refresh again for repair-guide diagnostics.

## Specs affected

### New specs

_none_

### Modified specs

- `core:get-status`: bake optional pre-read refresh with active-only default; add constructor dependency on `RefreshImplementationTracking`; replace caller-owned refresh requirement.
  - Depends on (added): none
  - Depends on (removed): none

- `core:transition-change`: bake optional pre-transition refresh with active-only default; replace caller-owned refresh requirement; add constructor dependency on `RefreshImplementationTracking`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:refresh-implementation-tracking`: clarify that `GetStatus` and `TransitionChange` invoke this use case by default while it remains the standalone primitive for explicit refresh.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-status`: remove CLI-owned refresh requirement; status command delegates refresh policy to `GetStatus`.
  - Depends on (added): none
  - Depends on (removed): `core:refresh-implementation-tracking`

- `cli:change-transition`: remove CLI-owned refresh requirement; transition command delegates refresh policy to `TransitionChange`; preserve no-double-refresh rule for repair-guide `GetStatus`.
  - Depends on (added): none
  - Depends on (removed): `core:refresh-implementation-tracking`

## Impact

- **Core:** `GetStatus`, `TransitionChange`, `createGetStatus`, `createTransitionChange`, kernel wiring, unit tests.
- **CLI:** `change/status.ts`, `change/transition.ts`, command tests.
- **API surface:** new optional input fields on `GetStatusInput` and `TransitionChangeInput`; new constructor dependency for both use cases.
- **Hosts:** SDK/MCP gain default refresh behaviour when they call core use cases directly (follow-up changes may thin those hosts separately).

## Technical context

- Precedent: `GetStatus` already bakes `config.approvals` in its constructor — same pattern for injecting `RefreshImplementationTracking`.
- Active-only rule matches current CLI prelude (`repo.get(name) !== null`).
- `--implementation` on `change status` remains display-only; it does not control refresh.
- `ifModifiedSince` mentioned in refactor notes is **out of scope** for this change (not present in codebase today).
- No new CLI flag for `refreshImplementationTracking: false` in this change; opt-out is use-case input for programmatic callers only.
- Independent of P0c (`CompileContext` refresh); can run in parallel. Should land before P3 (approvals) and P1a (context refresh policy).

## Open questions

_none — deferred items documented above (`ifModifiedSince`, CLI opt-out flag) are explicitly out of scope for this change._
