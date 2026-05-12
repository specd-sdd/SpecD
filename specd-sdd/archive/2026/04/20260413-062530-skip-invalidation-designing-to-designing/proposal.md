# Proposal: skip-invalidation-designing-to-designing

## Motivation

When a change that is already in `designing` state is transitioned to `designing` again, all artifacts are invalidated and approvals are cleared — even though nothing has changed. This is destructive and removes agency from the LLM or operator, who may simply want to re-run hooks or recalculate context without resetting all validated work.

## Current behaviour

`TransitionChange.execute()` invalidates artifacts whenever the target is `designing` and the origin is not `drafting` (`transition-change.ts:229`). The condition `freshChange.state !== 'drafting'` means that a `designing → designing` transition triggers full invalidation: all artifact files are downgraded to `pending-review`, and any active spec approval is cleared.

This makes sense for genuine backward transitions like `implementing → designing` or `ready → designing`, where returning to design implies the current artifacts need review. But for a change already in `designing`, the transition is a no-op on state — the change was and remains in `designing` — so invalidation is unjustified.

## Proposed solution

Exclude `designing` as an origin state from the invalidation condition, alongside the existing `drafting` exclusion. The condition becomes:

```ts
if (effectiveTarget === 'designing' && freshChange.state !== 'drafting' && freshChange.state !== 'designing') {
```

Drift detection (artifact content changes) is already handled separately at the repository layer in `FsChangeRepository.get()`, so there is no gap — drifted files are still caught and marked `drifted-pending-review` independently of the transition logic.

## Specs affected

### New specs

None.

### Modified specs

- `core:core/transition-change`: The "Transition to designing from any state" requirement currently states that every origin except `drafting` triggers invalidation. It needs to exclude `designing` as well, since re-entering the same state is not a backward transition that justifies review.
  - Depends on (added): none

- `core:core/change`: The "Lifecycle" requirement states "Every state except `drafting` may return to `designing`." The "History and event sourcing" requirement notes that invalidation occurs when returning to designing. These need a clarification that `designing → designing` does not trigger invalidation.
  - Depends on (added): none

## Impact

- `TransitionChange` use case (`packages/core/src/application/use-cases/transition-change.ts`): line 229 condition changes
- `transition-change.spec.ts`: new test case for `designing → designing` not triggering invalidation
- `change.spec.ts`: possible edge-case test for `designing → designing` in the Change entity

## Technical context

- The invalidation logic lives in `TransitionChange.execute()` at `transition-change.ts:226-247`. When `invalidated = true`, the `transition()` call is skipped because `invalidate()` already appends a `transitioned` event rolling back to `designing`. When `invalidated = false`, `transition()` is called normally.
- Drift detection is handled separately in `FsChangeRepository.get()` (line ~1000), which auto-invalidates when previously-validated file hashes differ from on-disk content. This runs on every `get()` call, so it catches content changes regardless of transition logic.
- The `designing → designing` case is rare but valid — it can happen when an operator re-runs a transition command, or when an automated tool explicitly re-enters designing to trigger pre-hooks.
- Rejected alternative: checking drift before invalidating. This was rejected because drift detection is a separate concern handled at the persistence layer. Mixing drift logic into the transition use case would couple two concerns that are currently separate.

## Open questions

None.
