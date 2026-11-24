# Partial batch A (round 13, verification-attempt-15): core:get-status, core:invalidate-change, core:lifecycle-engine, core:change

Read-only audit. Scratch copy of core in the session scratchpad was used for mutations; repo untouched.

## Evidence run

- `pnpm exec vitest run` in packages/core: 1294 suites, 4141 tests, 4139 passed, 0 failed, 2 todo (includes lifecycle-engine, change, get-status, invalidate, reconcile suites).
- `tsc --noEmit` clean for core, sdk, mcp, cli.
- get-status-merge-audit.spec.ts: 13/13 pass; invalidate-change-gates-audit.spec.ts: 16 tests (3+1+1+1+2+1+1+1+1+4), all pass.

## 1. core:get-status — `_mergeBlockers` (get-status.ts ~1012-1190)

Requirements summary (changed): a blocker for a check failing in transition and archive contexts with the same code and message is a single blocker, skippable only if skippable in every context (AND). Archive failures judged only against archive bindings; transition failures against the binding applicable to that target's attempt.

Independent re-derivation of the code:

- Maps: `transitionSkippable` and `archiveSkippable` keyed by check id; per failing candidate value = `(applicable ?? sameCheck[0]).skippable`, ANDed into the per-source map. Archive map is additionally pre-seeded as AND over ALL archive bindings of that id (only when archiveChecks non-empty).
- Merge loop: first insertion carries the map value of the first source (transitions come first); a later same-key candidate sets `isSkippable = existing && ownSkippable` (only for `ownKey` merges, not anonymous-key absorption). Count of blockers: one per (checkId, code:message); none lost, none duplicated in all enumerated combinations (same/different message x transition/archive x skippable/locked x multiple targets).
- Combos verified (tests or reasoning): T skip/A locked -> false; T locked/A skip -> false; both skip -> true; both locked -> false; same id different messages across contexts -> each uses own source map (archive message follows archive bindings, transition message follows transition bindings); multi-target same message -> single blocker, AND across targets.

Mutation testing (scratch copy, spec files merge-audit + get-status.spec):

- M1 transition AND->OR: killed (3 tests)
- M2 `applicable ?? sameCheck[0]` -> `sameCheck[0]`: killed (2 tests)
- M3 merge `existing && own` -> `||`: killed (2)
- M4 -> own only: killed (1); M5 merge AND removed: killed (1)
- M7 `applicable` = first binding: killed (2)
- M8 archive candidate reads transition map: killed (1)
- M9 verdict-blocker resolves archive before transition: killed (1)
- M6 archive pre-seed AND -> OR (`archiveSkippable` over all archive bindings of an id): SURVIVES (79/79 pass).

Discrepancies:

- MEDIUM (design/behavior): skippability maps are keyed by check id only, so two blockers of the same check with DIFFERENT messages on different targets are ANDed together even though they are not merged. Test "each attempt resolves its own binding..." (merge-audit.spec.ts:230-240) codifies `['to verifying', false]` although that blocker's own binding (to verifying) is `skippable: true`; the test title says each attempt resolves its own binding, which the expected value contradicts. Direction is conservative (never over-permits skipping), but the blocker is reported locked purely because a sibling-message blocker of the same check id is locked. Either intended (then rename test and doc comment: "a merged blocker is skippable only when skippable on every target it appears on" is imprecise because these are not merged) or per-(id,message) map needed. get-status.ts:1050-1075 and 1160-1180.
- LOW: verdict blocker with a checkId and no failing transition predicate falls back to `archiveSkippable` (get-status.ts ~1117 `?? archiveSkippable.get(...)`), comment says verdict blockers are transition-origin; this binds an archive binding verdict to a non-archive blocker when archive checks exist. Edge case, no test.
- LOW: archive pre-seed AND over all archive bindings of an id (get-status.ts ~1043-1050) is redundant with, but different from, the per-candidate resolution used for transitions (no applicability filter); not covered by any test (M6 survives).
- INFO: JSDoc/param docs for `_mergeBlockers` fine.

Missing tests: (a) multiple archive bindings of one check id with differing skippability (kills M6); (b) same check id, different messages, across transition and archive; (c) verdict blocker with checkId + archive-only bindings.

Implementation status: implemented and tested; no HIGH.

## 2. core:invalidate-change (spec + verify merged via spec-preview)

Requirements summary (changed): guard and forced-revocation recovery preview consider only ENABLED gates; a valid consent of a disabled gate is revoked without force, never in `gates`/`recoveries`; recorded as one `approval-invalidated` event (revoked, `manual-invalidation`) and reported in `projectionChanges`; not restored if gate re-enabled (next reconciliation treats it as revoked and recovers: spec -> designing after ready, sign-off -> done after done; consent must be recorded again). New verify scenarios: disabled gate revoked without force/moves nothing; disabled signoff revoked in archivable; history recording; redesign still moves nothing; re-enable does not restore; preview lists only enabled gates; only signoff previews done.

Code confirmation (invalidate-change.ts:182-201): `revoke = valid.filter(enabled)`, `disabled = valid.filter(!enabled)`; throws only when `revoke` non-empty and no force; `reconcileAfter({revoke: force ? [...revoke, ...disabled] : disabled})`. Preview uses `selectAutomaticRecovery` with only enabled gates (`forceRecoveries`). Each scenario maps to a test: disabled spec x3 states (implementing/verifying/done), signoff-only listing, only-signoff preview, force mixed, combined preview x2, disabled signoff in archivable, history event + projectionChange, redesign/none no-move, re-enable (implementing -> designing, status stays revoked), legacy parking states x4 (pending-spec-approval, spec-approved, pending-signoff, signed-off).

Re-enable behavior per state (reasoned from `approvalField`, `selectAutomaticRecovery`, `RECOVERY_ONLY_TRANSITIONS`): revoked consent with gate now required -> `isBrokenConsent`. designing/drafting: no move. ready: no recovery (spec gate blocks leaving ready, consent renewed there). pending-spec-approval, spec-approved, implementing..archiving: designing (spec). signoff revoked: done and earlier no move; pending-signoff, signed-off, archivable, archiving -> done; spec wins when both. Recovery table entries match `isAfter` axis exactly; no gaps for legacy parking states.

Discrepancies:

- LOW: spec text "a change past the gated state recovers accordingly (spec consent to `designing` after `ready`, sign-off to `done` after `done`)" is accurate but omits that a change IN `ready` stays in `ready` (covered elsewhere in the same spec for forced revocation) and that "after ready" includes the legacy parking states; consider adding "while a change in `ready` stays there and consent is renewed". Also the verify scenario only covers `implementing`.
- LOW (test gap): re-enable is tested only for `implementing` and spec gate; sign-off re-enable (archivable -> done), `ready` (stays) and a legacy parking state are untested.
- INFO: with a mixed set (enabled valid + disabled valid) and no force, the guard throws and the disabled consent is NOT revoked (atomic reject); spec does not state this but it is consistent with "Without force, no mutation occurs".

Implementation status: implemented and tested; no HIGH or MEDIUM.

## 3. core:lifecycle-engine and core:change

No regression: full core suite green. `selectAutomaticRecovery` conditions (spec: broken consent, after designing, not ready; signoff: after done; redesign: artifactReviewRequired and after designing) are consistent with every key in `RECOVERY_ONLY_TRANSITIONS` (change-state.ts:58-84) incl. legacy parking states; `Change` applies recovery via `RECOVERY_ONLY_TRANSITIONS[cause][from]` (change.ts:961). Overlap override, intents and nextAction suites passed.
Discrepancies: none new. Implementation status: implemented.

## 4. Newly exported types (~36)

- Added to core domain/application barrels, core public.ts and sdk core-reexports.ts: ArtifactFileStatus, ReviewArtifactSummary, ReviewArtifactFileSummary, ValidityStatusProjection, ApprovalStatusProjection, VerificationStatusProjection, NextAction, Blocker, ProjectionStatus, ApprovalDecision, VerificationAttempt, CompletedVerification, ProjectionInvalidation, ValidityInvalidationCause, InvalidatedArtifactEntry, ArchiveFailedEvent, ArchiveFailureStep, DescriptionUpdatedEvent, ApprovalInvalidatedEvent, VerificationAttemptStartedEvent, VerificationCompletedEvent, VerificationInvalidatedEvent, ArtifactInvalidationPolicy, WorkflowInvalidationPolicy, InvalidationPolicyOverride, SpecApprovalFingerprint, ArtifactFingerprint, ImplementationFingerprint, ValidityFingerprint, FingerprintDifference, LifecycleActionIntent, BuiltInCheckActionKind, CheckAction, CheckOutcome, AutomaticRecovery, ChangeValidityVerdict, ArtifactReviewTarget, ProjectionChange, ValidityBlocker, FingerprintInputFailure; values approveSpecAction, approveSignoffAction, startVerificationAction, refreshStatusAction.
- Duplicate identifier scan (parsed all `export {}` blocks): core public.ts 760 names, sdk core-reexports.ts 723 names, zero duplicates in either; no type-vs-value collision. Names in core public not in sdk: pre-existing internal/composition ones (CountTasks\*, KernelBuilder, CheckBinding, etc.), none from the new set; sdk-only: CORE_VERSION.
- `tsc --noEmit`: core, sdk, mcp, cli all clean (cli/mcp `import type` consumers fine).
- LOW/INFO: `SpecOverlapError` and `ArchiveDependencyMismatchError` were REMOVED from core errors barrel, public.ts and sdk reexports (files deleted: packages/core/src/domain/errors/{spec-overlap-error,archive-dependency-mismatch-error}.ts, plus test spec-overlap-error.spec.ts). No remaining references in packages src/test; only stale generated docusaurus artifacts under apps/public-web/.docusaurus mention them. This is a public API removal (breaking for external consumers) in a "decouple error messages" change; confirm intended and covered by a spec/changelog.

## Counts

- HIGH 0, MEDIUM 1, LOW 5 (merge archive fallback, merge pre-seed untested mutation, spec text precision, re-enable test gap, removed error exports API break), INFO 2.
- Missing tests: 3 (get-status) + 1 group (invalidate re-enable per state).
- Mutations: 9 run, 8 killed, 1 survived (M6).
