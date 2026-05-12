# Tasks: change-validate-blocker-diagnostics

## 1. Core dependency-block diagnostics

- [x] 1.1 Replace generic dependency-block message with status-aware diagnostics
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidateArtifacts.execute` — enrich dependency-block failure descriptions with effective dependency status so validation output stops using generic "incomplete dependency" wording.
      Approach: in the per-artifact dependency guard, compute `dependencyStatus = change.effectiveStatus(reqId)` for the first blocker and compose deterministic status-explicit text in `failures.push({ description })`.
      (Req: core/validate-artifacts — Requirement: Dependency order check)

- [x] 1.2 Add review-blocker-specific wording for pending-review and drifted-pending-review
      `packages/core/src/application/use-cases/validate-artifacts.ts`: dependency-block branch in `execute()` — classify `pending-review` and `drifted-pending-review` as review blockers in the emitted description.
      Approach: branch by dependency status and emit review-state language while preserving explicit status token in the message.
      (Req: core/validate-artifacts — Requirement: Dependency order check)

- [x] 1.3 Include recursive parent blocker context for pending-parent-artifact-review
      `packages/core/src/application/use-cases/validate-artifacts.ts`: dependency-block branch in `execute()` — add parent blocker artifact/status context when dependency is `pending-parent-artifact-review`.
      Approach: call `change.findBlockingParent(artifactType.id)` when dependency status is `pending-parent-artifact-review`; include returned `artifactId` and `status` when present.
      (Req: core/validate-artifacts — Requirement: Dependency order check)

## 2. CLI passthrough and output contract

- [x] 2.1 Keep change-validate rendering as verbatim passthrough of core descriptions
      `packages/cli/src/commands/change/validate.ts`: `executeSingle` / `executeBatch` — ensure text output continues to print `error: <artifactId> — <description>` exactly from core failures without replacement logic.
      Approach: preserve existing formatter path; if touched, keep result normalization schema unchanged and avoid message rewriting in CLI layer.
      (Req: cli/change-validate — Requirement: Output on failure)

- [x] 2.2 Preserve enriched diagnostics in structured output
      `packages/cli/src/commands/change/validate.ts`: `toValidateResult` — verify enriched dependency-block descriptions survive unchanged in JSON/toon output.
      Approach: keep failure mapping as transparent `{ artifactId, description, filename? }` projection and do not introduce post-processing of `description`.
      (Req: cli/change-validate — Requirement: Output on failure)

## 3. Automated tests

- [x] 3.1 Add core tests for status-aware dependency-block messages
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: new/extended cases under dependency-order coverage — assert message includes dependency status for `missing` and `in-progress`.
      Approach: create fixtures where required dependency status is controlled; assert `result.failures` contains status token and blocking dependency ID.
      (Req: core/validate-artifacts verify scenarios: Dependency-block failure includes effective dependency status)

- [x] 3.2 Add core tests for review blockers and recursive parent context
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: dependency-order and recursive review cases — assert `pending-review` / `drifted-pending-review` are surfaced as review blockers, and `pending-parent-artifact-review` includes parent context.
      Approach: set artifact file states to produce each review status; for recursive case, create chain where `findBlockingParent` resolves upstream blocker and assert it appears in description.
      (Req: core/validate-artifacts verify scenarios: Direct review blocker status is reported as review-state; Review-propagation blocker includes recursive parent context)

- [x] 3.3 Add CLI tests for text and JSON passthrough of enriched descriptions
      `packages/cli/test/commands/change-validate.spec.ts`: new command tests for failed validation output — assert CLI preserves status-aware/core-provided failure text in both text and JSON modes.
      Approach: mock `kernel.changes.validate.execute` with enriched failure descriptions and verify stdout text/json includes them verbatim.
      (Req: cli/change-validate verify scenario: Dependency-block failure preserves core blocker status context)

## 4. Documentation and manual verification

- [x] 4.1 Update CLI docs if failure diagnostic wording is outdated
      `docs/cli/cli-reference.md`: `change validate` section — document that dependency-block failures now include explicit dependency status and review blocker context when applicable.
      Approach: adjust command behavior description and sample output lines to match final implementation wording.
      (Req: docs alignment for cli/change-validate behavior)

- [x] 4.2 Update core use-case docs for ValidateArtifacts dependency-block behavior
      `docs/core/use-cases.md`: `ValidateArtifacts` section — describe status-aware dependency-block diagnostics and parent blocker context.
      Approach: sync narrative with updated requirement semantics without changing public result shape.
      (Req: docs alignment for core/validate-artifacts behavior)

- [x] 4.3 Execute manual/E2E verification commands and record expected outcomes
      `packages/core/src/application/use-cases/validate-artifacts.ts`, `packages/cli/src/commands/change/validate.ts`: integration behavior check via CLI.
      Approach: run `change validate` in text and json modes against fixtures/real change states that trigger `missing`, `in-progress`, `pending-review`, `drifted-pending-review`, and `pending-parent-artifact-review`; confirm status tokens and review context are present.
      (Req: testing/manual verification coverage)
