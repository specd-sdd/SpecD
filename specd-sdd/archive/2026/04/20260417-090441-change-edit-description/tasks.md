# Tasks: change-edit-description

## 1. EditChange use case updates

- [x] 1.1 Add `description` field to `EditChangeInput` interface
      `packages/core/src/application/use-cases/edit-change.ts`:
      `EditChangeInput` — add `readonly description?: string` property
      Approach: add as optional field after `removeSpecIds`
      (Req: Input contract)

- [x] 1.2 Implement description + spec changes logic inside mutate()
      `packages/core/src/application/use-cases/edit-change.ts`:
      `execute()`: - No changes: early return WITHOUT mutate (OK) - Any changes: single mutate() call - Inside callback: apply spec changes first, then description - invalidated = specIdsChanged (NOT hasSpecChanges)
      Approach: add description to input check, call mutate for any changes, update description inside callback after spec logic, set invalidated based on whether updateSpecIds was actually called
      (Req: Description update does not invalidate)

- [x] 1.3 Post-mutate logic remains unchanged
      `packages/core/src/application/use-cases/edit-change.ts`:
      Lines 120-128 (unscaffold, scaffold) — NO modifications
      (Req: Output contract)

## 2. Change entity updates

- [x] 2.1 Add `updateDescription()` method to `Change` entity
      `packages/core/src/domain/entities/change.ts`:
      `Change` class — add `updateDescription(description: string, actor: Actor)` method
      Approach: update description field and append 'description-updated' event to history
      (Req: Output contract)

## 3. Tests

- [x] 3.1 Add unit test for description-only update in `edit-change.spec.ts`
      `packages/core/test/application/use-cases/edit-change.spec.ts`:
      Scenario: description-only update → invalidated: false
      Approach: mock change, call execute with description only, verify updateDescription called, invalidated: false
      (Req: Description update does not invalidate)

- [x] 3.2 Add unit test for description + specs together in `edit-change.spec.ts`
      `packages/core/test/application/use-cases/edit-change.spec.ts`:
      Scenario: addSpecIds + description together → both applied atomically
      Approach: mock change, call execute with addSpecIds and description, verify both applied, invalidated: true
      (Req: Both applied atomically)

- [x] 3.3 Add unit test for entity `updateDescription()` in `change.spec.ts`
      `packages/core/test/domain/entities/change.spec.ts`:
      new test — verify method updates description and records event
      Approach: create change, call updateDescription, verify description updated and event recorded

## 4. Verification

- [x] 4.1 Manual verification: run CLI command
      CLI: `specd change edit my-change --description "New description" --format json`
      Expected: output shows updated description with invalidated: false

- [x] 4.2 Run existing test suite
      Command: `pnpm test`
      Verify: all tests pass
