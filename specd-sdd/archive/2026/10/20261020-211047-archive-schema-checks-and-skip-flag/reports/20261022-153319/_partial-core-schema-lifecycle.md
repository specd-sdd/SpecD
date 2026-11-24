# Partial compliance audit — core schema and lifecycle

Scope: delegated read-only audit for verification attempt `verification-attempt-7`.
Audited merged specs: `core:schema-format`, `core:workflow-model`, `core:change`, `core:kernel`, `core:get-status`, and `core:lifecycle-engine`.

## Result

One discrepancy was found. The remaining inspected requirements are implemented and have focused test evidence.

| Severity | Spec requirement                                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| medium   | `core:lifecycle-engine` — Machine-readable blockers | `GetStatus` drops the required `isSkippable` boolean when it projects domain `LifecycleBlocker`s and failed predicate checks into its public `Blocker` result. `LifecycleBlocker` carries the field (`packages/core/src/domain/services/lifecycle-verdict.ts:109-116`), but `GetStatus.Blocker` does not declare it (`packages/core/src/application/use-cases/get-status.ts:259-275`), and `_mergeBlockers` only emits `code`, `message`, optional `bypassFlag`, `label`, and `checkId` (`packages/core/src/application/use-cases/get-status.ts:880-950`). This violates the merged requirement that every blocker include `isSkippable`, including false for locked/non-skippable checks. Existing tests assert it only on the domain verdict, not the public GetStatus projection. |

## Requirements and implementation evidence

| Spec                    | Audited requirement group                                                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:schema-format`    | `workflow.archiving.archiveChecks` accepts only `id`, `skippable`, `disabled`, and object `config`; it is archiving-only; unknown keys and malformed entries fail. | Strict YAML parser schema at `packages/core/src/infrastructure/schema-yaml-parser.ts:287-294`; defensive construction-time validation at `packages/core/src/domain/services/build-schema.ts:658-683`; archiving-only validation at `build-schema.ts:830-850`; archive-check validation/gov locks at `build-schema.ts:990-1028`.                                         |
| `core:workflow-model`   | Archive declarations are independently resolved, registered, coordinate-unique, and governance locks prevent weakening locked archive bindings.                    | `WorkflowStepArchiveCheckDeclaration` and `WorkflowStep.archiveChecks` are modeled in `packages/core/src/domain/value-objects/workflow-step.ts:98-168`; `buildSchema` validates registry membership, duplicate archive coordinates, and policy/config/disable locks at `build-schema.ts:990-1028`.                                                                      |
| `core:change`           | Archive skip controls are documented as the allowed per-execution `ArchiveChange` override.                                                                        | `ArchiveChangeInput.skipChecks` is the canonical ID list (`packages/core/src/application/use-cases/archive-change.ts:86-97`); it has no ad-hoc bypass booleans.                                                                                                                                                                                                         |
| `core:kernel`           | Kernel-level construction uses explicit dependencies and validates generic check bypasses against resolved effective bindings.                                     | `ArchiveChange` accepts composed bindings and optional registry, resolves schema-aware archive bindings, and calls `validateSkipChecks` before predicates/hooks/writes (`archive-change.ts:324-354`).                                                                                                                                                                   |
| `core:get-status`       | At `archivable`, status evaluates effective archive predicates, observes archive schema disables, and projects canonical `--skip-checks <id>` hints.               | `GetStatus` resolves archive bindings with `operation: 'archive'`, runs predicates only at `archivable`, and merges them into public blockers (`packages/core/src/application/use-cases/get-status.ts:660-715`, `860-950`). `nextAction` is adjusted for overlap without inventing a bypass (`get-status.ts:953-983`). See discrepancy above for omitted `isSkippable`. |
| `core:lifecycle-engine` | Domain lifecycle blockers derive skippability from resolved bindings and suppress flags for locked checks.                                                         | `LifecycleBlocker` declares `isSkippable` (`packages/core/src/domain/services/lifecycle-verdict.ts:109-116`); failed checks resolve the flag from bindings (`lifecycle-verdict.ts:960-974`).                                                                                                                                                                            |

## Test evidence

Executed successfully:

- `pnpm --filter @specd/core exec vitest run test/domain/services/lifecycle-verdict.spec.ts test/application/use-cases/get-status.spec.ts test/domain/services/build-schema.spec.ts test/infrastructure/schema-yaml-parser.spec.ts --reporter=dot` — 4 files, 253 tests passed.
- `pnpm --filter @specd/core exec vitest run test/application/use-cases/archive-change.spec.ts --reporter=dot` — 1 file, 120 tests passed.

The tests cover archive schema shape/parsing, governance locks, effective archive bindings, generic `skipChecks`, non-skippable enforcement, disabled schema checks, and status bypass hints. They do not cover the missing `GetStatus.Blocker.isSkippable` field, which is why the discrepancy survived.

## Coverage gaps

- No public `GetStatus` assertion verifies `isSkippable: true` for a schema-skippable archive predicate and `isSkippable: false` for a locked/non-skippable archive predicate.
- No public status serialization assertion verifies that non-predicate/review blockers also retain the required false value.

## Summary counts

- Requirements/groups inspected: 6
- Implemented with evidence: 5
- Discrepancies: 1 medium
- Focused tests: 373 passed, 0 failed
