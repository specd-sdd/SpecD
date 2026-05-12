# Tasks: skip-invalidation-designing-to-designing

## 1. Application layer

- [x] 1.1 Exclude `designing` from invalidation condition in `TransitionChange.execute()`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute()` — add `freshChange.state !== 'designing'` to the invalidation condition at line 229
      Approach: Change `if (effectiveTarget === 'designing' && freshChange.state !== 'drafting')` to `if (effectiveTarget === 'designing' && freshChange.state !== 'drafting' && freshChange.state !== 'designing')`. When false, `invalidated` stays `false` and `freshChange.transition(effectiveTarget, actor)` is called, which appends the `transitioned` event normally without invalidation.
      (Req: Transition to designing from any state)

## 2. Tests

- [x] 2.1 Add test: `designing → designing` does not call `invalidate()`
      `packages/core/test/application/use-cases/transition-change.spec.ts`: new test within the existing `describe('transition to designing')` block
      Approach: Create a change in `designing` state (use `makeChangeInState` helper or transition from `drafting`). Spy on `change.invalidate`. Call `uc.execute({ name, to: 'designing', approvalsSpec: false, approvalsSignoff: false })`. Assert `invalidateSpy.not.toHaveBeenCalled()` and `result.change.state === 'designing'`.
      (Req: Transition to designing from any state, scenario: Transition from designing to designing does not invalidate)

- [x] 2.2 Add test: `designing → designing` does not downgrade artifacts
      `packages/core/test/application/use-cases/transition-change.spec.ts`: new test within the existing `describe('transition to designing')` block
      Approach: Create a change in `designing` state with validated artifacts (state `complete`). Transition to `designing`. Assert all artifact file states remain `complete` (not `pending-review`).
      (Req: Transition to designing from any state, scenario: Transition from designing to designing does not invalidate)

- [x] 2.3 Add test: `designing → designing` preserves active spec approval
      `packages/core/test/application/use-cases/transition-change.spec.ts`: new test within the existing `describe('transition to designing')` block
      Approach: Create a change in `designing` state with an approved spec (use helper to set up `activeSpecApproval`). Transition to `designing`. Assert `result.change.activeSpecApproval` is still defined (not cleared).
      (Req: Transition to designing from any state, scenario: Transition from designing to designing does not invalidate)
