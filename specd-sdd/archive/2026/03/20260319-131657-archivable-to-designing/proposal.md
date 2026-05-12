# Proposal: Allow transition back to designing from any state

## Motivation

At any point in the lifecycle, the user may discover issues — a missed requirement, an incorrect spec delta, or an implementation gap — and need to go back to `designing` to fix them. Currently, only `invalidate()` supports rolling back to `designing` (and even that blocks from `archivable`). There is no way to transition back to `designing` via the normal `transition()` path, which means the user cannot go back without triggering an invalidation — even when there are no approvals to clear.

## Current behaviour

`VALID_TRANSITIONS` does not include `designing` as a target for any state beyond `drafting`. The only way back to `designing` is through `Change.invalidate()`, which:

- Works from all states except `archivable` (throws `InvalidStateTransitionError`)
- Always clears approvals as a side effect

This has two problems:

1. From `archivable`, there is no way back at all.
2. From other states, you cannot return to `designing` without going through invalidation — even when no invalidation is needed (e.g. no active approvals).

## Proposed solution

1. Add `designing` to `VALID_TRANSITIONS` for every state except `drafting` (which already transitions to `designing`):
   - `ready`: `[implementing, pending-spec-approval, designing]`
   - `pending-spec-approval`: `[spec-approved, designing]`
   - `spec-approved`: `[implementing, designing]`
   - `implementing`: `[verifying, designing]`
   - `verifying`: `[implementing, done, designing]`
   - `done`: `[archivable, pending-signoff, designing]`
   - `pending-signoff`: `[signed-off, designing]`
   - `signed-off`: `[archivable, designing]`
   - `archivable`: `[designing]`

2. Remove the `archivable` guard in `Change.invalidate()` so that invalidation also works from `archivable`.

3. When `TransitionChange` processes a transition to `designing`, it MUST invalidate active approvals (spec approval and signoff) if any exist — the change is going back to design, so previous approvals are no longer valid.

## Specs affected

### New specs

None.

### Modified specs

- `core:core/transition-change`: Add `designing` as a valid target from all states. Add a new requirement for approval invalidation on transition to `designing`.

## Impact

- **Value object** (`change-state.ts`): add `designing` to every state's transitions list.
- **Entity** (`change.ts`): remove the `archivable` guard in `invalidate()`.
- **Use case** (`TransitionChange`): add logic to invalidate approvals when transitioning to `designing`.
- **CLI**: no change needed — `change transition` already accepts any target state.
- **No breaking changes**: purely additive — existing transitions are unchanged.

## Open questions

None.
