# Partial compliance audit — Core change-scoped use cases

## Requirements Summary

Scope: `core:transition-change`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, `core:validate-artifacts`, `core:get-status`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:run-step-hooks`, and `core:preview-spec` for delegated verification attempt `verification-attempt-8`.

The merged requirements establish two central invariants:

1. Every operation on an existing change uses the immutable schema reference stored in that change (`change.schemaName`, or the archived/draft equivalent). The workspace default is not a fallback for change-scoped behavior.
2. `EditChange` scope edits are serialized and atomic: compatibility is checked before mutation, the fresh aggregate is changed with `replaceSpecIds()`, `ctx.reconcileAfter()` owns topology and validity synchronization, and reconciliation failure cannot persist a partial edit.

`TransitionChange` additionally requires topology-aware `next`, optional/disabled-step bypass evaluation, effective step-skip checks, and suppression of hooks belonging to bypassed steps.

## Implementation Status

| Spec                            | Status    | Implementation evidence                                                                                                                                                                                                                                                                  | Verification evidence                                                                                                                                                                                                                                                     |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:transition-change`        | Compliant | `TransitionChange.execute` loads `SchemaProvider.get(change.schemaName)` before topology resolution; `nextForwardStep` and bypass evaluation receive that schema. Dynamic transition and step-skip predicates are evaluated before mutation, while bypassed-step hooks are not selected. | Dedicated tests cover sovereign lookup, disabled-step `next`, unavailable `next`, step-skip pass/fail, schema-declared/empty effective skip checks, target checks, and hook suppression.                                                                                  |
| `core:edit-change`              | Compliant | Added-spec compatibility performs one direct `get(change.schemaName)` before mutation. The serialized path mutates `ctx.change` with `replaceSpecIds()` and then awaits `ctx.reconcileAfter()`; it neither calls `updateSpecIds()` nor performs a second direct schema lookup.           | Tests prove the workspace default is not consulted, direct lookup occurs once, lookup failure leaves persisted scope unchanged, and rejection after `replaceSpecIds()` leaves persisted spec IDs, history, artifacts, spec approval, signoff, and verification unchanged. |
| `core:invalidate-change`        | Compliant | Schema resolution occurs after loading the change and before target calculation/persistence via `get(change.schemaName)`. Focused/global/downstream targets are derived from the resolved schema DAG.                                                                                    | Tests assert the recorded schema argument and that resolution failure leaves history unchanged.                                                                                                                                                                           |
| `core:count-tasks`              | Compliant | `CountTasks.execute({ change })` calls `get(input.change.schemaName)` and derives task-capable artifacts and patterns only from that schema. Errors propagate.                                                                                                                           | Tests use a custom schema with a distinct `checklist` artifact, assert counts and the exact lookup, and prove failure returns no fallback counts.                                                                                                                         |
| `core:validate-artifacts`       | Compliant | Uses `get(change.schemaName)`; no mismatch guard against the workspace default remains. All schema-derived validation uses the returned schema.                                                                                                                                          | Test asserts lookup of `schema-a` and successful validation under a non-default recorded schema; error propagation remains covered by the suite.                                                                                                                          |
| `core:get-status`               | Compliant | Active status calls `get(change.schemaName)` and draft status calls `get(draftView.schemaName)`. The schema-resolution failure branch is fail-closed and read-only, returning `SCHEMA_RESOLUTION_FAILED` without enabling transitions.                                                   | Tests prove a custom schema controls available steps instead of the default and cover the degraded read-only projection.                                                                                                                                                  |
| `core:compile-context`          | Compliant | Calls `get(change.schemaName)` and uses the resulting schema for artifact and instruction compilation.                                                                                                                                                                                   | Test asserts lookup of `schema-a`; legacy mismatch rejection is absent.                                                                                                                                                                                                   |
| `core:get-artifact-instruction` | Compliant | Calls `get(change.schemaName)` and derives artifact rules/instructions from the result.                                                                                                                                                                                                  | Dedicated test asserts `get('custom-schema')` and successful instruction resolution.                                                                                                                                                                                      |
| `core:get-hook-instructions`    | Compliant | Selects `change.schemaName` for active changes and `archived.schemaName` for archived post-archive instructions, then performs exactly that lookup.                                                                                                                                      | Dedicated test proves both active and archived paths return only the sovereign schema hook and asserts the lookup.                                                                                                                                                        |
| `core:run-step-hooks`           | Compliant | Active execution calls `get(change.schemaName)`; archived post-hook execution calls `get(archived.schemaName)`. Hook lookup is therefore bound to the owning record.                                                                                                                     | Dedicated test asserts lookup of `alpha-schema` and execution under the recorded schema.                                                                                                                                                                                  |
| `core:preview-spec`             | Compliant | Calls `get(change.schemaName)` before parser/delta/template selection.                                                                                                                                                                                                                   | Dedicated test asserts `get('custom-schema')` and successful preview.                                                                                                                                                                                                     |

The source scan found no zero-argument `SchemaProvider.get()` call in any audited use case.

## Discrepancies

No implementation/spec discrepancy was found in the assigned scope.

No contradiction was found with the relevant global and direct dependency contracts. In particular, central schema resolution and reconciliation remain in Core/application services, adapters are not given competing lifecycle rules, failures are typed/propagated or deliberately projected by `GetStatus`, and repository mutation boundaries preserve the hexagonal/DDD and error-handling requirements.

The strongest alternative interpretation considered was whether `EditChange` should re-resolve the schema inside the mutation. The merged requirement explicitly forbids a second direct lookup and assigns fresh-change topology/validity synchronization to `ctx.reconcileAfter()`; the implementation follows that contract. The code is therefore not merely consistent with the delta wording but with its concurrency/atomicity intent.

## Test Coverage

Executed:

```text
pnpm --filter @specd/core exec vitest run \
  test/application/use-cases/transition-change.spec.ts \
  test/application/use-cases/edit-change.spec.ts \
  test/application/use-cases/invalidate-change.spec.ts \
  test/application/use-cases/count-tasks.spec.ts \
  test/application/use-cases/validate-artifacts.spec.ts \
  test/application/use-cases/get-status.spec.ts \
  test/application/use-cases/compile-context.spec.ts \
  test/application/use-cases/get-artifact-instruction.spec.ts \
  test/application/use-cases/get-hook-instructions.spec.ts \
  test/application/use-cases/run-step-hooks.spec.ts \
  test/application/use-cases/preview-spec.spec.ts
```

Result: **11 test files passed; 441 tests passed; 0 failed**.

Coverage is direct for all sovereign-schema call sites and for `EditChange` atomic rollback. The `InvalidateChange` sovereign-schema test uses the standard schema name as the recorded value while guarding against any other lookup; this verifies authority selection and the failure test verifies pre-persistence ordering. It is slightly less expressive than the prose scenario's named custom-vs-default contrast, but the implementation path has no default-schema input and the behavior is substantively covered. This is a non-blocking test-quality observation, not a compliance defect.

## Missing Tests

No mandatory scenario is untested.

Optional strengthening: make the `InvalidateChange` happy-path fixture use a visibly non-default schema name and a deliberately divergent default DAG. This would mirror the GIVEN wording more literally, although it would not exercise a different production branch.

## Spec Dependency Chain

- Sovereign schema behavior relies on `core:change` for the persisted schema reference and on `core:composition-resolver` / `core:schema-format` for resolving and consuming it.
- Transition behavior additionally relies on `core:workflow-topology`, `core:transition-checks`, `core:check-registry`, `core:lifecycle-engine`, and `core:run-step-hooks`; the audited implementation delegates topology/check semantics to those services rather than recreating them.
- Atomic scope editing relies on canonical reconciliation and repository mutation semantics; the fresh aggregate is the mutation subject, and projection changes are returned by the reconciler.
- Status and task projections reuse the shared transition checks and `CountTasks` result instead of deriving competing schema/default behavior.
- The project-wide `default:_global/architecture`, `default:_global/error-handling-conventions`, and `default:_global/testing` constraints are satisfied by Core-owned policy, explicit propagation/projection, and focused Vitest coverage.

## Summary Counts

- Specs audited: **11**
- Requirements assessed as compliant: **11 spec groups / all change-introduced requirements**
- Blocking discrepancies: **0**
- Non-blocking discrepancies: **0**
- Test-quality observations: **1**
- Missing mandatory tests: **0**
- Focused tests: **441 passed, 0 failed**

**Delegated audit result: PASS.** The assigned use cases implement the sovereign `change.schemaName` rule consistently, and the `EditChange` scope mutation preserves the proposal's intended atomicity under reconciliation failure.
