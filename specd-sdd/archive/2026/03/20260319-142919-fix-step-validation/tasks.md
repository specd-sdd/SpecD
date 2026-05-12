# Tasks: Add archiving as a ChangeState

## 1. Domain layer

- [x] 1.1 Add `archiving` to `ChangeState` and `VALID_TRANSITIONS`
      `packages/core/src/domain/value-objects/change-state.ts` —
      add `'archiving'` to union, set `archivable: ['archiving', 'designing']`,
      add `archiving: []`
      (Req: Step resolution — archiving must be a valid ChangeState)

- [x] 1.2 Validate workflow step names in `buildSchema`
      `packages/core/src/domain/services/build-schema.ts` (after line 476) —
      iterate workflow steps, verify each `step.step` is in `Object.keys(VALID_TRANSITIONS)`,
      throw `SchemaValidationError` if not
      (Req: Step resolution — only valid ChangeState values in schema)

## 2. Application layer

- [x] 2.1 Transition to `archiving` in `ArchiveChange.execute()`
      `packages/core/src/application/use-cases/archive-change.ts` (after line 142) —
      after `assertArchivable()`, resolve actor, call `change.transition('archiving', actor)`,
      `await this._changes.save(change)` before pre-hooks
      (Req: Archivable guard — transition to archiving before hooks)

## 3. Tests

- [x] 3.1 Update `change-state` tests for `archiving`
      `packages/core/test/domain/value-objects/change-state.spec.ts` —
      add `archiving` to `ALL_STATES` and `it.each` table, update `archivable` test,
      add test for `archiving` having no transitions

- [x] 3.2 Add `buildSchema` test for invalid step name rejection
      `packages/core/test/domain/services/build-schema.spec.ts` —
      add test: workflow step with invalid name throws `SchemaValidationError`

- [x] 3.3 Update `archive-change` tests for `archiving` transition
      `packages/core/test/application/use-cases/archive-change.spec.ts` —
      verify change transitions to `archiving` before hooks execute

- [x] 3.4 Add `run-step-hooks` test for `archiving` step acceptance
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts` —
      add test: `step: 'archiving'` does not throw `StepNotValidError`

## 4. Build and verify

- [x] 4.1 Build and run full core test suite
      `pnpm build && pnpm --filter @specd/core test`

## 5. Manual verification

- [x] 5.1 Verify `change hook-instruction` accepts `archiving` step
      `node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre`

- [x] 5.2 Verify `change archive` works with hooks
      `node packages/cli/dist/index.js change archive <name>`
