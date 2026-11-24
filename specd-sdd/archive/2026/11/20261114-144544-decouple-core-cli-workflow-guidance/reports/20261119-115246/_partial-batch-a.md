# Round 10 partial batch A: core:get-status, core:lifecycle-engine, core:change, core:workflow-model

Read-only audit. Scratch probe (outside repo): scratchpad/probe.spec.ts, results in scratchpad/probe-out.txt.

## Tests run

- core: test/application/use-cases/get-status\*, test/domain/services, test/application/checks, test/domain/checks: 820 passed / 0 failed (210 suites).
- core: test/application/services (lifecycle-guidance etc.): 80 passed / 0 failed.

## core:get-status (changed: Identifies blockers merge paragraph, 2 scenarios)

Spec (get-status spec.md line ~189): verdict blocker and failed check merge only when code AND gate match: APPROVAL*\* <-> approval.spec; SIGNOFF*_ <-> approval.signoff; VERIFICATION\__ <-> verification.current; merged entry carries check message/label/checkId/action. Scenarios: same-gate merge; different gates (SIGNOFF_STALE vs approval.spec APPROVAL_STALE) not merged.

Implementation: get-status.ts:419-452 (VALIDITY_TWIN_CODES + validityTwinCode), \_mergeBlockers 997-1120. Verified.

Producible blocker codes

- Verdict (change-validity.ts ~565-640): ARTIFACT_DRIFT, ARTIFACT_REVIEW_REQUIRED (never pair: right), APPROVAL_REQUIRED/STALE/REVOKED, SIGNOFF_REQUIRED/STALE/REVOKED, VERIFICATION_REQUIRED/IN_PROGRESS/STALE.
- Checks that can share a code: approval.spec (APPROVAL_REQUIRED/STALE/REVOKED, gate spec): maps 1:1, right. approval.signoff emits APPROVAL_REQUIRED, APPROVAL_STALE (also for revoked), and VERIFICATION_IN_PROGRESS/REQUIRED/STALE (gate signoff). verification.current emits VERIFICATION_REQUIRED/IN_PROGRESS/STALE and VERIFICATION_VALIDITY_UNAVAILABLE (no verdict twin: correct). Other checks (impl._, hook._, deps, overlap, etc.) have their own codes, no verdict twin.
- Spec-vs-signoff confusion is fixed: verdict SIGNOFF_STALE no longer collapsed with approval.spec APPROVAL_STALE (probe + audit test 'keeps stale spec consent and a stale sign-off failure as two blockers').

Real-fixture probe (done state, signoff gate on, stubbed verdict via reconcileAs):

1. signed + stale verification -> ONE blocker VERIFICATION_STALE "Verification evidence is stale", checkId verification.current, action start-verification. No duplicate. (The approval.signoff VERIFICATION_STALE failure has the same code+message as verification.current's so it dedupes by key, and the verdict twin is absorbed.) Good.
2. signed + attempt-active -> single VERIFICATION_IN_PROGRESS (same reason, identical message). Good.
3. signed + absent verification -> TWO blockers: VERIFICATION_REQUIRED "Completed verification is required before signoff" (checkId approval.signoff, no action) and VERIFICATION_REQUIRED "Completed verification is required" (verification.current, start-verification). Duplicate for the same condition.
4. revoked signoff -> TWO blockers: APPROVAL_STALE "Signoff is stale" (approval.signoff, approve-signoff) AND SIGNOFF_REVOKED "Sign-off is revoked" (no checkId/action).
5. unsigned + stale verification -> two distinct blockers (approval.signoff APPROVAL_REQUIRED, verification.current VERIFICATION_STALE): correct, distinct conditions.

So the answer to the specific question: a VERIFICATION\_\* from approval.signoff does not twin with the verdict blocker, but in the realistic stale/in-progress cases the user still sees ONE blocker (message equality + verification.current twin). The duplicate appears only for absent verification (message wording differs) .

Implementation Status: implemented, tests pass.

## Discrepancies

- MEDIUM-LOW (LOW-MEDIUM) D1: revoked sign-off is reported twice with contradictory codes. domain/checks/approval-signoff.ts:36-47 maps status 'revoked' to APPROVAL_STALE "Signoff is stale", while verdict says SIGNOFF_REVOKED; table in get-status.ts:430-434 has no pairing for SIGNOFF_REVOKED (only APPROVAL_REVOKED <-> SIGNOFF_REVOKED, which approval.signoff never emits). Probe case 4. Violates "MUST merge into one public blocker" for the same condition. Fix: emit APPROVAL_REVOKED from approval.signoff for revoked (and keep table), or map APPROVAL_STALE also to SIGNOFF_REVOKED when verdict says revoked. Not covered by tests (tests cover only stale and absent).
- LOW D2: signed sign-off with absent verification yields duplicate VERIFICATION*REQUIRED blockers (probe case 3), because approval.signoff's VERIFICATION_REQUIRED message ("...before signoff") differs from verification.current's and it is not a twin. Edge state (verification required, sign-off valid, verification absent) but the merge key relies on message text equality for cases 1-2 (fragile: reword either message and stale/in-progress would duplicate too). Suggest pairing approval.signoff VERIFICATION*_ by code via a dedupe on (code, checkId-set) or dropping the VERIFICATION\__ fallbacks from approval.signoff since verification.current is bound on the same edges (check-bindings.ts:118-141).
- LOW D3: ordering dependence in \_mergeBlockers (get-status.ts:1074-1085): twin replacement requires !merged.has(key); if a non-twin check (approval.signoff) already inserted the same key first, verification.current falls into the 'existing' branch and only copies the action. Works today (probe 1,2) but the verdict twin disappears only incidentally.
- INFO D4: spec sentence says sign-off codes SIGNOFF\_\* "pair with the approval.signoff check" but the check's own failure codes are APPROVAL_REQUIRED/APPROVAL_STALE (mapped through the table). Spec should state the code mapping (APPROVAL_REQUIRED->SIGNOFF_REQUIRED, APPROVAL_STALE->SIGNOFF_STALE) and that revoked is reported as stale by the check, or code should be changed (see D1).

Missing tests: revoked sign-off (D1); signed sign-off with absent/stale/in-progress verification asserting exactly one verification blocker (D2/D3; get-status.spec 'raises no verification blocker...' covers only verifying-disabled); verification.current VERIFICATION_VALIDITY_UNAVAILABLE not merged; verdict APPROVAL_REVOKED vs approval.spec revoked merge.

Discriminating power of new tests: audit test 'keeps stale spec consent and a stale sign-off failure as two blockers' discriminates the old code-only merge (would collapse to 1 entry). 'reports a missing sign-off once' discriminates (verdict SIGNOFF_REQUIRED absorbed by approval.signoff APPROVAL_REQUIRED, which a code-only match would not). 'routes a blocked done to the sign-off action' (get-status.spec.ts:1690) asserts single approval.signoff blocker with action, no SIGNOFF_REQUIRED, intent null: discriminating. Verified passing.

## core:lifecycle-engine (new scenarios: blocked ready without action -> no intent; stale verification at archivable -> verify)

- lifecycle-guidance.ts:88-100 (resolvePhaseIntent: verification boundary -> 'verify' when validity.recovery === null and verification stale/absent/attempt-active), 147-190 (intentForStateAndHop falls through to null for blocked ready since nextHop.targetStep === state and not a drain state), 59 (action only from failed hop check, supersedesIntent). Matches scenarios; tests lifecycle-guidance.spec.ts:384 and 399 (plus 414 archive when current). Pass. No discrepancies. INFO: 'attempt-active' also routes verify at archivable (not in scenario; consistent with spec intent).

## core:workflow-model (new text)

- gm flag: spec step 5 'gm' matches count-tasks.ts:57-58. OK.
- hasTasks: artifact-type.ts:145 default false; requiresTaskCompletion validation uses hasTasks at buildSchema (spec ln 91, 186) - consistent with earlier rounds.
- hook.pre along any except recovery: check-bindings.ts:150-158 (applicability along '\*', exceptAlong ['recovery']); enforced at lifecycle-verdict.ts:794 and evaluate-transition-predicates.ts:33. hook.post forward only per spec. OK.
- taskCompletion at archive scope: workflow-task-completion.ts:57-95 iterates steps with non-empty requiresTaskCompletion, first failing result wins, skip when none; binding scope archive at check-bindings.ts:~228. Matches spec ln 104. Side note LOW/INFO: archive-scope skip/pass detail includes byArtifact; fine. Transition binding also has exceptAlong recovery for workflow.taskCompletion and one more check (check-bindings.ts:40-47) that spec text does not mention explicitly (INFO).
  No HIGH/MEDIUM discrepancies.

## core:change

No round-10 changes touching it found; spot-checked via test pass (820/0). No new discrepancies.

## Counts

HIGH 0, MEDIUM 0 (D1 rated LOW-MEDIUM; treat as MEDIUM if "MUST merge" is strict), LOW 3 (D1, D2, D3), INFO 2 (D4 + taskCompletion binding note). Missing tests: 4 groups.
