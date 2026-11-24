# Partial batch A (round 12, verification-attempt-14): core:get-status, core:invalidate-change, core:lifecycle-engine, core:change

Read-only audit. Scratch artifacts only in the session scratchpad (matrix.spec.ts, gs.spec.ts, rec.spec.ts).

## core:invalidate-change

### Requirements summary (changed)

- Guard/preview consider only gates enabled in `approvals` (spec line 52): disabled gate with valid consent is revoked without force, never in `gates`/`recoveries`.
- Preview = single combined recovery (spec > signoff > redesign) using the effective policy, every gate listed with that target (line 56); only-signoff previews `done` past done (line 58).
- Line 64: "Explicit invalidation of a valid approval requires force=true" (general statement).

### Implementation status: COMPLIANT

- `invalidate-change.ts` (`validConsent`, `revoke`/`disabled` split, `forceRecoveries`, `previewArtifactReviewRequired`): matches spec 52/56/58.
- Disabled consent is passed in `intent.revoke` (`disabled` without force, `[...revoke, ...disabled]` with force). Reconciler `fieldAfter`/`approvalField` keep a disabled gate as `not-required`, so it never feeds `selectAutomaticRecovery`.
- Independent matrix (scratch): 11 states (designing, ready, implementing, verifying, done, archivable, archiving + legacy pending-spec-approval, spec-approved, pending-signoff, signed-off) x spec gate on/off x signoff gate on/off x spec consent y/n x signoff consent y/n x policy none/surgical/downstream/global x workflow preserve/redesign = 1408 cases, each run with force=false and force=true on identical fresh builds. Checked: (a) force required iff an enabled gate has valid consent; (b) `gates` equals the enabled valid set; (c) every previewed `recoveries[].target` equals the final state of the forced run; (d) preview does not mutate; (e) no-force success final state equals forced final state; (f) forced run revokes all consents; (g) disabled consent revoked without force; (h) history: exactly one `approval-invalidated` event (status revoked, cause `manual-invalidation`) per revoked disabled gate. Result: 616 previews, 472 forced runs that moved the state, 88 multi-gate previews, 0 mismatches, 0 throws (RECOVERY_ONLY_TRANSITIONS covers every selected recovery).
- Extra: `selectAutomaticRecovery` x RECOVERY_ONLY_TRANSITIONS exhaustive check: 1200 combos (12 states x 5 x 5 fields x 2 workflows x 2), 0 recovery without a table entry.
- History: revocation of a disabled gate IS recorded (`markApprovalInvalid` pushes `approval-invalidated`, status revoked, cause manual-invalidation, reason = request reason). Not stated in the spec (see D2).
- Apart from forced-through-redesign: with only disabled consent and workflow redesign + review required, no force is needed yet the state moves to designing; this is the same as the no-consent case (policy-driven, not consent-driven), consistent with spec 56.
- Approvals source: `InvalidateChange._approvals` and reconciler `deps.approvals` both come from `config.approvals` (composition-resolver.ts:593, 723); they could diverge only in hand-wired tests.

### Discrepancies

- D1 LOW (INFO-ish) spec wording: core:invalidate-change line 64 states "Explicit invalidation of a valid approval requires `force=true`" without the enabled-gate qualifier that line 52 adds; contradicts scenario "Valid consent of a disabled gate is revoked without force" if read literally. Suggest "of an enabled gate".
- D2 INFO spec silent: audit-history event for a silently revoked disabled-gate consent (code emits one). Consider a scenario or sentence.
- D3 INFO: scenario for disabled gate only covers spec gate in `implementing`; signoff-disabled symmetry, `verifying`/`done`, legacy states are code-correct (matrix) but only partly tested.

### Missing tests (invalidate-change-gates-audit.spec.ts)

Discriminating for: disabled spec in implementing/verifying/done (state kept, revoked), only-signoff listing with target done, forced mixed, combined both-gates preview. Missing: disabled SIGNOFF gate with valid signoff consent; history event assertion for a disabled revocation; legacy parking states with disabled gates; redesign override combined with disabled gate. Would fail on regression of `revoke` filtering (yes) but not on history removal.

## core:get-status (`_mergeBlockers`)

### Requirements summary (changed)

- Families spec-consent / signoff-consent / verification; family check failure drops all checkId-less validity blockers of the family, adopted action; per-artifact codes never merged.
- Line 198: per-target skippability from the target's resolved binding (archive from archive bindings only); same check id on several targets merges skippable only if skippable on every target (AND).

### Implementation status: COMPLIANT except D4

- Per-target AND via `transitionSkippable` map, binding chosen by `bindingMatches(b, attempt, attempt.along)` with fallback `sameCheck[0]`; dedupe key `checkId\0code:message` with anonymous-key absorption. Existing scenarios (AND four-way, distinct checks sharing text, adopted action, archive bindings only) pass.
- Order: reviewBlockers first (insertion order), then check failures in target order, then archive; merged Map keeps first position; no order-sensitive consumer found (`_nextActionAfterArchiveOverlap` uses every/find only).
- No lost blocker found: distinct checks with identical code:message stay apart; checkId-less blocker is absorbed by at most one check id.

### Discrepancies

- D4 MEDIUM wrong skippable flag (new-problem hunt, verified by scratch test copying get-status-merge-audit harness): when the same check id fails on a transition target AND in the archive predicates with identical code:message, ownKey is identical, so the archive failure hits `merged.has(ownKey)` and is `continue`d; the merged blocker keeps ONLY the transition skippability. Result matrix (transition skippable / archive skippable -> merged isSkippable): true/false -> TRUE (wrong: archive binding is locked), false/true -> false, true/true -> true, false/false -> false. Violates line 198 (archive failures from archive bindings only) and the AND rule. Realistic: `impl.linksInScope` is bound on `to: verifying along: *` (reachable from archivable) and on archive; a schema `archiveChecks: [{id: impl.linksInScope, skippable: false}]` while the transition stays skippable triggers it. Evidence: get-status.ts:~1127-1160 (final loop, `merged.has(ownKey)` then `continue` without AND-ing archive verdict) and ~1086-1100 (verdict blocker skippability `transitionSkippable ?? archiveSkippable`). Fix: when an archive failure collides with an existing key, AND `archiveSkippable.get(id)` into `existing.isSkippable`, or include source in the key.
- D5 INFO: `archiveSkippable` is seeded for every archive binding when `archiveChecks.length > 0` (not only failing ones), so a checkId-bearing verdict blocker with no transition failure row falls back to a non-failing archive binding verdict; unreachable with current verdict producers.

### Missing tests

get-status-merge-audit.spec.ts "archive failures use archive bindings only" uses different messages for transition and archive failure, so it cannot expose D4. Add a same-message case (true/false). get-status-families.spec.ts fine for families.

## core:lifecycle-engine and core:change (spot check)

- Full @specd/core suite: 1272 suites, 4053 tests, 4051 passed, 0 failed, 2 not run (todo/skipped), 0 failed suites.
- selectAutomaticRecovery vs RECOVERY_ONLY_TRANSITIONS consistent (above); `ready` excluded from spec recovery by design, covered in spec 64.
- No regression observed in overlap override / intents (covered by passing get-status, invalidate-change, reconcile-change-validity suites). No dedicated deep dive beyond tests.

## Counts

HIGH 0, MEDIUM 1 (D4), LOW 1 (D1), INFO 3 (D2, D3, D5). Missing tests: 5 items (4 for invalidate, 1 for merge D4).
