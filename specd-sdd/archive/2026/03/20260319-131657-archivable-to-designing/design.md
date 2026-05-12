# Design: Allow transition back to designing from any state

## Affected areas

### 1. `packages/core/src/domain/value-objects/change-state.ts` — VALID_TRANSITIONS map (lines 28–40)

Add `'designing'` to every state's transition list except `drafting` (which already targets only `designing`). Currently `archivable` has an empty array — it becomes `['designing']`.

### 2. `packages/core/src/domain/entities/change.ts` — `invalidate()` method (lines 406–422)

Remove the `if (from === 'archivable')` guard (lines 409–411). After removal, `invalidate()` works from every state, including `archivable`.

### 3. `packages/core/src/domain/entities/change.ts` — `InvalidatedEvent` type (line 63)

Extend the `cause` union from `'spec-change' | 'artifact-change'` to `'spec-change' | 'artifact-change' | 'redesign'`.

### 4. `packages/core/src/application/use-cases/transition-change.ts` — `execute()` method (lines 170–229)

Add approval-invalidation logic before the state transition when the effective target is `'designing'`. This sits between the artifact-validation-clearing step (line 207) and pre-hook execution (line 210).

### 5. `packages/core/test/application/use-cases/transition-change.spec.ts`

Add new test cases for the new behaviour.

## Approach

The change touches three layers — value object, entity, and use case — in bottom-up order.

**Step 1 — Expand VALID_TRANSITIONS.** Add `'designing'` to every state's array except `drafting`. This is purely additive — existing transitions are unchanged. After this, `change.transition('designing', actor)` succeeds from any non-drafting state.

**Step 2 — Remove archivable guard in `invalidate()`.** Delete the three-line guard block. The rest of `invalidate()` already handles every state correctly: it pushes an `invalidated` event, conditionally pushes a `transitioned` event (skips if already in `designing`), and resets all artifact validations.

**Step 3 — Add approval invalidation in TransitionChange.** In `execute()`, after artifact-validation clearing and before pre-hook execution, add:

```typescript
// --- Approval invalidation on transition to designing ---
if (effectiveTarget === 'designing' && change.state !== 'drafting') {
  if (change.activeSpecApproval !== undefined || change.activeSignoff !== undefined) {
    change.invalidate('redesign', actor)
  }
}
```

The `change.state !== 'drafting'` guard ensures the `drafting → designing` transition (the normal entry into designing) doesn't trigger invalidation logic. The `invalidate()` call clears both spec approval and signoff in one shot (since `activeSpecApproval` and `activeSignoff` both check for `invalidated` events in history).

Note: `invalidate()` also pushes a `transitioned` event to `designing` (unless already in `designing`). Since we call `invalidate()` before `change.transition()`, the subsequent `transition()` call would find the change already in `designing` and attempt `designing → designing`, which is not in VALID_TRANSITIONS. Two options:

- **Option A:** Skip `change.transition()` when `invalidate()` was called (it already moved the state).
- **Option B:** Add `'designing'` to `designing`'s own transitions.

**Decision:** Option A. The `invalidate()` call already moves state to `designing` and records the history event. Calling `transition()` again would duplicate the event. Guard the `transition()` call:

```typescript
// Only call transition() if invalidate() didn't already move us to designing
if (change.state !== effectiveTarget) {
  change.transition(effectiveTarget, actor)
}
```

Actually, the cleaner approach: restructure so that when we invalidate, we skip the later `change.transition()` call entirely. This can be done with a flag or by moving the invalidation into a block that returns early from the transition step.

**Refined approach:** Introduce a boolean `invalidated` flag. After the approval invalidation block, if `invalidated` is true, skip `change.transition()` (since `invalidate()` already transitioned). The rest of the flow (save, post-hooks, progress events) still runs.

```typescript
let invalidated = false
if (effectiveTarget === 'designing' && change.state !== 'drafting') {
  if (change.activeSpecApproval !== undefined || change.activeSignoff !== undefined) {
    change.invalidate('redesign', actor)
    invalidated = true
  }
}

// ... pre-hooks ...

if (!invalidated) {
  change.transition(effectiveTarget, actor)
}
```

**Step 4 — Tests.** Add test cases for:

1. Transition from `archivable` to `designing` (basic path, no approvals).
2. Transition from `implementing` to `designing` with active spec approval — verify `invalidate()` is called and state is `designing`.
3. Transition from `implementing` to `designing` without approvals — verify `invalidate()` is NOT called, normal `transition()` path.
4. Transition from `drafting` to `designing` — no approval invalidation logic fires.

## Key decisions

**Decision: Use `invalidate('redesign', ...)` cause.** The `InvalidatedEvent['cause']` type must support `'redesign'`. Currently the cause values need to be checked — if `'redesign'` is not a valid cause, we'll use `'spec-change'` or add `'redesign'` to the union.
→ **Alternative rejected:** Using `'spec-change'` — it's semantically misleading since no spec content changed; the user explicitly requested redesign.

**Decision: Skip `transition()` when `invalidate()` fires.** Since `invalidate()` already records the state change in history, calling `transition()` afterward would create a duplicate history entry and fail validation (state would already be `designing`).
→ **Alternative rejected:** Adding `designing → designing` to VALID_TRANSITIONS — this would make the state machine conceptually wrong.

## Trade-offs

**[Risk]** `invalidate()` resets all artifact validations as a side effect. When transitioning to designing from, say, `implementing`, this clears validations for artifacts that were already complete during the designing phase.
→ **Mitigation:** This is intentional — going back to designing means the user wants to revise, so clearing validations forces re-validation of all artifacts. This matches existing `invalidate()` semantics.

**[Risk]** The `'redesign'` cause value does not currently exist in the `InvalidatedEvent` type (only `'spec-change' | 'artifact-change'`).
→ **Mitigation:** Extend the union in `change.ts` line 63 to include `'redesign'`.

## Testing

### Automated tests

**File:** `packages/core/test/application/use-cases/transition-change.spec.ts`

New `describe` block: **"transition to designing"**

| Test                                                                            | Asserts                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| transitions from archivable to designing                                        | `change.state === 'designing'`, change is saved                     |
| transitions from implementing to designing                                      | `change.state === 'designing'`, change is saved                     |
| invalidates approvals when transitioning to designing with active spec approval | `change.invalidate` called with `'redesign'`, state is `designing`  |
| invalidates approvals when transitioning to designing with active signoff       | `change.invalidate` called, state is `designing`                    |
| does not invalidate when transitioning to designing without active approvals    | `change.invalidate` NOT called, `change.transition` called directly |
| does not trigger invalidation for drafting to designing                         | normal transition path, no invalidation                             |

**File:** `packages/core/test/domain/value-objects/change-state.spec.ts` (if exists)

Verify `isValidTransition` returns `true` for every state → `designing` except `drafting → designing` (which should already pass since `drafting` already has `designing`).

**File:** `packages/core/test/domain/entities/change.spec.ts`

Add test: `invalidate()` from `archivable` state succeeds (currently throws).

### Manual verification

```bash
# Build
pnpm build

# Run tests
pnpm --filter @specd/core test

# E2E: create a change, advance to archivable, transition back to designing
node packages/cli/dist/index.js change create test-redesign --description "test"
# ... advance through states ...
node packages/cli/dist/index.js change transition test-redesign designing
```

## Open questions

None.
