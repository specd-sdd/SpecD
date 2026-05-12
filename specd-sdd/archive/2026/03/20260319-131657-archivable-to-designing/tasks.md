# Tasks: Allow transition back to designing from any state

## 1. Domain layer

- [x] 1.1 Extend `InvalidatedEvent.cause` union type
      `packages/core/src/domain/entities/change.ts`: `InvalidatedEvent` (line 63) —
      add `'redesign'` to `'spec-change' | 'artifact-change'`
      (Req: Transition to designing from any state)

- [x] 1.2 Add `'designing'` to VALID_TRANSITIONS for all non-drafting states
      `packages/core/src/domain/value-objects/change-state.ts`: `VALID_TRANSITIONS` (lines 28–40) —
      append `'designing'` to every state's array except `drafting`
      (Req: Transition to designing from any state)

- [x] 1.3 Remove `archivable` guard in `Change.invalidate()`
      `packages/core/src/domain/entities/change.ts`: `invalidate()` (lines 408–411) —
      delete the `if (from === 'archivable')` block
      (Req: Transition to designing from any state — archivable is no longer terminal)

## 2. Application layer

- [x] 2.1 Add approval invalidation logic in `TransitionChange.execute()`
      `packages/core/src/application/use-cases/transition-change.ts`: `execute()` —
      before pre-hooks, when `effectiveTarget === 'designing'` and `change.state !== 'drafting'`,
      check `change.activeSpecApproval` / `change.activeSignoff`; if either exists,
      call `change.invalidate('redesign', actor)` and skip the later `change.transition()` call
      (Req: Transition to designing from any state — approval invalidation)

## 3. Tests

- [x] 3.1 Add entity test: `invalidate()` from `archivable` succeeds
      `packages/core/test/domain/entities/change.spec.ts`: new test case —
      verify `invalidate()` no longer throws from `archivable` state

- [x] 3.2 Add value object test: `isValidTransition` accepts `designing` from all states
      `packages/core/test/domain/value-objects/change-state.spec.ts` (or equivalent) —
      verify `isValidTransition(state, 'designing')` returns `true` for every state except
      that `drafting → designing` was already valid

- [x] 3.3 Add use case test: transition from archivable to designing
      `packages/core/test/application/use-cases/transition-change.spec.ts`: new describe block —
      change in `archivable`, call `execute({ to: 'designing' })`, assert state is `designing`

- [x] 3.4 Add use case test: approval invalidation on transition to designing
      `packages/core/test/application/use-cases/transition-change.spec.ts`: —
      change in `implementing` with active spec approval, transition to `designing`,
      verify `invalidate()` was called and state is `designing`

- [x] 3.5 Add use case test: no invalidation without active approvals
      `packages/core/test/application/use-cases/transition-change.spec.ts`: —
      change in `implementing` without approvals, transition to `designing`,
      verify `invalidate()` was NOT called and `transition()` was called directly

- [x] 3.6 Add use case test: drafting to designing does not trigger invalidation
      `packages/core/test/application/use-cases/transition-change.spec.ts`: —
      change in `drafting`, transition to `designing`, verify no invalidation logic fires

## 4. Build and verify

- [x] 4.1 Build and run full test suite
      `pnpm build && pnpm --filter @specd/core test` — all tests pass, no regressions

## 5. Manual E2E verification

- [x] 5.1 Verify transition from archivable to designing via CLI
      Create a test change, advance it through the full lifecycle to `archivable`,
      then run `node packages/cli/dist/index.js change transition <name> designing`.
      Confirm the change is now in `designing` state.

- [x] 5.2 Verify approval invalidation on transition to designing via CLI
      Create a test change, advance to `spec-approved` (or beyond) so it has an
      active spec approval, then transition to `designing`. Run
      `node packages/cli/dist/index.js change status <name> --format json` and
      confirm approvals are cleared.

- [x] 5.3 Verify transition to designing without approvals via CLI
      Create a test change in `implementing` (no approvals), transition to
      `designing`. Confirm state is `designing` and no errors occur.
