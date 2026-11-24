# Partial batch B (round 6) - core:transition-checks, core:transition-change, core:invalidate-change, core:archive-change

Read-only audit. No code/spec modified, no lifecycle commands run.
Specs were read via `changes spec-preview` (spec+verify merged).

## Test runs (core)

- Use-case + checks suites (transition-change*, invalidate-change*, archive-change\*, application/checks, reconciled-transition-status): 19 files, 366 tests, 366 passed, 0 failed, 0 skipped.
- test/domain + test/composition + test/application/services: 441 suites, 1427 tests, 1427 passed, 0 failed.

## Round-5 items

1. transition-change Purpose / Persistence scenario: RESOLVED.
   - Purpose (spec.md) now says only "Fingerprint- and consent-driven validity changes belong to the reconciler." No validation clearing / redesign invalidation text.
   - Persistence scenario says the mutate callback applies "any sign-off invalidation for a skill hop and the lifecycle transition ... without clearing unchanged artifact validation".
   - Code: transition-change.ts:419-431 `mutate` callback does only `freshChange.invalidateSignoff(actor)` (guarded by SKILL_HOP_SOURCES/TARGETS), `freshChange.transition(...)`, and `startImplementationTracking()` when entering implementing. Reconcile runs before (l.217) and after hooks (l.374). Matches the requirement "Skill-aligned backward hop invalidation" (sign-off invalidation is the only direct validity mutation).
   - Tests: transition-change.spec.ts "clears signoff on done -> implementing without downgrading artifacts" (l.2902), "designing -> designing" no-op (l.2630), "archiving -> designing without fabricating drift" (l.2715).
2. invalidate-change `previewArtifactReviewRequired`: matches the reconciler. ACCEPTABLE, with one LOW note.
   - invalidate-change.ts:412-437 vs reconcile-change-validity.ts `collectReviewTargets` (l.305-340) + intentTargetsOf (l.234-235) + change-validity.ts:136 (`artifactReviewRequired = nonTaskReviewTargets.length > 0`): same filters (task artifacts excluded, `skipped` files excluded), same `hashDrift` expression (validatedHash defined, fresh hash defined, differs), `hasDrift`, and `pending-review` status; request targets that are non-task count as required. Verified equal term by term, including that the reconciler treats only `pending-review` (not `drifted-pending-review`) in the pending bucket, as the preview does.
   - Test `invalidate-change-ready-audit.spec.ts` "previews required artifact review from hash-only drift under artifacts none" does not discriminate: the guard reads `ctx.change` after the reconciler pre-pass, and the test's own comment admits the fixture file is already held in review, so the result is the same with or without the `hashDrift` term. Not a behavior gap (code is correct), but the term is not pinned by a test. LOW. Cheaper structural fix: have the preview call a shared helper with `collectReviewTargets` instead of duplicating the logic (removes the drift risk entirely).
3. Archive link materialization with disabled `impl.linksInScope`: IMPLEMENTED AND TESTED.
   - archive-change.ts:1360-1364: `linksInScopeBypassed = skipChecks.includes('impl.linksInScope') || !bindings.some(check.id === 'impl.linksInScope')`; `skippable` taken from the resolved binding (not hardcoded); both unknown-workspace and out-of-codeRoot branches `continue` when bypassed/disabled, else throw `CheckPredicateFailedError` (code IMPLEMENTATION_STATE, details outOfScopeSpecIds/files, from change.state to 'archiving'). Matches spec requirement "Implementation materialization into spec-lock" (incl. the disabled-schema paragraph) and scenario "Schema disables impl.linksInScope".
   - Tests: archive-change-links-audit.spec.ts "schema-disabled impl.linksInScope" (l.238-260) covers unknown-workspace and out-of-scope omission without failure; skipChecks bypass covered in archive-change.spec.ts.
   - INFO: if an ArchiveChange were constructed with an empty `archiveBindings` and no registry, out-of-scope links would be silently omitted (disabled and "no bindings" are indistinguishable). Production composition always supplies the base bindings, so not a defect.

## Per-spec results

### core:transition-checks

Requirements Summary: check identity/result, Check ABI and WorkflowCheck, public CustomCheckDefinition (no static action/kind), one module per check, applicability from/to/along and step-skip scope, dynamic runtime binding composition + cascaded config, archive as operation (archiveChecks overlay/disable/synthesize), phase/failure policy, predicate vs effect, evaluation of a transition attempt, shared candidate evaluator, shared validity verdict + recovery priority, single reconciliation owner, registry bindings + governance, actionable fail diagnostics (compact impl summaries), host-neutral check-declared actions, generic progress bus, approval precedence/legacy parking bindings, verification currency bounds, structured details, projections, no shared snapshot bag.
Implementation Status: implemented. All 17 check modules present in application/checks and domain/checks; no CLI flag strings in core src (grep for `--flag`, `specd <cmd>`, `bypassFlag` in non-comment code: 0 hits); ready carve-out implemented in change-validity.ts `selectAutomaticRecovery` (`state !== 'ready'`) and worded consistently in transition-checks (l.215, l.299, scenarios l.933-939), transition-change (l.56), invalidate-change (l.60). Bypass naming is consistent: use-case input is `skipChecks`; lifecycle verdict option is `skippedCheckIds` and the spec (transition-checks l.358, lifecycle-engine) explicitly documents the two names.
Discrepancies: none HIGH/MEDIUM.

- LOW: no test asserts the compact ">3 examples" text for `impl.linksInScope` (spec scenario "impl fail text stays a compact summary" names both checks). Code is right (detect-impl-links-in-scope.ts:46-52 slices 3 and prints `examples:`); filesResolved is tested (domain/services/transition-checks.spec.ts:289-312), linksInScope's only message test checks host-neutrality (detect-impl-links-in-scope.spec.ts:17-35).
  Test coverage: covered across domain/services/transition-checks.spec.ts, lifecycle-verdict.spec.ts, build-schema-archive-checks.spec.ts, application/checks/\*, composition/use-cases/workflow-check-registry.spec.ts, get-status specs. Scenario titles do not mirror test titles, so coverage was judged by behavior.
  Missing tests: compact examples text for impl.linksInScope (LOW).

### core:transition-change

Requirements Summary: input contract (`skipChecks`, `skipHookPhases`, `refreshImplementationTrackingBefore`, no allowOutOfScope/allowOverlap), approval gates baked at construction (no pending-\* rewrite), reconcile-first, verification.current on verifying->done, backward hop sign-off invalidation in the mutate callback, designing from any state except drafting, archiving->archivable recovery, 'next' + HappyPathNextUnavailableError, hooks/effects phases, progress callback, persistence via ChangeRepository.mutate.
Implementation Status: implemented; throw sites (ChangeNotFoundError l.212, committed-recovery ReconciledOperationBlockedError l.230/382, InvalidStateTransitionError l.238/390, HappyPathNextUnavailableError l.254, CheckPredicateFailedError l.510/524, InvalidCompositionFactoryArgumentsError l.179) all appear in the `@throws` JSDoc (constructor and execute). No allowOutOfScope/allowOverlap anywhere in core src.
Discrepancies:

- MEDIUM (spec-internal, stale scenario, pre-existing text): verify.md "Transition from archiving to designing downgrades artifacts" (verify.md:305-310, "artifact files are downgraded for review") contradicts spec.md Requirement "Transition to designing from any state" ("MUST NOT unconditionally mark every artifact file pending review"; redesign applies only the configured artifact policy / reconciler), the Persistence scenario, and the code. The test covering that hop is titled "without fabricating drift" (transition-change.spec.ts:2715), i.e. the tests follow the spec text, not the stale scenario. Fix the scenario to "does not fabricate drift / artifact reopening follows the configured policy".
- LOW: `execute` JSDoc does not list schema resolution errors (SchemaNotFoundError via ResolveChangeSchema) nor errors from `evaluateTransitionCandidate`; not misleading.
  Test coverage: transition-change.spec.ts (131), -audit (6), -audit-2 (9), -ready-audit (1), reconciled-transition-status (2). Round-5 behaviors (sign-off-only mutation, designing self-entry no-op, committed recovery errors, 'next') covered.
  Missing tests: none material.

### core:invalidate-change

Requirements Summary: input contract/target validation (accumulating errors), approval guard (observe-pass verdict, stale-by-fingerprint consent recovers without force, host-neutral InvalidateRequiresForceError with gates/recoveries), recovery preview computed with the request's effective policy, canonical delegation to reconciler (atomic), cause `artifact-review-required`, policy-aware artifact effects (none/global/surgical/cascade), idempotence on already reopened targets, next action from evaluateLifecycle.
Implementation Status: implemented. Force guard and invalidation share one `reconcile.mutate` (invalidate-change.ts:171-197); `consentToRevoke` reads post-pre-pass projection (valid only); `forceRecoveries` uses the effective policy and `selectAutomaticRecovery` so ready/preserve reports no move and redesign reports designing; next action comes from evaluateLifecycle over recovered state (no hard-coded intent). Error message of InvalidateRequiresForceError is host-neutral (no `--force`); `@throws` lists ChangeNotFound, InvalidInvalidateTarget, InvalidateRequiresForce, which are the only throw sites.
Discrepancies: LOW only - preview duplicates reconciler review-target logic and its hash-only-drift test is non-discriminating (see round-5 item 2).
Test coverage: invalidate-change.spec.ts (27), -policy-audit (10), -ready-audit (6), -next-action (3); includes both-gates force, effective-policy preview, ready stays in ready, no mutation without force.
Missing tests: a discriminating test for the hash-only drift term of the preview (needs a fixture where the pre-pass does not already hold the file in review) - LOW.

### core:archive-change

Requirements Summary: constructor deps (reconcile required), `skipChecks` input (no allowOverlap/allowOutOfScope; bypassing linksInScope does not bypass filesResolved), effective archive bindings + skip validation (unknown/non-skippable/hook ids, disabled-by-schema accepted as no-op), governance (only spec.overlap and impl.linksInScope default skippable), recovery diagnostics via ReconciledOperationBlockedError with evaluateLifecycle next action, delta merge, spec metadata materialization (force, change schema), implementation materialization into spec-lock, batch restore, hooks, post-commit behavior.
Implementation Status: implemented (see round-5 item 3 for link materialization). Throw sites map to documented errors.
Discrepancies:

- LOW: `execute` JSDoc (archive-change.ts:342-350) omits errors that execute can throw: ArchiveArtifactMissingError (l.818, 839), ParserNotRegisteredError (l.832, 835, 1230), ArchiveBatchRestoreError (l.1134). The constructor JSDoc (l.~215-236) does not list InvalidCompositionFactoryArgumentsError (thrown l.276), unlike TransitionChange's constructor which does. Documentation-only.
- INFO: duplicated `@throws {InvalidStateTransitionError}` lines (l.344, 349) are intentional (two causes).
  Test coverage: archive-change.spec.ts (121), -audit (5), -batch-restore (8), -input (2), -links-audit (10), -skip-ids-audit (4); 'reconcile is required' constructor test present (archive-change.spec.ts:211).
  Missing tests: none material.

## Counts

- HIGH: 0
- MEDIUM: 1 (stale verify.md scenario "archiving to designing downgrades artifacts", core:transition-change)
- LOW: 5 (non-discriminating preview hash-drift test + duplicated review-target logic; missing linksInScope compact-examples test; ArchiveChange execute/constructor JSDoc @throws gaps; TransitionChange execute JSDoc minor omissions)
- INFO: 2 (empty-bindings indistinguishable from disabled in link materialization; intentional duplicate @throws)
- Regressions from rounds 4-6: none found. Bypass naming (skipChecks vs skippedCheckIds) and ready carve-out wording are consistent across all four specs and the code.
