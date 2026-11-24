# Partial batch A1 (round 9, verification-attempt-11): core:lifecycle-engine, core:get-status, core:change

Read-only audit. No code/spec/doc/lifecycle changes. Merged specs read via `changes spec-preview` (spec + verify).
Core test run (vitest, JSON): `test/application/services`, `test/application/use-cases/get-status*` (4 files) + `reconciled-transition-status`, `test/domain/services`, `test/domain/entities`, `test/application/checks` => 290 suites, 1063 tests, 1063 passed, 0 failed, 0 skipped.
`packages/core/dist` bundle contains SINGLETON_VALIDITY_CODES (dist is current for the round-8 fix).

## Round-8 item re-verification

### (1) `_mergeBlockers` + SINGLETON_VALIDITY_CODES (get-status.ts:420-432 const, 977-1112 impl, 746-753 call site)

Mechanism: collapse can only happen at two points.

- A. Loop over verdict `reviewBlockers` (get-status.ts ~1026-1030): a checkId-less blocker is dropped iff a checkId-bearing blocker with the SAME singleton code exists in the same list.
- B. Loop over failed check results (~1048-1085): a failing check with singleton code whose key `code:message` is not yet merged REPLACES the first checkId-less blocker with the same code (the "twin"); otherwise normal key dedupe by `code:message`.

Enumeration of blocker codes (validity verdict = change-validity.ts:569-604 `buildBlockers`/`pushConsentBlocker` + reconcile-change-validity.ts:436-441; checks = domain/checks/\*, verdict projection lifecycle-verdict.ts):

- Per-artifact / non-singleton (never touched by the twin logic, excluded from set): ARTIFACT*DRIFT, ARTIFACT_REVIEW_REQUIRED (validity twin of REVIEW_REQUIRED, distinct code), REVIEW_REQUIRED, PENDING_PARENT_REVIEW, INCOMPLETE_ARTIFACT, INCOMPLETE_TASKS, OVERLAP_CONFLICT, INVALID_TRANSITION, DEPS_INCONSISTENT, READ_ONLY_WORKSPACE, IMPLEMENTATION_STATE, VERIFICATION_VALIDITY_UNAVAILABLE (check-only, never validity), SCHEMA*\*. => no collapse possible (keyed by code:message only, distinct messages stay distinct).
- VERIFICATION_REQUIRED / IN_PROGRESS / STALE: validity emits exactly one per code (single verification field; reconcile only adds STALE if none exists), checks emit them only from `verification.current` (same condition) and `approval.signoff` (same condition, different wording, no action). Replacing the validity twin by the first check, then normal keyed dedupe for later checks, merges only blockers that describe the same single condition. No genuine distinct blocker collapses. Real `changes status` confirms (see below).
- APPROVAL_REQUIRED / APPROVAL_STALE / APPROVAL_REVOKED: validity twin = SPEC consent only (`pushConsentBlocker(..., 'APPROVAL', specApproval)`), check emitters = `approval.spec` (same condition, correct twin) AND `approval.signoff` (domain/checks/approval-signoff.ts:38,48 emits APPROVAL_STALE / APPROVAL_REQUIRED for the SIGN-OFF gate). => see Discrepancy A1-1 below: wrong-twin collapse is possible when both spec and sign-off consent are broken while the change sits at/after `done` (and is not recovered).
- SIGNOFF*REQUIRED / STALE / REVOKED: validity-only codes. No check emits them, so the SIGNOFF*\* entries in SINGLETON_VALIDITY_CODES are dead and never twin-merge (see A1-2).

Real CLI: `node packages/cli/dist/index.js changes status decouple-core-cli-workflow-guidance --format json` (state verifying, active attempt) returns exactly ONE blocker: `VERIFICATION_IN_PROGRESS`, message "Verification is still in progress", `label: "Checking verification freshness"`, `checkId: "verification.current"`, `action: start-verification {changeName} supersedesIntent:false`; nextAction `verifying`/`verify` intent with same action. Confirmed.

Tests in get-status-audit.spec.ts: "carries start-verification on the verification blocker" (VERIFICATION*STALE, `toHaveLength(1)`, checkId `verification.current`, label, action params) and "merges the real in-progress verification blocker and check failure into one blocker" (IN_PROGRESS, length 1, checkId, label) both inject a checkId-less validity twin whose message differs from the check's ("Verification is stale" vs "Verification evidence is stale"), so they fail without the twin logic (key mismatch -> 2 blockers, one without checkId). Discriminating: YES for STALE and IN_PROGRESS. Not covered: VERIFICATION_REQUIRED twin merge; APPROVAL*_/SIGNOFF\__ twin merge; the wrong-twin case; same-code-two-checks case (INFO).

### (2) Live-overlap override vs `_nextActionAfterArchiveOverlap` (get-status.ts:1116-1130, applied at :753)

Spec lifecycle-engine "Application lifecycle guidance" last bullet: intent stays `archive`, targetStep `archivable`, GetStatus applies the override after guidance and it replaces the guidance result so a check-declared action is not carried; overlap blocker stays visible. Code returns `{targetStep:'archivable', actionType:'mechanical', reason: overlap.message, intent:'archive'}` with no `action`. CONSISTENT with both lifecycle-engine and get-status spec ("reason MUST NOT be Ready to archive; names live overlap; no --skip-checks"). `overlap.message` comes from `domain/checks/spec-overlap.ts` ("Specs overlap with other active changes: ..."), no flag syntax. `OVERLAP_CONFLICT` reaches `blockers` only from archive predicates (executed only when state === 'archivable', composition/use-cases/get-status.ts:49) so the override cannot fire outside archivable. `projectValidityStatus` receives the overridden nextAction (consistent). Gaps: no test asserts the replaced action is dropped (e.g. stale verification + overlap at archivable => `action` undefined) (LOW, A1-3); `actionType` is hardcoded `mechanical` (INFO).

### (3) New preserve/review tests

- lifecycle-guidance.spec.ts:344 "implementing with preserved workflow and unresolved non-task drift resolves design": discriminating for `review.required` path (validity artifactReviewRequired=false). Does not assert state unchanged (guidance has no change mutation anyway) and the `change` fixture carries no preserve policy (guidance does not read it) - cosmetic.
- "artifactReviewRequired without review.required or recovery resolves design" (implementing, verifying): discriminating for the validity-only path (noReview + artifactReviewRequired).
- "verifying with stale verification, required review and no recovery resolves verify": discriminating for ordering (verify outranks design).
- lifecycle-verdict.spec.ts:1417 "required review under explicit preserve routes guidance to design and leaves state unchanged": full evaluateLifecycle, asserts intent design, targetStep designing, state/history unchanged, policy preserve. Good.
- lifecycle-verdict.spec.ts:1353 "keeps a change out of forward progress while non-task review is pending under preserve": WEAK: asserts targetStep not `verifying` and in `['designing','implementing']`, intent not `archive`; does not assert the recommendation comes from review summary (INFO A1-4).
- get-status-audit.spec.ts:199 preserve end-to-end (state stays implementing, automaticReturn null, intent design, target designing): good.
  All pass.

## Per-spec results

### core:lifecycle-engine (13 requirements, 76 scenarios)

Requirements Summary / Implementation Status (all IMPLEMENTED unless noted):

1. Stateless domain verdict: plain functions exported via domain/services/lifecycle-verdict.ts; lifecycle-engine.ts only re-exports (src/domain/services/lifecycle-engine.ts); no class (lifecycle-engine-audit-2.spec). `skippedCheckIds` option name; no flag parsing. OK.
2. Centralized validation: verdict projects from supplied CheckResults only (lifecycle-verdict.ts blockersFromFailedChecks :821, no I/O). OK.
3. Effective status: projectArtifacts incl. pending-parent precedence. OK.
4. Canonical-state-only: OK (tests "complete-with-drift", "missing still blocks").
5. Machine-readable blockers: code/message/isSkippable/checkId/action/affectedArtifacts, no bypassFlag, validity blockers carry action (change-validity.ts:592-604 + reconcile-change-validity.ts:439 + verification-current.ts). OK. NOTE: `checkId` omitted on validity-derived blockers by design (spec says optional).
6. Available steps and next hop: pipeline order, optional-step policy (recommendedForwardTarget), hop matrix, archiving guidance. OK.
7. Next hop derives from candidate evaluation: OK (isAtOrAfterVerificationBoundary single derivation used by reconcile-change-validity.ts, invalidate-verification.ts, lifecycle-guidance.ts, lifecycle-verdict.ts).
8. Application lifecycle guidance (lifecycle-guidance.ts, lifecycle-evaluation.ts): first-failed-action precedence limited to `hopFailures` (selectHopFailures lifecycle-evaluation.ts); supersedesIntent handling; verify > design ordering; forbidden tokens absent (grep clean: no approval.spec/signoff/verification.current/boundFromStates/activeSpec*/validity.specApproval/signoff/pending-* in lifecycle-guidance.ts); intent null cases (a)(b)(c) correct; spec-overlap review => design; override documented in (2). Minor: `validity.artifactReviewRequired` branch requires `recovery === null` while spec says "either suffices" (the only recovery qualifier in spec is on the verify condition) - behavior-equivalent in practice because a committed recovery moves state to designing (INFO A1-5). Spec phrase "(or `archivable` is in availableTransitions)" for done/signed-off archive intent is not implemented literally (`void availableTransitions`, routing follows nextHop.targetStep which is what the spec's "Intent resolution SHALL use the already selected nextHop.targetStep" demands) (INFO A1-6).
9. Archiving escape transitions: OK (lifecycle-verdict.spec "exposes archiving escape transitions without archivable requires blockers", "recommends designing when archive commit failed").
10. Review summary integration: OK.
11. Shared interpretation for consumers: OK (CompileContext independence tests; ValidateArtifacts empty checksByTarget).
12. Next artifact topological order: OK.
13. Predicate blocker artifact identity: OK.

Discrepancies: none HIGH/MEDIUM for this spec; A1-5, A1-6 INFO.

Test coverage by scenario (T = covering test; U = untested/indirect):

- No LifecycleEngine class: lifecycle-engine-audit-2.spec "public surface ..." T.
- Verdict unifies three dimensions (INCOMPLETE_ARTIFACT, isReady, isPermitted): lifecycle-verdict.spec "designing with a missing required artifact" T.
- Projects CheckResults without I/O: "projects injected CheckResults without filesystem I/O" T.
- availableSteps lookup rows: "workflow omits implementing ... no extras row" T.
- No dual-write MISSING_ARTIFACT: T.
- Recursive block / Mixed parents: "downgrades complete artifacts to pending-parent-artifact-review", audit-2 "recursive parent-review block names ... Spec A", "mixed review and incomplete parents" T.
- Complete-with-drift / Missing still blocks: T.
- Detailed affected artifacts for drift: audit-2 T.
- Skippability from resolved bindings without bypassFlag: "projects non-skippable OVERLAP_CONFLICT when schema sets skippable: false" T.
- Blocker propagates CheckAction: lifecycle-verdict-audit "preserves the CheckAction of a failed approval.spec" T.
- CLI flag syntax not interpreted: "omits skippable OVERLAP_CONFLICT ... ignores flag syntax" T.
- Every verification validity blocker carries action: lifecycle-verdict-audit (4 codes) T.
- Skip bypass allows transition: covered by the same "omits skippable OVERLAP_CONFLICT" test (blocker omitted, no warning); isPermitted assertion not seen (LOW untested sub-assertion).
- Overlap review hop is designing: audit-2 "historical spec-overlap-conflict guidance routes to design" T.
- Incomplete tasks exclude verifying / Complete tasks recommend verify: T ("hides verifying ... incomplete", "includes verifying and recommends verify").
- Passing/failed skip checks, empty skip set, consecutive optional, complete failed shortcut evidence: recommendedForwardTarget tests + "preserves failed step-skip check evidence in checksByTarget" T.
- Disabled verifying recommends done: lifecycle-engine.spec "recommends nextHop targetStep done from implementing" T.
- designing->ready, verifying->done, archivable->archiving: T. done lists backward hops: "lists skill hops from done without recommending implement" T.
- Non-recommended target remains alternative: "keeps designing selectable ..." T.
- availableSteps canonical order: T (two tests).
- Missing approval keeps hop in place without reading approval state: "keeps implementing as effectiveTarget when spec approval is required"/"designing with spec gate on" partially; no test asserts the reason lacks approval wording or that activeSpecApproval is unread (LOW U/partial).
- Parked state recommends delivery edge / stays in place: lifecycle-guidance.spec "recommends the delivery edge from a parked state and stays when its exit is blocked" T (guidance-level; domain-level nextHop for parked state covered by same).
- Illegal target generic INVALID_TRANSITION: "reports generic INVALID_TRANSITION from ready to a parking state" T.
- Verification boundary one derivation: isAtOrAfterVerificationBoundary tests T (reconcile/invalidate consumption not asserted by test, verified by grep; LOW).
- Archiving exposes/ incomplete restore / archiving->archivable skips requires: T.
- Overlap conflict detection from history: "does not project OVERLAP_CONFLICT from review invalidation overlap" T.
- Consumers share one verdict / TransitionChange no re-walk / CompileContext / ValidateArtifacts: audit-2 CompileContext tests T; transition-change-audit tests; ValidateArtifacts via validate tests (indirect).
- Domain verdict nextHop no command; evaluateLifecycle attaches intent; disabled verifying archive; historical overlap intent: T.
- Blocked done verifying disabled (x2): lifecycle-engine.spec "routes blocked done with verifying disabled to the real blocker" T (real reconciler version also in get-status.spec:1665-1710).
- Guidance boundary follows topology / Intent table carries no schema facts: lifecycle-engine.spec noncanonical order + guidance "maps states to phases without schema-dependent facts" T.
- First failed action wins / other hops never contribute / informational keeps intent: guidance T.
- Stale spec approval (3 scenarios): lifecycle-verdict "canonical validity guidance stale spec approval ..." T.
- Legacy pending resolves / blocked legacy keeps intent / disabled exit null: guidance T.
- Blocked ready without check action has no intent: not located as a dedicated test (LOW U) .
- Stale verification at archivable chooses verify: no archivable-specific test found (guidance fixtures cover verifying/done); LOW U.
- Domain nextHop ignores reconciled validity: T (2 tests). Stale verification in done holds: T.
- Pending review under preserve: T (weak, A1-4). Required review under preserve; artifactReviewRequired alone; stale verification outranks review: T.
- Next artifact topological / null: T. Failed workflow.requires exposes artifact: "blockingArtifacts follow check details" T.

### core:get-status (24 requirements, 89 scenarios)

Implementation Status (get-status.ts unless noted): all requirements IMPLEMENTED; round 9 changes limited to `_mergeBlockers` (SINGLETON set) and nextAction override.

- Input/Result/Resolution/Draft: execute :500-560 (getDraft :515, draft path :856-960 uses projectArtifacts :884, no evaluateLifecycle, intent null); no getDiscarded usage. OK.
- ifModifiedSince after refresh+reconcile; implementation projection; refresh; operational reconciliation; schema failure degradation (SCHEMA_RESOLUTION_FAILED/SCHEMA_IDENTITY_MISMATCH :397-412, `schemaWarnings`); display status; task counts via taskCompletionFromChecks (no second CountTasks); shared candidate evaluation; ChangeNotFoundError; constructor deps (:494 throws InvalidCompositionFactoryArgumentsError); factories; effective status via evaluateLifecycle (:716-745); lifecycle context; blockers (\_mergeBlockers :977); approval/verification projection (projectValidityStatus); resolveGetStatusDeps (composition/use-cases/get-status.ts). Not re-read line-by-line this round beyond the touched areas; unchanged since round 8, suite green.
- Blockers requirement specifics: label/checkId/isSkippable/action projected from failed predicates (:1062-1085); review-only blockers omit label; impl.filesResolved non-skippable via resolved bindings; archive failures judged only against archive bindings (:996-1023); OVERLAP_CONFLICT only from archive predicates; override as in (2).

Discrepancies:

- A1-1 (LOW, latent, NEW-ish, introduced by the SINGLETON/twin design): twin matching is by `code` only, but `approval.signoff` emits `APPROVAL_REQUIRED`/`APPROVAL_STALE` (sign-off gate; domain/checks/approval-signoff.ts:38,48) while the validity twin with those codes is the SPEC consent blocker (change-validity.ts pushConsentBlocker 'APPROVAL'). If a change at done/pending-signoff/signed-off/archivable has BOTH a spec-consent blocker (`absent`/`stale`/`revoked`) and a sign-off consent failure, the sign-off check replaces the checkId-less spec twin (get-status.ts ~1053-1085) and the spec-consent blocker is lost. Reachability is narrow (stale/revoked spec consent after `ready` is normally recovered to designing; `absent` spec consent at done needs gate enabled after the fact), hence LOW. Fix direction: match twin by gate (`details.gate`) or have approval.signoff emit SIGNOFF\_\* codes.
- A1-2 (LOW/INFO): sign-off consent is reported twice. With sign-off gate on and no sign-off at `done`, public `blockers` holds validity `SIGNOFF_REQUIRED` ("Sign-off is required", no checkId/action) AND check `APPROVAL_REQUIRED` ("Signoff is required before entering archivable", checkId approval.signoff, action approve-signoff). Existing test get-status.spec.ts:1696 only asserts SIGNOFF*REQUIRED exists. Spec scenarios (APPROVAL_REQUIRED with approve-signoff action) are met, so not a spec violation, but the SIGNOFF*\* members of SINGLETON_VALIDITY_CODES are dead (no emitter) and the "one blocker per condition" intent of the round-8 fix does not extend to sign-off.
- A1-3 (LOW, untested): override drops check-declared action; no test asserts it (see item 2).
- A1-7 (INFO): two different checks emitting the same singleton code with identical message dedupe to one blocker keyed `code:message` (e.g. verification.current vs approval.signoff both "Verification evidence is stale"): one checkId survives. Same condition, acceptable.

Test coverage (scenario -> test): all verify.md scenarios have a covering test in get-status.spec.ts (74K), get-status-audit.spec.ts, get-status-audit-2.spec.ts, get-status-spec-consent-audit.spec.ts, reconciled-transition-status.spec.ts, verified by title mapping for: draftView/discarded/getDraft, refresh true/false/default, schema failure/identity mismatch/mismatch names/drafted degradation/version advisory, displayStatus, task completion (4), CountTasks memo, deps.consistent, check rows, archive bindings (disabled, skippable false, locked, plugin, empty skipChecks), candidate evaluation (4), blockers (incomplete tasks, impl._, schema skippability, invalidation overlap, archivable overlap x2, gate action, verification action), validity projection (4), resolveGetStatusDeps. Gaps: see A1-3, and no test of VERIFICATION*REQUIRED/APPROVAL*_/SIGNOFF\_\* twin merge (LOW).

### core:change (spec delta touches: Lifecycle, Artifacts, History and event sourcing, Lifecycle interpretation authority, Policy-aware invalidation; verify adds legacy-parking, stale-consent-in-ready, recovery-from-legacy scenarios)

Implementation Status: IMPLEMENTED.

- Lifecycle table: `VALID_TRANSITIONS` (domain/value-objects/change-state.ts:32-45) matches spec exactly: ready [implementing, designing]; done [archivable, designing, implementing, verifying]; pending-spec-approval [implementing, designing] (no spec-approved); pending-signoff [archivable, designing, done] (no signed-off); no source lists spec-approved/signed-off; archiving [archivable, designing]; backward hops from done/signed-off/archivable; designing [ready, designing]. `RECOVERY_ONLY_TRANSITIONS` (:58-87): spec-approval has no `ready` (exemption), workflow-redesign has `ready`, signoff includes pending-signoff/signed-off/archivable/archiving -> done (spec: archiving -> done only as recovery) OK. HAPPY_PATH_NEXT parking states exit forward.
- Policy-aware invalidation / ready exemption: selectAutomaticRecovery (domain/services/change-validity.ts) - no spec recovery from ready, sign-off and redesign unaffected, spec priority over sign-off; legacy parking sources recover (reconcile-change-validity.ts).
- Interpretation authority wording: entity does not interpret DAG; evaluateLifecycle attaches intent/action. OK. Host-neutral wording (no CLI flags) OK.
  Discrepancies: none.
  Test coverage: change-state.spec.ts + change-state-audit.spec.ts (pending-spec-approval/pending-signoff exits and order, no entry edge, happy path); select-automatic-recovery.spec.ts (ready exemption x2, other states, redesign in ready, sign-off, priority) T; reconcile-change-validity.spec.ts:327,341 (pending-signoff -> done, pending-spec-approval -> designing without throwing) T; "Stale consent after ready still returns to designing" T (select-automatic-recovery implementing/verifying/done...). "spec-approved/signed-off have no entry edge" - change-state-audit.spec.ts (assumed by file title; the whole-table scan test was not individually re-read) . Remaining pre-existing core:change scenarios (construction, history, artifacts, entity methods) covered by change.spec.ts / change-artifact.spec.ts / artifact-file specs, all green.
  Missing tests: none material.

## Counts

- Requirements audited: lifecycle-engine 13, get-status 24, change (delta-touched 5 + remainder unchanged) .
- Scenarios: lifecycle-engine 76 (3 partial/untested sub-assertions: skip-bypass isPermitted, missing-approval reason wording, blocked-ready-no-action, stale-verification-at-archivable => 4 LOW), get-status 89 (all covered), change delta scenarios 8 (all covered).
- Findings: HIGH 0, MEDIUM 0, LOW 5 (A1-1, A1-2, A1-3, missing-test cluster for twin merges, stale-verification-at-archivable/blocked-ready untested), INFO 5 (A1-4, A1-5, A1-6, A1-7, hardcoded actionType mechanical on override).
- Round-8 items: (1) CONFIRMED with caveat A1-1/A1-2 (no collapse of genuine distinct VERIFICATION*\*/artifact blockers; APPROVAL*\* wrong-twin latent), (2) CONSISTENT, (3) tests discriminating except one weak (A1-4).
- No new problem found in round-9 changes beyond the LOW items above.
