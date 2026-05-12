# Tasks: auto-task-completion-check

## 1. Remove caller-provided fields from TransitionChangeInput

- [x] 1.1 Remove `TaskCompletionCheck` interface and input fields
      `packages/core/src/application/use-cases/transition-change.ts`:
      `TaskCompletionCheck` interface (lines 15-30), `implementingTaskChecks` field (lines 71-84),
      `implementingRequires` field (lines 63-69) — remove all three
      Approach: delete the interface and both optional fields from `TransitionChangeInput`;
      update JSDoc on the class to reflect the new behaviour
      (Req: Input contract)

## 2. Integrate task completion check into requires enforcement

- [x] 2.1 Add task completion check inside the requires loop
      `packages/core/src/application/use-cases/transition-change.ts`:
      `execute()` requires enforcement block (lines 182-192) — after checking
      `effectiveStatus`, look up `schema.artifact(artifactId)` and check
      `taskCompletionCheck.incompletePattern` against file content
      Approach: for each required artifact, call `schema.artifact(artifactId)`;
      if it has `taskCompletionCheck` with `incompletePattern`, get
      `change.getArtifact(artifactId)`, iterate its `files` map, load each via
      `this._changes.artifact(change, file.filename)`, compile pattern with
      `safeRegex('m')`, throw `InvalidStateTransitionError` if any match
      (Req: Task completion check during requires enforcement)

- [x] 2.2 Remove hardcoded `implementing → verifying` task check
      `packages/core/src/application/use-cases/transition-change.ts`:
      lines 194-197 and `_checkTaskCompletion` method (lines 273-286) — delete
      Approach: the generic check in 2.1 replaces this; remove the conditional
      block and the private method entirely
      (Req: Task completion check during requires enforcement)

## 3. Schema-derived artifact validation clearing

- [x] 3.1 Read implementing requires from schema instead of input
      `packages/core/src/application/use-cases/transition-change.ts`:
      `verifying → implementing` clearing block (lines 200-202) — replace
      `input.implementingRequires` with schema lookup
      Approach: use `schema.workflowStep('implementing')?.requires ?? []` and
      pass to `change.clearArtifactValidations()`; if no implementing step
      exists in schema, skip clearing
      (Req: Artifact validation clearing on verifying to implementing)

## 4. Update tests

- [x] 4.1 Update task completion check tests to use schema-based setup
      `packages/core/test/application/use-cases/transition-change.spec.ts`:
      `implementing → verifying transition with task checks` describe block
      (line 261+) — remove `implementingTaskChecks` from inputs, configure mock
      schema to return artifact types with `taskCompletionCheck`
      Approach: mock `schema.artifact(id)` to return an `ArtifactType` with
      `taskCompletionCheck: { incompletePattern: '^\s*-\s+\[ \]' }`; mock
      `change.getArtifact(id)` to return a `ChangeArtifact` with files map;
      update assertions accordingly
      (Req: Task completion check during requires enforcement)

- [x] 4.2 Add test for generic gating on non-verifying step
      `packages/core/test/application/use-cases/transition-change.spec.ts`:
      new test case — verify task check applies to any step requiring an
      artifact with `taskCompletionCheck`, not just `implementing → verifying`
      Approach: configure a mock `archiving` step with `requires: ['tasks']`
      where `tasks` has `taskCompletionCheck`; attempt transition to `archiving`
      with incomplete tasks; assert `InvalidStateTransitionError`
      (Req: Task completion check during requires enforcement, scenario: generic gating)

- [x] 4.3 Add test for artifact without taskCompletionCheck not being content-checked
      `packages/core/test/application/use-cases/transition-change.spec.ts`:
      new test case — verify `ChangeRepository.artifact` is not called for
      required artifacts without `taskCompletionCheck`
      Approach: configure step requiring `[specs, tasks]` where `specs` has no
      `taskCompletionCheck`; assert `artifact()` is only called for `tasks` files
      (Req: Task completion check during requires enforcement, scenario: no taskCompletionCheck)

- [x] 4.4 Update verifying → implementing clearing tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`:
      `verifying → implementing transition` describe block — remove
      `implementingRequires` from input, verify clearing uses schema requires
      Approach: mock `schema.workflowStep('implementing')` to return step with
      `requires: ['specs', 'tasks']`; assert `clearArtifactValidations` called
      with that list; add test for missing implementing step in schema
      (Req: Artifact validation clearing on verifying to implementing)

- [x] 4.5 Remove obsolete tests for caller-provided fields
      `packages/core/test/application/use-cases/transition-change.spec.ts`:
      remove tests that validate `implementingRequires` defaults to empty array
      and `implementingTaskChecks` defaults to empty array
      Approach: these tests verified caller-provided behaviour that no longer exists;
      delete them
      (Req: Input contract)
