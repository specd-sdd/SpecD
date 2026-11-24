# Compliance audit — change-scoped Core use cases

## Scope and method

- Change: `schema-workflow-skippable-states`
- Delegated verification attempt: `verification-attempt-7` (this audit did not start or complete the attempt)
- Specs audited: `core:change-manifest`, `core:validate-artifacts`, `core:run-step-hooks`, `core:preview-spec`, `core:get-status`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `core:compile-context`, `core:get-artifact-instruction`, `core:get-hook-instructions`, `core:edit-change`, `core:invalidate-change`, `core:count-tasks`, and the sovereign-schema additions to `core:change`
- Sources of intent: the change proposal, design, merged spec previews/deltas, implementation, and tests
- Navigation: fresh code graph (`stale: false`, `fingerprintMismatch: false`, coverage complete) followed by targeted source/test inspection
- Executed evidence: 16 targeted Core test files, **560 tests passed**

## Executive result

The production implementation is compliant with the proposal's central intent: an existing change is governed by the immutable schema identity recorded in its manifest, not by the workspace default. All assigned change-scoped use cases resolve the schema with `SchemaProvider.get(change.schemaName)` (or the archived/draft equivalent), and the schema-dependent decisions consume the resolved value.

The previous legacy branch in `EditChange` is gone: scope edits use one compatibility lookup before mutation, `replaceSpecIds()` inside the serialized reconciler mutation, and `ctx.reconcileAfter()` as the single owner of artifact-DAG and validity synchronization. No second direct schema lookup or `updateSpecIds()` call remains in the use case.

One **MEDIUM test-compliance finding** remains: the test named as EditChange reconciliation-failure atomicity rejects before invoking the mutation callback, so it does not exercise the specified failure point after `replaceSpecIds()` and during `ctx.reconcileAfter()`. Production structure appears atomic by construction, but the required scenario is not proven by that test.

## Findings

### MEDIUM — EditChange atomicity scenario does not reach reconciliation after the scope mutation

**Spec/intent**

`core:edit-change` requires that a reconciliation error prevent persistence of a partial scope edit. The merged verification scenario says that when reconciliation fails after replacing the fresh change's spec scope, the persisted scope remains unchanged. The corrective design likewise calls for explicit reconciliation-failure atomicity coverage.

**Evidence**

- Production path in `packages/core/src/application/use-cases/edit-change.ts` is structurally correct: `_executeScopeEdit()` calls `_reconcile.mutate(...)`; its callback calls `freshChange.replaceSpecIds(specIds)` and then awaits `ctx.reconcileAfter(...)`.
- The test `keeps the persisted scope atomic when reconciliation rejects` in `packages/core/test/application/use-cases/edit-change.spec.ts` replaces the whole reconciler with `mutate: vi.fn(async () => Promise.reject(failure))`.
- Consequently, the callback supplied by `EditChange` is never invoked. The test proves only that an error before mutation leaves the repository unchanged; it does **not** prove rollback when `ctx.reconcileAfter()` rejects after `replaceSpecIds()` has modified the fresh aggregate.

**Risk**

The repository/reconciler transaction may already provide the correct rollback semantics, and no production defect was observed. However, a regression that persisted the mutated aggregate before a failed `reconcileAfter()` would not be caught by the current test, contrary to the explicit scenario and corrective-pass intent.

**Recommended correction**

Use a real or transaction-faithful `ReconcileChangeValidity.mutate` fixture that invokes the callback against a fresh aggregate, makes `ctx.reconcileAfter()` reject, and then asserts both persisted `specIds` and relevant history/artifact state are unchanged. Also assert the callback reached `replaceSpecIds()` before the injected failure.

## Per-spec compliance matrix

| Spec                                  | Production implementation                                                                                                                                                                   | Test evidence                                                                                                                      | Result           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `core:change-manifest`                | `FsChangeRepository` hydrates `manifest.schema` into `Change`; name mismatch with active workspace schema is no longer rejected; version warning is only emitted for the same schema name   | Explicit hydration test with a different active schema name; version-warning coverage                                              | PASS             |
| `core:validate-artifacts`             | Resolves `this._schemaProvider.get(change.schemaName)` before schema-driven validation                                                                                                      | Success path asserts the recorded schema reference; failure propagation covered                                                    | PASS             |
| `core:run-step-hooks`                 | Active and archived paths resolve the recorded `schemaName`; hook lookup uses that schema                                                                                                   | Active sovereign-reference success and missing-schema failure covered                                                              | PASS             |
| `core:preview-spec`                   | Resolves `change.schemaName`; parser/delta behavior uses the returned schema                                                                                                                | Custom-schema success asserts the sovereign reference                                                                              | PASS             |
| `core:get-status`                     | Active and draft paths resolve their recorded schema names; active failure degrades read-only; lifecycle projection uses resolved schema                                                    | Positive two-schema test proves disabled `verifying` comes from `custom-workflow`, not workspace default; failure behavior covered | PASS             |
| `core:archive-change`                 | Resolves `loadedChange.schemaName` before reconciliation/archive checks; returned-schema mismatch remains a deliberate `schema.nameMatch` predicate failure, not a workspace-default lookup | Positive two-schema successful archive, mismatch defense, and failure coverage                                                     | PASS             |
| `core:approve-spec`                   | Gate guard resolves `change.schemaName` and propagates lookup failures                                                                                                                      | Sovereign-reference success plus guard/failure scenarios                                                                           | PASS             |
| `core:approve-signoff`                | Gate guard resolves `change.schemaName` and propagates lookup failures                                                                                                                      | Sovereign-reference success plus guard/failure scenarios                                                                           | PASS             |
| `core:compile-context`                | Resolves `change.schemaName`; instructions/artifact context use the resulting schema                                                                                                        | Sovereign-reference success and missing-schema behavior                                                                            | PASS             |
| `core:get-artifact-instruction`       | Resolves `change.schemaName`; artifact rules/instructions come from that schema                                                                                                             | Custom-schema reference asserted on success                                                                                        | PASS             |
| `core:get-hook-instructions`          | Uses active or archived record's `schemaName` before reading workflow hooks                                                                                                                 | Positive two-schema test proves both active and archived results return only the sovereign hook                                    | PASS             |
| `core:edit-change`                    | Single pre-mutation compatibility lookup; fresh aggregate uses `replaceSpecIds()`; `ctx.reconcileAfter()` owns DAG/validity sync; no dead second lookup/update branch                       | Sovereign compatibility and single-lookup coverage pass, but reconciliation-failure atomicity test does not invoke the callback    | PARTIAL — MEDIUM |
| `core:invalidate-change`              | Loads change, resolves `change.schemaName`, and derives focused/downstream/global targets from `schema.artifacts()`; resolution precedes persistence                                        | Sovereign-reference and no-persistence-on-resolution-failure tests pass                                                            | PASS             |
| `core:count-tasks`                    | Resolves `input.change.schemaName`; task artifacts/patterns come only from that schema                                                                                                      | Two-schema task-pattern test and no-fallback failure test                                                                          | PASS             |
| `core:change` (`StartVerification`)   | Resolves `change.schemaName` before readiness checks; failure cannot create an attempt                                                                                                      | Sovereign readiness and no-attempt-on-failure tests                                                                                | PASS             |
| `core:change` (validity fingerprints) | Every artifact-bearing fingerprint API resolves `change.schemaName`; there is no fallback                                                                                                   | Cross-API sovereign artifact selection and failure-without-evidence tests                                                          | PASS             |

## Intent traceability

The proposal's concern 10 and proposed solution 12 are materially realized, rather than merely mirrored in method signatures:

1. The manifest retains immutable schema identity and repository hydration permits a workspace-default name mismatch.
2. Operational use cases fetch by the change/archived/draft schema name.
3. Schema-dependent outputs are demonstrably different in strong positive tests: GetStatus topology, ArchiveChange success, GetHookInstructions hook selection, CountTasks task pattern selection, StartVerification readiness, and validity fingerprint artifact selection.
4. Failure paths do not retry with the default schema or persist cross-schema decisions/evidence.
5. `InvalidateChange` threads the sovereign artifact DAG into direct, downstream, and global target construction.
6. `EditChange` delegates post-scope artifact topology and validity to canonical reconciliation, eliminating the duplicated synchronization path identified by the full-compliance corrective pass.

No contradiction was found between these change specs and their declared dependency/global contracts. The sovereign-schema rule strengthens, rather than violates, the global architecture boundary: schema lookup remains behind `SchemaProvider`, repositories preserve manifest facts, and application use cases orchestrate domain behavior without importing infrastructure.

## Test execution

Command scope: the 16 relevant Core suites for the assigned specs and supporting sovereign-schema services/repository.

- Test files: **16 passed / 16**
- Tests: **560 passed / 560**
- Failures: **0**

Passing tests do not clear the MEDIUM finding because the deficient atomicity test never exercises its stated failure point.

## Counts

- Specs audited: **15**
- Fully compliant specs: **14**
- Partially compliant specs: **1** (`core:edit-change`, test evidence only)
- Production implementation defects found: **0**
- Findings: **1 MEDIUM**, **0 HIGH**, **0 LOW**
- Assigned change verification scenarios inspected: **30**
- Targeted automated tests executed: **560**, all passing

## Verdict

**COMPLIANT WITH ONE MEDIUM TEST GAP.** The code realizes the proposal/design intent and the sovereign-schema contracts across the assigned use cases. Full compliance should remain blocked until the EditChange atomic rollback scenario is exercised at the real post-`replaceSpecIds()` reconciliation failure boundary.
