# Tasks: improve-specd-diagnostics-and-ux

## 1. Core Domain: Artifact States

- [x] 1.1 Add `pending-parent-artifact-review` state
      `packages/core/src/domain/entities/change.ts`: `ChangeArtifactState`, `ArtifactFileState` — add the new state literal.
      Approach: Extend the union types and update any state-dependent logic in the entity.
      (Req: Artifacts)
- [x] 1.2 Implement recursive status propagation in `effectiveStatus`
      `packages/core/src/domain/entities/change.ts`: `Change.effectiveStatus()` — update logic to check parent artifact states recursively.
      Approach: If any parent in the artifact DAG is `pending-review` or `drifted-pending-review`, return `pending-parent-artifact-review`.
      (Req: Artifacts)

## 2. Core Use Cases: GetStatus & Transition

- [x] 2.1 Enhance `GetStatus` with Blockers and Next Action
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus` — implement `_deriveBlockers()` and `_deriveNextAction()`.
      Approach: Identify `ARTIFACT_DRIFT`, `MISSING_ARTIFACT`, etc., and recommend commands like `/specd-design`.
      (Req: Identifies blockers, Recommends next action)
- [x] 2.2 Update `TransitionChange` for detailed recursive blocks
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange` — update `InvalidStateTransitionError` payload.
      Approach: Catch recursive parent blocks and include the `blockedBy` detail in the error reason.
      (Req: Workflow requires enforcement)

## 3. CLI: High-Visibility Diagnostics

- [x] 3.1 Implement Artifact DAG ASCII tree in `change status`
      `packages/cli/src/commands/change/status.ts`: `renderTextStatus()` — add DAG rendering with legend and scope labels.
      Approach: Use a recursive tree-traversal to draw the ASCII lines and symbols based on artifact state.
      (Req: Output format)
- [x] 3.2 Implement Repair Guide in `change transition`
      `packages/cli/src/commands/change/transition.ts`: `TransitionCommand` — call `GetStatus` on failure and render the guide.
      Approach: If `execute()` throws, fetch fresh status and print the `nextAction` recommendation.
      (Req: Invalid transition error)
- [x] 3.3 Rename `warning` to `note` in `change validate`
      `packages/cli/src/commands/change/validate.ts`: Validation serializers — update labels in text and JSON output.
      Approach: Global search and replace for "warning" -> "note" strictly for non-blocking optimization hints.
      (Req: Output on success)

## 4. Verification & Documentation

- [x] 4.1 Add automated tests for recursive blocks
      `packages/core/test/domain/entities/change.spec.ts`: New scenarios for `pending-parent-artifact-review`.
      Approach: Create a DAG with a drifted parent and assert child effective status.
- [x] 4.2 Add automated tests for Repair Guide
      `packages/cli/test/commands/change-transition.spec.ts`: Verify Repair Guide rendering on failure.
      Approach: Mock a transition failure and assert the guide output contains the expected command.
- [x] 4.3 Update project documentation
      `docs/cli/cli-reference.md`: Update `change status` and `change transition` examples.
      Approach: Reflect the new DAG and Repair Guide sections in the docs.
