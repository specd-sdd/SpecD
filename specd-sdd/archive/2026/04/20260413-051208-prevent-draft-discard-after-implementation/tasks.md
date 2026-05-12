# Tasks: prevent-draft-discard-after-implementation

## 1. Domain layer — entity and error

- [x] 1.1 Add `hasEverReachedImplementing` getter to `Change`
      `packages/core/src/domain/entities/change.ts`: `Change` — add a derived boolean getter that scans `this._history` for any event with `type === 'transitioned'` and `to === 'implementing'`; return `true` if found, `false` otherwise
      Approach: iterate history array, check each event; since history is append-only and typically small, a simple `some()` is sufficient. Add JSDoc per conventions spec.
      (Req: Historical implementation detection)

- [x] 1.2 Create `HistoricalImplementationGuardError` domain error
      `packages/core/src/domain/errors/historical-implementation-guard-error.ts`: new file — define `GuardedChangeOperation = 'draft' | 'discard'` and `HistoricalImplementationGuardError extends SpecdError` with `code: 'IMPLEMENTATION_DETECTED'`, `operation` getter, and `changeName` getter; message: `"Cannot ${operation} a change that has reached implementing without --force: implementation may already exist and specs and code could be left out of sync"`
      Approach: follow the existing `InvalidStateTransitionError` pattern — readonly fields set in constructor, `get code()` override, extends `SpecdError`. Export from `packages/core/src/domain/errors/index.ts`.
      (Req: Drafting and discarding — error signalling)

- [x] 1.3 Guard `Change.draft()` with historical implementation check and `force` parameter
      `packages/core/src/domain/entities/change.ts`: `draft()` — add optional `force?: boolean` trailing parameter; check `this.hasEverReachedImplementing` before appending the event; if `true` and `force !== true`, throw `HistoricalImplementationGuardError('draft', this.name)`; otherwise proceed as before
      Approach: add `force` as the last parameter with `undefined` default so existing call sites remain compatible. The guard runs before event append so no event is recorded on failure.
      (Req: Drafting and discarding, scenario: Draft after historical implementation requires force; scenario: Forced draft after historical implementation appends drafted event)

- [x] 1.4 Guard `Change.discard()` with historical implementation check and `force` parameter
      `packages/core/src/domain/entities/change.ts`: `discard()` — add optional `force?: boolean` trailing parameter; same pattern as `draft()`: if `this.hasEverReachedImplementing` and `force !== true`, throw `HistoricalImplementationGuardError('discard', this.name)`; otherwise proceed as before
      Approach: same pattern as draft guard — trailing optional parameter, throw before event append.
      (Req: Drafting and discarding, scenario: Discard after historical implementation requires force; scenario: Forced discard from drafts after historical implementation succeeds)

- [x] 1.5 Export `HistoricalImplementationGuardError` from core package root
      `packages/core/src/index.ts`: add re-export for `HistoricalImplementationGuardError` and `GuardedChangeOperation`
      Approach: add to the existing error exports section, following the established pattern.
      (Req: none — plumbing for CLI consumption)

## 2. Application layer — use cases

- [x] 2.1 Add `force` to `DraftChangeInput` and thread through `DraftChange.execute()`
      `packages/core/src/application/use-cases/draft-change.ts`: `DraftChangeInput` — add `readonly force?: boolean`; `execute()` — pass `input.force` to `change.draft(actor, input.reason, input.force)` inside the mutation callback
      Approach: `DraftChangeInput` is an interface; add `force?: boolean` as an optional field. The use case does not check `hasEverReachedImplementing` itself — the entity guard throws if needed, and the error propagates naturally.
      (Req: Historical implementation guard — DraftChange, scenario: Historically implemented change is rejected by default; scenario: Force bypasses the historical implementation guard)

- [x] 2.2 Add `force` to `DiscardChangeInput` and thread through `DiscardChange.execute()`
      `packages/core/src/application/use-cases/discard-change.ts`: `DiscardChangeInput` — add `readonly force?: boolean`; `execute()` — pass `input.force` to `change.discard(input.reason, actor, input.supersededBy, input.force)` inside the mutation callback
      Approach: same pattern as DraftChange — add optional field to interface, pass through in mutation callback.
      (Req: Historical implementation guard — DiscardChange, scenario: Historically implemented change is rejected by default; scenario: Force bypasses the historical implementation guard)

- [x] 2.3 Update kernel composition if needed for new error type
      `packages/core/src/composition/` — verify that `HistoricalImplementationGuardError` is accessible through the package root; no kernel wiring changes needed since use case constructors are unchanged
      Approach: check `index.ts` exports; the error is a domain type, not a use case, so no composition factory changes are required.
      (Req: none — plumbing)

## 3. CLI adapters

- [x] 3.1 Add `--force` flag to `specd change draft` command
      `packages/cli/src/commands/change/draft.ts`: `registerChangeDraft()` — add `.option('--force', 'bypass the historical implementation guard')` to the Commander definition; pass `force: opts.force ?? false` in the kernel input
      Approach: add the option after existing `--reason` and `--format` options. The flag is boolean and optional; when absent, `undefined` falsifies to effectively no-force at the use case level.
      (Req: Command signature — change draft, scenario: Force flag is accepted; scenario: Historically implemented change requires force)

- [x] 3.2 Add `--force` flag to `specd change discard` command
      `packages/cli/src/commands/change/discard.ts`: `registerChangeDiscard()` — add `.option('--force', 'bypass the historical implementation guard')` to the Commander definition; pass `force: opts.force ?? false` in the kernel input
      Approach: same pattern as draft — add option, pass through to use case input.
      (Req: Command signature — change discard, scenario: Force flag is accepted; scenario: Historically implemented change requires force)

- [x] 3.3 Ensure `HistoricalImplementationGuardError` is handled by CLI error infrastructure
      `packages/cli/src/handle-error.ts`: add an explicit case for `HistoricalImplementationGuardError` in the `handleError` function so it maps to exit code 1 with `code: 'IMPLEMENTATION_DETECTED'` in structured output
      Approach: since `HistoricalImplementationGuardError extends SpecdError`, it already falls through to the `instanceof SpecdError` branch with exit code 1. Add an explicit `instanceof` check earlier in the function to set the structured `code` field to `'IMPLEMENTATION_DETECTED'` for JSON/TOON output, matching the pattern of other specific error types.
      (Req: Error cases — change draft; Error cases — change discard)

## 4. Domain entity tests

- [x] 4.1 Add `hasEverReachedImplementing` test block
      `packages/core/test/domain/entities/change.spec.ts`: new `describe('hasEverReachedImplementing')` — test returns `false` with no transitioned events, returns `false` when only non-implementing transitions exist, returns `true` when a transitioned event has `to: 'implementing'`, returns `true` after implementing then returning to designing
      Approach: use the existing change factory helpers; create changes with specific history sequences and assert the getter outcome.
      (Req: Historical implementation detection, scenarios: becomes true after implementing; remains true after returning to designing; stays false before implementing)

- [x] 4.2 Add guarded `draft()` test block
      `packages/core/test/domain/entities/change.spec.ts`: new `describe('draft() with historical implementation guard')` — test that draft throws `HistoricalImplementationGuardError` when `hasEverReachedImplementing` is true and `force` is absent/undefined/false; test that draft succeeds with `force: true`; test that draft succeeds without force when `hasEverReachedImplementing` is false
      Approach: set up changes with an implementing transition in history, then call `draft()` with and without `force`; assert error type and message; assert event append on success.
      (Req: Drafting and discarding, scenarios: Draft after historical implementation requires force; Forced draft after historical implementation appends drafted event)

- [x] 4.3 Add guarded `discard()` test block
      `packages/core/test/domain/entities/change.spec.ts`: new `describe('discard() with historical implementation guard')` — test that discard throws `HistoricalImplementationGuardError` when `hasEverReachedImplementing` is true and `force` is absent; test that discard succeeds with `force: true`; test that discard succeeds without force when `hasEverReachedImplementing` is false
      Approach: same pattern as guarded draft tests but for discard; verify error type, message, and event append behaviour.
      (Req: Drafting and discarding, scenarios: Discard after historical implementation requires force; Forced discard from drafts after historical implementation succeeds)

## 5. Use case tests

- [x] 5.1 Add rejection and force bypass tests for `DraftChange`
      `packages/core/test/application/use-cases/draft-change.spec.ts`: add describe block — mock a change where `hasEverReachedImplementing` returns true; call `execute({ name })` without `force` and assert it throws `HistoricalImplementationGuardError`; call `execute({ name, force: true })` and assert success with drafted event
      Approach: use existing mock patterns for ChangeRepository and ActorResolver; stub the change's `hasEverReachedImplementing` getter to return `true`.
      (Req: Historical implementation guard — DraftChange, scenarios: Historically implemented change is rejected by default; Force bypasses the historical implementation guard)

- [x] 5.2 Add rejection and force bypass tests for `DiscardChange`
      `packages/core/test/application/use-cases/discard-change.spec.ts`: add describe block — mock a change where `hasEverReachedImplementing` returns true; call `execute({ name, reason })` without `force` and assert rejection; call `execute({ name, reason, force: true })` and assert success with discarded event
      Approach: same pattern as DraftChange tests but with required `reason`.
      (Req: Historical implementation guard — DiscardChange, scenarios: Historically implemented change is rejected by default; Force bypasses the historical implementation guard)

## 6. CLI tests

- [x] 6.1 Add `--force` flag and guard error tests for `change draft`
      `packages/cli/test/commands/change-draft.spec.ts`: add test cases — `--force` is accepted in the command definition; kernel receives `force: true` when `--force` is passed; kernel receives `force: false` or omits it when `--force` is absent; a thrown `HistoricalImplementationGuardError` produces exit code 1 with the expected stderr message
      Approach: use existing command test helpers (`makeMockConfig`, `makeMockKernel`, `captureStderr`); simulate the kernel throwing `HistoricalImplementationGuardError` for the guard scenario.
      (Req: Command signature — change draft, scenario: Force flag is accepted; Error cases, scenario: Historically implemented change requires force; Behaviour, scenario: Historically implemented change can still be drafted when forced)

- [x] 6.2 Add `--force` flag and guard error tests for `change discard`
      `packages/cli/test/commands/change-discard.spec.ts`: add test cases — `--force` is accepted; kernel receives `force: true`; `HistoricalImplementationGuardError` produces exit code 1 with explanation about specs/code mismatch
      Approach: same pattern as draft CLI tests.
      (Req: Command signature — change discard, scenario: Force flag is accepted; Error cases, scenario: Historically implemented change requires force; Behaviour, scenario: Historically implemented change can still be discarded when forced)

- [x] 6.3 Update aggregate change command test suite
      `packages/cli/test/commands/change.spec.ts`: update existing `change draft` / `change discard` test blocks to account for the new `--force` option and guard error case so the broader regression suite remains green
      Approach: add `--force` to the tested flag combinations and add an error case for the guard.
      (Req: none — test hygiene)

## 7. Documentation

- [x] 7.1 Update `docs/cli/cli-reference.md` for `change draft` and `change discard`
      `docs/cli/cli-reference.md`: add `--force` flag documentation to both command sections; document the new error case when the change has previously reached `implementing` and `--force` is not provided
      Approach: follow the existing command documentation format in the file; add a subsection for the guarded failure case.
      (Req: global docs spec — CLI documentation rule: every command has a doc file and changes to output contract update the doc)

- [x] 7.2 Update `docs/guide/workflow.md` drafting/discarding section
      `docs/guide/workflow.md`: update the drafting/discarding guidance to state that draft and discard are blocked after a change has ever reached `implementing` unless `--force` is used; update any stale command examples in that section
      Approach: find the drafting/discarding section, add the new constraint, fix command examples if they show draft/discard without mentioning the guard.
      (Req: global docs spec — documentation must stay current)
