# Round 5 partial audit, batch B (read-only)

Specs: core:transition-checks, core:transition-change, core:invalidate-change, core:approve-spec, core:approve-signoff, core:archive-change.

Test run: `vitest run test/application/use-cases/{approve,archive,invalidate,transition,reconciled}* test/application/checks test/domain/services` in packages/core: 63 files, 1116 tests, 1116 passed, 0 failed.

## Round-4 re-verification

| #   | Item                                                                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | archive `_materializeImplementationLinks` omits out-of-codeRoot / unknown-workspace links when bypassed OR when `impl.linksInScope` is absent from effective bindings | FIXED. `archive-change.ts:1352-1400` (`linksInScopeBypassed = skipChecks.includes(...) \|\| !bindings.some(...)`). Failure path uses `skippable` from the resolved binding and `{from: change.state, to: 'archiving'}`. Tests in `archive-change-links-audit.spec.ts` lines 200-265 (fail out-of-codeRoot, omit when bypassed, fail unknown workspace, omit when bypassed, schema-disabled `it.each`). Spec text in "Implementation materialization into spec-lock" (disabled paragraph) matches. |
| 2   | `postHookValidityBlocksArchive` branches tested                                                                                                                       | FIXED. `archive-change.ts:1486`. Tests (links-audit lines 267-370) cover artifactReviewRequired, signoff stale, specApproval stale, and verification stale with `verification.current` disabled via `archiveChecks` (the only path where the verification branch is reachable). Verdicts are stubbed through the reconcile wrapper (real verdict with overrides on call >= 2), so these are guard tests, not end-to-end.                                                                          |
| 3   | invalidate-change `previewArtifactReviewRequired` mirrors reconciler                                                                                                  | MOSTLY FIXED. Mirrors `collectReviewTargets` for `hasDrift`, `pending-review`, skipped files, task artifacts, and request targets. Test: `invalidate-change-ready-audit.spec.ts:267` (pending-review under `none`). See D5 for one remaining gap (hash drift).                                                                                                                                                                                                                                    |
| 4   | JSDoc                                                                                                                                                                 | FIXED. transition-change constructor has `@throws {InvalidCompositionFactoryArgumentsError}` (line 149, thrown at 179). approve-signoff `execute` has `@throws {VerificationInProgressError}`.                                                                                                                                                                                                                                                                                                    |
| 5   | transition-change Persistence wording                                                                                                                                 | FIXED in the Requirement (spec line 194 states the mutation applies only sign-off invalidation and the transition, and "A verifying -> implementing retry does not clear unchanged artifact validation"). Code matches (`transition-change.ts:419-428`). Two stale leftovers remain, see D4.                                                                                                                                                                                                      |
| 6   | skipChecks (use cases) vs skippedCheckIds (verdict input)                                                                                                             | FIXED. transition-checks uses the neutral "skipped check ids" and "skip input"; workflow-model line 127 names `skippedCheckIds` as the orchestrator input. Code: use cases take `skipChecks`; `lifecycle-verdict.ts` takes `skippedCheckIds`. No contradiction.                                                                                                                                                                                                                                   |
| 7   | ready carve-out wording                                                                                                                                               | Consistent across transition-checks (recovery priority 1, line 215; action projection line 299), transition-change (lines 56, scenario 375), invalidate-change (line 60, scenarios 250/257), approve-spec (line 37). Code `selectAutomaticRecovery` has `state !== 'ready'`. Tests: transition-change-ready-audit, approve-audit-2 (line 210), invalidate-change-ready-audit. One inconsistency with legacy parking states, see D1.                                                               |

## Per-spec summary

### core:approve-spec

- Requirements: gate guard order (gate, load, schema, actor), change lookup, scope-aware fingerprint excluding task artifacts, state eligibility from `boundFromStates('approval.spec')`, never transitions, single decorated actor, reconciliation first, one serialized mutation, input contract, baked gates, factory forms.
- Implementation: `approve-spec.ts` matches all of these. The thrown `InvalidStateTransitionError` has `to: 'ready'` (informational) and the `incomplete-artifact` reason, as specified.
- Tests: approve-spec.spec.ts, approve-audit-2, approve-consent-audit, composition/use-cases/approve-spec.spec.ts. Covered: gate disabled, not found, one actor identity, stays in ready, parking drain, binding-derived states, drift persists review without consent, sovereign schema and identity mismatch, stale consent routed via designing, missing/pending-review artifact.
- Missing tests: none material (see D1 for a spec scenario with no matching test).

### core:approve-signoff

- Implementation matches. Verification errors are distinct (`NotFound`, `InProgress`, `Stale`, `FingerprintMismatch`). `VerificationStaleError` carries `changeName` and a host-neutral message (tested at approve-signoff.spec.ts:240-258). `verifyingEnabled` is derived from the schema, equivalent to the reconciler's `verificationRequired` for every bound state. Whole-file implementation fingerprint is tested (approve-consent-audit.spec.ts:174-250).
- Tests: approve-signoff.spec.ts, approve-audit-2, approve-consent-audit, composition/use-cases/approve-signoff.spec.ts.
- Gap: `blockingArtifact` here only checks the artifact is present and the review verdict, while approve-spec also checks file status (`missing`, `in-progress`, ...). See D6 (INFO).

### core:invalidate-change

- Implementation matches the spec: shape validation before mutation, `ResolveChangeSchema` after load, force guard computed from the reconciler pre-pass inside one `mutate`, recovery preview with the effective policy, `manual-invalidation` intent, host-neutral errors.
- Tests: invalidate-change.spec.ts, -policy-audit, -ready-audit, -next-action, composition/use-cases/invalidate-change.spec.ts.

### core:transition-change

- Implementation matches the requirement set sampled (reconcile-first, skip validation, hook phases, persistence via `ChangeRepository.mutate` with only sign-off invalidation on skill hops from `done`/`signed-off`/`archivable` to `implementing`/`verifying`, `startImplementationTracking`). Constructor throws `InvalidCompositionFactoryArgumentsError` when `reconcile` is missing (tested in audit-2).
- Tests: transition-change.spec.ts (158 KB), -audit, -audit-2, -ready-audit, reconciled-transition-status.

### core:transition-checks

- Registry bindings, resolver single-owner rules, recovery priority, host-neutral actions and the legacy parking-state bindings are consistent with `change-validity.ts`, `lifecycle-verdict.ts` and `test/application/checks`; all pass.

### core:archive-change

- Implementation matches the spec for post-hook guard ordering (predicates rerun first, `CheckPredicateFailedError` for `verification.current`, then generic `InvalidStateTransitionError`), link materialization (item 1) and skip validation.
- Tests: archive-change.spec.ts (176 KB), -audit, -links-audit, -skip-ids-audit, -batch-restore, -input.

## Discrepancies

- **D1 (MEDIUM, spec-wrong or untested contradiction): approve-signoff scenario "Consent in a parking state never transitions" (and the matching approve-spec parking behavior).**
  - The scenario is "historic change in `signed-off` with a STALE sign-off and valid verification; signoff is renewed; state is still `signed-off`".
  - Code: `selectAutomaticRecovery` (`change-validity.ts:~197`) returns `signoff -> done` for any broken consent when `isAfter(state, 'done')`, and `signed-off` and `pending-signoff` are after `done` on `DELIVERY_AXIS`. The reconciler pre-pass inside `ApproveSignoff` would therefore commit a return to `done` first, and consent would be recorded in `done`, not `signed-off`.
  - The same applies to `ApproveSpec` with a stale approval in `spec-approved` (recovery to `designing`, since only `ready` is carved out).
  - Evidence the scenario is not exercised: the test `approve-consent-audit.spec.ts:158` uses an ABSENT sign-off in `signed-off`, not a stale one. I did not run an empirical repro (read-only audit), so this is from code reading.
  - Fix options: change the scenario to "absent or valid-but-unrecorded sign-off", or state in transition-checks / approve-\* that stale consent in a legacy parking state also recovers, or carve parking states out of recovery in code. Spec is likely the thing to fix, since the spec Purpose says parking states "record consent and stay there".
- **D2 (LOW, spec): approve-spec/approve-signoff Gate guard step 3** lists `SchemaProviderIdentityMismatchError` propagation, but neither `execute` JSDoc lists it or the schema resolution errors under `@throws` (INFO-level doc gap). The behavior is correct and tested (approve-spec.spec.ts:409, approve-signoff.spec.ts:179).
- **D3 (LOW, spec-wrong): invalidate preview vs verdict nuance.** See D5.
- **D4 (LOW, spec-wrong): stale transition-change wording.** Purpose (line 6) still says "validation clearing ... redesign invalidation" and the Persistence scenario (line ~755) says "the callback applied any redesign invalidation, validation clearing, and lifecycle transition". The code and the Requirement only apply sign-off invalidation, the lifecycle transition and tracking start. Suggest: "applied any sign-off invalidation and the lifecycle transition".
- **D5 (LOW, code-wrong edge): `previewArtifactReviewRequired`** (`invalidate-change.ts:410`) does not mirror the reconciler's `hashDrift` (`file.validatedHash !== fresh fingerprint hash`, `reconcile-change-validity.ts:317-319`); it only reads `file.hasDrift`/`pending-review`. If a file differs by hash but has not yet been flagged `hasDrift` by the pre-pass (for example effective artifact policy `none` while the persisted policy would have persisted drift, or the pre-pass persists nothing for `none`), the preview reports `artifactReviewRequired=false` while the reconciler will report true. This only changes the previewed recovery under `workflow: redesign`. No test covers hash-only drift in the preview.
- **D6 (INFO): approve-signoff `blockingArtifact`** does not check file statuses (`missing`/`in-progress`) like approve-spec does; the spec only requires "no unresolved non-task artifact review", which the verdict covers. No action required.
- **D7 (INFO, pre-existing): archive-change** scenario "Archive discards nonexistent spec candidate" says archive "fails before applying those external updates" while the Requirement says such links are discarded; wording ambiguity only, unchanged this round.
- **D8 (INFO): post-hook guard tests** stub verdict fields, so they verify the guard, not the reconciler's production of those verdicts.

No contradictions found against `project context` or direct dependency specs (core:change verification-requirement wording agrees with `isWorkflowStepEnabled('verifying')` use in approve-signoff and with the reconciler's `verificationRequired`).

## Missing tests

- Stale (not absent) consent in a legacy parking state for ApproveSpec/ApproveSignoff (D1).
- Hash-only drift in `previewArtifactReviewRequired` (D5).
- Real (unstubbed) post-hook validity blocks in archive (D8).

## Counts

HIGH 0, MEDIUM 1, LOW 3 (D2, D4, D5; D3 is a pointer to D5), INFO 3 (D6, D7, D8).
