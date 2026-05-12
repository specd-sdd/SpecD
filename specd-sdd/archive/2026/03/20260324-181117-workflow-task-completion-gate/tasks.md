# Tasks: workflow-task-completion-gate

## 1. Domain model changes

- [x] 1.1 Add `requiresTaskCompletion` to `WorkflowStep` interface
      `packages/core/src/domain/value-objects/workflow-step.ts`:
      `WorkflowStep` interface — add `readonly requiresTaskCompletion: readonly string[]`
      Approach: add as required field with empty array default; mirrors `requires` pattern
      (Req: schema-format/Workflow, workflow-model/Task completion gating)

- [x] 1.2 Add `TransitionFailureReason` type and update `InvalidStateTransitionError`
      `packages/core/src/domain/errors/invalid-state-transition-error.ts`:
      add `TransitionFailureReason` discriminated union, add optional `reason` property
      to the error class, enrich error message based on reason type
      Approach: `TransitionFailureReason = { type: 'invalid-transition' } | { type: 'incomplete-artifact'; artifactId: string } | { type: 'incomplete-tasks'; artifactId: string; incomplete: number; complete: number; total: number }`; constructor takes optional third param `reason?: TransitionFailureReason`; message varies by reason type
      (Req: transition-change/Workflow requires enforcement, transition-change/Task completion check)

## 2. Schema parsing and validation

- [x] 2.1 Add `requiresTaskCompletion` to YAML parser
      `packages/core/src/infrastructure/schema-yaml-parser.ts`:
      `WorkflowStepZodSchema` (line 120) — add `requiresTaskCompletion: z.array(z.string()).optional()`;
      `WorkflowStepRaw` interface (line 233) — add `readonly requiresTaskCompletion: readonly string[]`;
      transform — default to `[]` when absent
      Approach: same pattern as `requires` field
      (Req: schema-format/Workflow)

- [x] 2.2 Add `requiresTaskCompletion` validation in `buildSchema`
      `packages/core/src/domain/services/build-schema.ts`:
      after existing workflow validation (line ~513) — validate each step's
      `requiresTaskCompletion` is subset of `requires` and references artifacts
      with `taskCompletionCheck`
      Approach: for each step, iterate `requiresTaskCompletion`; check `requires.includes(id)` and look up artifact in the built artifacts array for `taskCompletionCheck`; throw `SchemaValidationError` if either check fails
      (Req: build-schema/Workflow step uniqueness validation)

## 3. Transition logic changes

- [x] 3.1 Update requires enforcement to throw with structured reason
      `packages/core/src/application/use-cases/transition-change.ts`:
      `execute()` requires loop (line 148-149) — pass `reason: { type: 'incomplete-artifact', artifactId }` to `InvalidStateTransitionError`
      Approach: `throw new InvalidStateTransitionError(change.state, effectiveTarget, { type: 'incomplete-artifact', artifactId })`
      (Req: transition-change/Workflow requires enforcement)

- [x] 3.2 Change task completion check to use `requiresTaskCompletion`
      `packages/core/src/application/use-cases/transition-change.ts`:
      replace current logic (line 152-158) that checks every required artifact's
      `taskCompletionCheck` with a separate loop over `workflowStep.requiresTaskCompletion`
      Approach: after the requires loop, if `workflowStep.requiresTaskCompletion.length > 0`, iterate it; for each artifact ID, look up `schema.artifact(id).taskCompletionCheck`; call `_checkTaskCompletionForArtifact`
      (Req: transition-change/Task completion check during requires enforcement)

- [x] 3.3 Enhance `_checkTaskCompletionForArtifact` with counting and structured reason
      `packages/core/src/application/use-cases/transition-change.ts`:
      `_checkTaskCompletionForArtifact` — count incomplete matches, optionally count complete matches via `completePattern`, emit `task-completion-failed` progress event, throw with `reason: { type: 'incomplete-tasks', ... }`
      Approach: accumulate counts across all files; after checking all files, if incomplete > 0, emit event and throw; use `completePattern` from `taskCompletionCheck` if declared
      (Req: transition-change/Task completion check, transition-change/Progress callback)

- [x] 3.4 Add `task-completion-failed` to `TransitionProgressEvent`
      `packages/core/src/application/use-cases/transition-change.ts`:
      `TransitionProgressEvent` union — add `{ type: 'task-completion-failed'; artifactId: string; incomplete: number; complete: number; total: number }`
      Approach: add to the existing union type
      (Req: transition-change/Progress callback)

## 4. Schema-std update

- [x] 4.1 Add `requiresTaskCompletion` to verifying step in schema-std
      `packages/schema-std/schema.yaml`:
      `verifying` step (~line 571) — add `requiresTaskCompletion: [tasks]`
      Approach: only on `verifying`; `ready`, `implementing`, `archiving` do not need it
      (Req: workflow-model/Task completion gating)

## 5. Tests

- [x] 5.1 Add `buildSchema` validation tests for `requiresTaskCompletion`
      `packages/core/test/domain/services/build-schema.spec.ts`:
      add tests for: not-subset-of-requires, references-artifact-without-taskCompletionCheck, valid-requiresTaskCompletion
      Approach: use existing test helpers; configure workflow steps with invalid/valid `requiresTaskCompletion`
      (Req: build-schema/Workflow step uniqueness validation)

- [x] 5.2 Update transition-change tests for `requiresTaskCompletion`
      `packages/core/test/application/use-cases/transition-change.spec.ts`:
      update existing task completion tests to use `workflowStep.requiresTaskCompletion`;
      add test for no gating when `requiresTaskCompletion` absent;
      add test for structured reason on requires failure;
      add test for `task-completion-failed` progress event
      Approach: configure mock schema with `requiresTaskCompletion` on workflow steps; assert error `reason` field
      (Req: transition-change/Task completion check, transition-change/Workflow requires enforcement)

- [x] 5.3 Add `InvalidStateTransitionError` reason tests
      `packages/core/test/domain/errors/invalid-state-transition-error.spec.ts`:
      test message enrichment for each reason type and no-reason fallback
      Approach: construct errors with each reason type, assert message content
      (Req: transition-change/Workflow requires enforcement)

## 6. Documentation updates

- [x] 6.1 Update `docs/core/use-cases.md` — TransitionChange section
      `docs/core/use-cases.md` (line 127+): add `task-completion-failed` event to
      `TransitionProgressEvent` type block; update `InvalidStateTransitionError`
      description to mention structured `reason`
      Approach: add the new event variant to the code block; update error table description
      (Req: default:\_global/docs — Core documentation, JSDoc on all symbols)

- [x] 6.2 Update `docs/core/errors.md` — InvalidStateTransitionError section
      `docs/core/errors.md` (line 222+): add `reason` property with
      `TransitionFailureReason` type; show enriched message examples for each reason type
      Approach: add `TransitionFailureReason` type definition, update the example code block
      (Req: default:\_global/docs — Core documentation)

- [x] 6.3 Update `docs/core/overview.md` — WorkflowStep entry
      `docs/core/overview.md` (line 82): update `WorkflowStep` description to mention
      `requiresTaskCompletion` field
      Approach: update the description column in the value objects table
      (Req: default:\_global/docs — Core documentation)
