# Specs compliance report — decouple-core-cli-workflow-guidance (round 9)

Mode: delegated (attempt verification-attempt-11).

## Summary

| Batch                                                                                                  | HIGH | MEDIUM | LOW | INFO |
| ------------------------------------------------------------------------------------------------------ | ---- | ------ | --- | ---- |
| A1 core:lifecycle-engine, get-status, change                                                           | 0    | 0      | 5   | 5    |
| A2 core:workflow-topology, workflow-model, edit-change, cli:change-edit, approve-spec, approve-signoff | 0    | 1      | 11  | 0    |
| B core:transition-checks, transition-change, invalidate-change, archive-change                         | 0    | 1      | 6   | 3    |
| C CLI, error-handling, skills, docs sweep                                                              | 0    | 1      | 3   | 2    |
| Total                                                                                                  | 0    | 3      | 25  | 10   |

Auditor test runs: core 1063, 838, 473, full core 4053 (4051 passed, 2 todo, 0 failed); cli 1749 and 58; skills 183. Lead gates before the audit: build 13/13, typecheck 26/26, lint, prettier, test 25/25, code-graph corpus count 126.

## Detailed Findings

---

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

---

# Partial batch A2 (round 9, verification-attempt-11)

Specs: core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit, core:approve-spec, core:approve-signoff.
Method: merged spec+verify previews read in full (workflow-model read fully, every requirement traced to code), code read, tests run. Read-only.

## Round-8 items re-verified

- Policy naming: `grep -i "invalidationPolicy|invalidation-policy"` over the merged previews of all six specs (spec.md + verify.md): ZERO hits. edit-change uses `invalidation: { artifacts?, workflow? }`; cli:change-edit uses `--artifact-policy` / `--workflow-policy`. Code agrees (`EditChangeInput.invalidation`, `_invalidation-flags.ts`, `edit.ts`). The only `invalidationPolicy` occurrences in code are the `Change.invalidationPolicy` entity property (not spec-visible) and `_validity-present.ts` reading it. OK.
- EditChange dead-code removal (`git diff HEAD`): `_isNoOp` had NO callers at HEAD (only its definition matched `_isNoOp`), and the post-mutate `persisted.invalidated` branch (unscaffold/scaffold/refresh) was unreachable because the description/policy-only mutate always returned `invalidated: false`. Removal is behavior-neutral; the scope path (`_executeScopeEdit`) owns unscaffold/scaffold/refresh and is untouched. Also the `command` -> `intent` change in `editNextAction` is consistent with CLI `projectCliNextAction`. OK.
- New tests present and passing: workflow-topology `honors the supplied approval snapshot ...` (converse snapshot: ready disabled + spec gate off, all four functions derive same pipeline; gated snapshot throws), `identifies intermediate active steps...` / `excludes disabled intermediate steps` (listBypassedWorkflowSteps), edit-change `existing specDependsOn snapshot` (non-overwrite), lifecycle-verdict `workflow rows declared out of canonical order` (availableSteps canonical order). All assert what the spec says.

## core:workflow-topology

Requirements Summary: 7 requirements (pure function module; ordered pipeline; forward connectivity; dynamic legal transitions; bypassed steps; forward progression; step enablement + verification boundary).
Implementation Status: all implemented in packages/core/src/domain/services/workflow-topology.ts. Verified: exports are exactly the 8 functions (test asserts via Object.keys); canonical order independent of row order; bedrock/anchor throws; drain states via VALID_TRANSITIONS only (no anchor mapping for exits; `nextWorkflowStep` uses first non-designing legal exit for all four drain states, no per-state special-casing); `designing -> designing` admitted as redesign; backward requires table edge AND earlier pipeline position; forward targets stop at first non-optional step; archivable only from done / archiving only from archivable. Verification-boundary consumers all call `isWorkflowStepEnabled('verifying')`: reconcile-change-validity:293, invalidate-verification:144, approve-signoff:111, lifecycle-guidance:89, lifecycle-verdict:912; archive/verification.current verified via archive-change.spec "archives without any verification evidence when verifying is disabled" and get-status "real reconciler" spec.
Discrepancies: none.
Test coverage: every verify scenario has a test (workflow-topology.spec.ts, workflow-topology-audit.spec.ts, get-status.spec.ts:1665 for the end-to-end disabled-verifying scenario, archive-change.spec.ts:393).
Missing tests: none material.

## core:workflow-model (full independent pass)

Requirements Summary: 13 requirements (step names -> states; step semantics; optional/disabled; checks/skipChecks/archiveChecks; sovereign schema; requires gating; task-completion gating; step check declarations; step availability; array order; step-to-state; hooks; two execution modes; requires = artifact ids).
Implementation Status (traced):

- Unknown step / drain-state row -> SchemaValidationError: build-schema.ts:836-846 (valid states from VALID_TRANSITIONS keys + `isDrainState`). OK.
- Omitted row -> `workflowStep(state)` null, state stays enabled: topology defaults + lifecycle-verdict `workflowStep===null` skip. OK.
- Bedrock optional/disabled, skipChecks on disabled, archiveChecks only on `archiving`, unknown check, duplicate coordinate, governance locks: build-schema.ts:840-930+. OK.
- Approval anchor at build/resolve time incl. `schema validate`: validate-schema.ts:83 and resolve-schema.ts:124 call `resolveWorkflowPipeline(schema, approvals)`; test validate-schema-approval-anchor.spec.ts covers three modes. OK.
- `requires`/`requiresTaskCompletion` must be declared artifact ids and subset: build-schema.ts:1033-1060. OK.
- workflow.requires (domain/checks/workflow-requires.ts): pass only for complete/skipped; blocking codes per status; shared by status and TransitionChange via the same check. OK.
- workflow.taskCompletion composes CountTasks (`createWorkflowTaskCompletion`); missing file / invalid regex => non-matching (CountTasks `safeRegex`, `loaded===null` skip); details carry incomplete/complete/total. OK.
- Along classification from canonical pipeline (`classifyAlong`, transition-checks.ts:~215-262): redesign/recovery/forward/backward, disabled steps excluded. OK.
- Hooks: bindings hook.pre (`to=step`, along `*`, before-persist), hook.post (forward only, before-persist), archive hooks pre before-persist / post after-persist; skipHookPhases honoured. OK.
  Discrepancies (all LOW, no behavior bug):

1. Spec wording "compile incompletePattern using safeRegex with the 'm' flag"; CountTasks uses `'gm'` (g needed for counting). Wording only.
2. Spec: each `requiresTaskCompletion` artifact "MUST declare taskCompletionCheck"; buildSchema enforces `hasTasks: true` (taskCompletionCheck is defaulted for hasTasks types, build-schema.ts:526-542). Equivalent in practice; wording only.
3. Spec: pre-hook matches `along = any`; binding has `exceptAlong: ['recovery']` (check-bindings.ts:157). Defined by core:transition-checks; no conflict, but workflow-model wording is looser.
4. `workflow.taskCompletion` also runs at `scope: 'archive'` iterating every step with requiresTaskCompletion (application/checks/workflow-task-completion.ts:60-80). Not mentioned in workflow-model (belongs to archive-change/transition-checks); flagged only for awareness.
5. Nit (unverified impact): build-schema.ts `chk.from in VALID_TRANSITIONS` uses `in` (prototype keys like `constructor` pass). Likely pre-filtered by schema-format parsing; not reproduced.
   Test coverage: all verify scenarios mapped to existing tests (build-schema specs, transition-checks specs, lifecycle-verdict.spec, validate-schema-approval-anchor.spec, transition-change specs for hooks).
   Missing tests: none identified.

## core:edit-change

Requirements Summary: 21 requirements (input contract with `invalidation`; spec-id validation; readOnly rejection; invalidation policy edits; lookup; no-ops; description; removal-before-add; absent removal; host-neutral error; idempotent add; specDependsOn seeding; scope reconciliation; unscaffold; refresh; output contract; dependencies; factory; schema compat; sovereign schema).
Implementation Status: implemented in application/use-cases/edit-change.ts + composition/use-cases/edit-change.ts. Flow verified: policy validated before any mutation (`assertInvalidationPolicyOverride`), IDs parsed/normalized then readOnly check, removals normalized + de-duplicated and unvalidated, `SpecNotInChangeError` inside the serialized mutate, `replaceSpecIds` + `ctx.reconcileAfter`, unscaffold after persist, refresh keyed on `scopeChanged` only, actor resolved only when an edit is applicable, non-overwrite of existing `specDependsOn` (`freshChange.specDependsOn.get(id) !== undefined -> continue`).
Discrepancies:

1. MEDIUM (pre-existing, spec/impl drift, not introduced this round): spec "Seed specDependsOn" says seeding uses `readPersistedDependsOn(spec)` then falls back to canonical `metadata.json.dependsOn` (even stale), then `[]`. Code (`_shared/load-persisted-spec-depends-on.ts`) uses only `repo.readPersistedState` (spec-lock.json) then `[]`; there is NO metadata.json fallback and `readPersistedDependsOn` no longer exists (core:spec-repository-port verify.md line 44 says it is removed). Verify scenarios "Legacy metadata seeds when persisted semantic state is absent" and "Stale metadata still seeds as legacy fallback" are therefore unsatisfied/untestable as written. The same text sits in core:create-change. Recommend fixing spec text (or restoring fallback) in this change or a follow-up.
2. LOW: test `seeds newly added specs from stale metadata when persisted dependencies are absent` (edit-change.spec.ts:223) is mislabeled; its fixture contains only `spec-lock.json` with dependsOn (persisted state PRESENT), no metadata.json. It does not exercise a metadata fallback.
3. LOW: spec "Config-based factory ... resolveEditChangeDeps MUST resolve" lists 5 deps; code also resolves `resolveChangeSchema` and `reconcile` (required by spec's Dependencies section, so spec list is just incomplete). No direct test for `resolveEditChangeDeps` / deps-vs-config equivalence for EditChange (ApproveSpec has one in composition/use-cases/invalidate-change.spec.ts; EditChange only has mandatory-validity-reconciler.spec.ts).
4. LOW: `reconcile` is optional in the constructor signature but throws `InvalidCompositionFactoryArgumentsError` when absent (type/runtime mismatch, harmless).
5. NIT: `--description ""` on a change with `description === undefined` is treated as a change (`'' !== undefined`) and persists a description-updated event; spec silent.
   Test coverage: edit-change.spec.ts covers lookup, no-ops, policy validation (before mutation, with valid edits), idempotent add, seeding (persisted-first, non-overwrite), removal order/absent/duplicate/bare-id, readOnly (one line per offender, atomic), reconciled scope edit (designing return, ready keeps ready, reorder not stale, atomic on reconcile failure), schema compat/sovereign resolution, actor once, unscaffold.
   Missing tests: metadata.json legacy fallback (see 1); resolveEditChangeDeps equivalence.

## cli:change-edit

Requirements Summary: 6 requirements (command signature with `--artifact-policy`/`--workflow-policy`; workspace derivation; readOnly; approval invalidation reporting; output on success; error cases).
Implementation Status: commands/change/edit.ts. Usage error (no edit flag) before config resolution; raw values forwarded; partial policy maps only supplied dimension (`resolveInvalidationOverride`); warning only when projectionChanges or automaticReturn present; text renders blockers, Core next action (command projected from `intent` via guidance-presenter), effective policy, projection changes, automatic return; json/toon include `scopeChanged`, `validityChanged`, `invalidated`, `state`, blockers, nextAction, policy, projections, automaticReturn.
Discrepancies:

1. LOW: spec says invalid policy flag "prints the InvalidInputError message"; CLI rejects locally with its own message `invalid --artifact-policy 'x'. valid values: ...` (still exit 1, prints value + allowed values, matches the scenario text). Core-level InvalidInputError is not reachable via the CLI path.
2. LOW: `--help` JSON schema block lists only `{result,name,specIds,workspaces,invalidated,state}`; real output adds scopeChanged/validityChanged/blockers/nextAction/etc. (spec's own base shape, so not a violation).
3. NIT: policy flag parsing happens before the try/catch block; fine because cliError exits.
   Test coverage: change-edit.spec.ts (58 CLI tests in the set, all pass) covers unknown policy, no flags, raw forwarding, comma ID, usage-before-config, source-purity, readOnly/unknown ws mapping, no-warning-on-scope-only, blockers/next-action text, ready-with-stale-approval in text+json, projection/automatic-return json, toon, partial workflow dimension.
   Missing tests: none material (scenarios are covered with mocked core; no CLI-through-real-core test for the gated recovery).

## core:approve-spec

Requirements Summary: 9 requirements (gate guard; lookup; fingerprint; recording w/ binding-derived eligible states, never transitions; canonical reconciliation; persistence; input contract; baked gates; factory).
Implementation Status: application/use-cases/approve-spec.ts. Gate check first, then get, ResolveChangeSchema (provider mismatch propagates before actor), actor once, single `reconcile.mutate`; eligibility via `boundFromStates('approval.spec')`; `InvalidStateTransitionError(state, 'ready')` (+ `incomplete-artifact` reason) thrown after the mutation so reconciliation persists; task artifacts excluded from blocking; `recordSpecApproval` with scope-aware fingerprint, no transition.
Discrepancies: none.
Test coverage: approve-spec.spec.ts, approve-audit-2.spec.ts, approve-consent-audit.spec.ts (bindings-derived states, parking-state consent without transition, stale parking recovery), privacy-decorated-identity.spec.ts + composition/use-cases/invalidate-change.spec.ts (factory forms).
Missing tests: none.

## core:approve-signoff

Requirements Summary: 9 requirements (same shape plus verification eligibility errors and whole-file implementation fingerprint).
Implementation Status: application/use-cases/approve-signoff.ts. Verified: verifying-disabled path ignores evidence; distinct NotFound / InProgress / Stale (legacy-unknown => stale) / FingerprintMismatch; `VerificationStaleError` message is host-neutral (`renew verification before sign-off`, no `specd`/`--`//specd-) and exposes `changeName`; refresh before mutation; stale sign-off beyond done recovered to `done` by reconciler; parking states never transitioned.
Discrepancies: none.
Test coverage: approve-signoff.spec.ts (incl. disabled verifying, error taxonomy, message regex + changeName), approve-consent-audit.spec.ts (whole-file hash, empty map, unreadable file, parking states), approve-audit-2.spec.ts (renewal only in done, reconciliation blocks).
Missing tests: none.

## Test runs

- Targeted core (domain/services, domain/checks, edit-change, approve-spec, approve-signoff, approve-audit-2, approve-consent-audit, validate-schema-approval-anchor): 218 suites, 838 tests, 838 passed, 0 failed.
- Targeted cli (change-edit.spec, change/approve.spec, change/approve-failure.spec): 12 suites, 58 tests, 58 passed, 0 failed.
- Full core run: see addendum below.

## Counts

New problems introduced in round 9: 0 (no regression found in the dead-code removal, topology changes, or new tests).
Discrepancies: 1 MEDIUM (pre-existing: edit-change metadata.json fallback), 11 LOW/NIT (wording drift, mislabeled test, missing factory test, CLI message source).
Specs with zero discrepancies: workflow-topology, approve-spec, approve-signoff.

## Addendum: full core run

Full @specd/core vitest: 1272 suites, 4053 tests, 4051 passed, 0 failed (2 skipped/todo).

---

# Partial batch B (round 9, verification-attempt-11): core:transition-checks, core:transition-change, core:invalidate-change, core:archive-change

Read-only audit. Merged previews via `changes spec-preview` (spec + verify). No code/spec/doc modified, no lifecycle commands run.

## Tests run (core, vitest json reporter)

- Targeted (transition-change*, invalidate-change*, archive-change*, transition-checks*, reconcile, verification-current, application/checks, application/services, domain/errors): 35 files, 473 tests, 473 passed, 0 failed.
- Full @specd/core suite: 286 files, 4053 tests, 4051 passed, 2 todo (config-writer.spec.ts, unrelated), 0 failed.
  - transition-change.spec 131, transition-change-audit 6, audit-2 9, ready-audit 1; invalidate-change.spec 27 (+ next-action 3, policy-audit 10, ready-audit 7); archive-change.spec 121 (+ audit 5, batch-restore 8, input 2, links-audit 10, skip-ids-audit 4).

## Round-8 re-verification

1. No `--skip-hooks` in transition-checks: CONFIRMED. Only case-insensitive hit is the scenario title "Skip-hooks still runs predicates" (verify, "Predicate versus effect"); body uses `skipHookPhases` containing `all`. No flag syntax. LOW (L1): title borrows CLI-flag naming; suggest "skipHookPhases all still runs predicates".
2. transition-change "Transition delegation" signature: CONFIRMED. `transition-change.ts:426` `freshChange.transition(effectiveTarget, actor, schema, this._approvals)`; `Change.transition(to, actor, schema?, approvals?)` at `domain/entities/change.ts:928`. No direct test asserts the four args (entity is real in tests, so approvals/schema legality is exercised implicitly). LOW (L7).
3. archive-change "Archivable guard" + Constraints wording vs code: Constraints bullet MATCHES (`archive-change.ts:378` inline state check after `reconcile.execute`, again at :481 after post-hook reconcile, and `assertArchivable()` inside `mutate` at :581). Residual wording defects remain, see D-A1..D-A3 below.
4. ArchiveChange.execute @throws (ArchiveOrphanBackupError, DeltaApplicationError, ArtifactParseError): each VERIFIED to propagate.
   - ArchiveOrphanBackupError: `detectOrphans` (:571) inside try/catch that records failure and rethrows (:575-577); adapter throws it for corrupt, recovered-own, and foreign orphan (`infrastructure/fs/archive-batch-snapshot.ts:60,78,86`). Tested (archive-change-batch-restore.spec.ts:352,417).
   - DeltaApplicationError: thrown from `formatParser.apply` in `_prepareArchivePlan` (:851), inside the prepare try/catch which rethrows the original (:532-540). Tested (archive-change.spec.ts:2398).
   - ArtifactParseError: from `formatParser.parse` / `yamlParser.parseDelta` (json/yaml parsers) in the same prepare path, and from `extractMetadataFromSpecArtifacts` (no catch in it); rethrown unchanged. NOT tested at use-case level (M-T1).
   - Missing from @throws (all LOW): (a) plain `Error` from `resolveSealedArchiveDependsOn` (`application/services/resolve-sealed-archive-depends-on.ts:59`) when no ContentHasher is supplied for a lock-less existing spec; reachable via direct construction since `hasher` is `ContentHasher | undefined`; also contradicts spec "Typed errors" (MUST NOT throw generic Error), see D-A4. (b) `HookFailedError` also reachable from after-persist (post) effects whose binding `onFailure` is not `collect` (:733-735); @throws only mentions pre-archive hooks. (c) arbitrary repository/IO errors from publish/archive are rethrown by `_handleCommitFailure` (:1134) - acceptable, unlisted by design. (d) `InvalidCompositionFactoryArgumentsError` is on the ctor doc only (fine).
5. Regression sweep rounds 4-9:
   - CLI strings in core: none in the four use cases, `application/checks`, `application/errors`, `domain/errors`, `domain/services/transition-checks.ts`, `domain/checks`. Messages checked: HappyPathNextUnavailableError ("cannot advance to next state: ..."), InvalidateRequiresForceError (no `--force`), InvalidInvalidateTargetError ("targets"/"policy", no `--target`), ReconciledOperationBlockedError ("Follow the '<intent|action kind>' next action"), CheckPredicateFailedError. Only residual mention: `archive-change.ts:90` JSDoc says "Delivery mechanisms (CLI flags) translate..." (comment, INFO). Spec text mentions of `--next`, `--force`, `--target`, `--allow-out-of-scope`, `--skip-checks`, `--allow-overlap`, `/specd-verify` are all negative assertions ("MUST NOT contain"), correct. `specd change validate` in archive verify is fixture prose content, correct.
   - skipChecks / skippedCheckIds naming: consistent and documented. Use cases take `skipChecks`; `lifecycle-verdict` option is `skippedCheckIds`, and transition-checks "Projections" explicitly states both names. No `skipCheckIds`/`skippedChecks` strays. No `skipHooks`/`--skip-hooks` anywhere in core src.
   - Governance table in `domain/services/check-bindings.ts` matches transition-checks "Registry bindings" (Category A/B/C, archive locks for workspace.readOnly/deps.consistent/impl.filesResolved, skippable only spec.overlap + impl.linksInScope on archive, hook phase/onFailure rows, `exceptAlong: ['recovery']` for hook.pre).
   - Check actions: approval.spec/approval.signoff emit approve-spec/approve-signoff; verification.current emits start-verification (supersedesIntent false) for REQUIRED/IN_PROGRESS/STALE and refresh-status for VALIDITY_UNAVAILABLE; no `details.command`. Matches spec.
   - Composition: resolveTransitionChangeDeps / resolveInvalidateChangeDeps / resolveArchiveChangeDeps field lists match their specs (checkRegistry spread conditionally; spec lists it unconditionally, INFO).

## Per-spec results

### core:transition-checks

Requirements Summary: 24 requirements (check identity/result, Check ABI, CustomCheckDefinition, one-file-per-check, applicability from/to/along, step-skip scope, dynamic binding composition, archive-as-operation, pipeline phase/failure policy, predicate vs effect, evaluation of an attempt, shared candidate evaluator, shared validity verdict, single reconciliation owner, registry bindings, actionable diagnostics, host-neutral impl message, check-declared actions, generic progress bus, projections, no snapshot bag, approval precedence, legacy parking bindings, verification currency bounds, structured failure details). 104 verify scenarios.
Implementation Status: Implemented. Spot-verified bindings table, effect phases, actions, protocol.edge fail-fast (execute mode) in `evaluate-transition-candidate.ts:112`, host-neutral messages. All targeted tests green.
Discrepancies:

- L1 (LOW): scenario title "Skip-hooks still runs predicates" uses flag-style name; body is host-neutral.
- INFO: verify scenario "Parked approval is reported before protocol edge failure" relies on the parked->implementing edge being topology-legal; consistent with transition-change "Historic parked approval repair precedence" but the interplay with execute-mode protocol.edge fail-fast is only implied.
  Test coverage: evaluate-transition-candidate, execute-matching-predicates, matching-effects, validate-skip-checks, host-neutral-projections, lifecycle-guidance, transition-checks-audit(-2), verification-current, workflow-check-factories specs. Scenario titles do not map 1:1 to test names; coverage assessed by area, not title.
  Missing tests: none identified blocking.
  Counts: HIGH 0, MEDIUM 0, LOW 1, INFO 1.

### core:transition-change

Requirements Summary: 28 requirements (input contract, baked approvals, existence, optional pre-refresh + mandatory post-hook refresh, spec-approval/signoff as checks, parked-state failures, direct transition, canonical pre-transition reconciliation incl. committed recovery reporting, workflow.requires, task completion, implementation-only retry, verification lifecycle, backward-hop invalidation, designing from any state, archiving->archivable, pre/post hook execution, delegation, transitioned event, implementing tracking activation, persistence via mutate, result, progress, dependencies, `to: next`, host-neutral HappyPathNextUnavailableError, bypassed step evaluation, shared runner errors, factory deps, historic parked precedence). 91 verify scenarios.
Implementation Status: Implemented and consistent. Verified: reconcile -> committed recovery (`ReconciledOperationBlockedError` with evaluateLifecycle nextAction using `evaluateLegalTargets`, not empty checksByTarget; context-free `InvalidStateTransitionError` when no automatic return); mandatory reconciler throws `InvalidCompositionFactoryArgumentsError`; second reconcile with forced tracking refresh + predicate rerun before persistence; `mutate` applies signoff invalidation, `transition(effectiveTarget, actor, schema, approvals)`, tracking activation; effects selected by binding phase via `matchingEffects` (no check-id switch); skipChecks validated by `validateSkipChecks` against resolved bindings (Unknown/NotSkippable incl. effect checks); host-neutral nextAction reason; HappyPathNextUnavailableError exposes `state`.
Discrepancies:

- L2 (LOW): `TransitionChange` class JSDoc (`transition-change.ts:114-116`) still says "Pending parking states are drain-only for in-flight changes"; spec "Historic parked approval repair precedence" says no drain-specific rules, only bound checks.
- L3 (LOW): verify scenario titles "Parked spec approval rejects a non-drain target" / "Parked signoff rejects a non-drain target" keep drain vocabulary the spec removed.
- L4 (LOW): `execute` @throws says InvalidStateTransitionError "Only for a committed movement with no automatic return", but `freshChange.transition()` inside `mutate` can still throw it (concurrent state change / entity rejection), per spec Constraints which reserves it for exactly that entity rejection.
- INFO: spec Dependencies lists CheckRegistry/ResolveChangeSchema as dependencies without "optional"; code treats `checkRegistry` as optional and `reconcile?` optional-in-signature-but-enforced.
  Test coverage: transition-change.spec (131), audit/audit-2/ready-audit, reconciled-transition-status, evaluate-transition-candidate; committed recovery (spec L136/L180), skip validation (L3090-3112), refresh semantics (L410), mutate persistence (L453), hooks (L1401+), next (L298+).
  Missing tests: L7 no explicit assertion of the 4-argument `change.transition` call (implicit only).
  Counts: HIGH 0, MEDIUM 0, LOW 4 (L2, L3, L4, L7), INFO 1.

### core:invalidate-change

Requirements Summary: 17 requirements (input, effective policy, policy-dependent target rules, target normalization/accumulated errors, approval guard with effective-policy force preview, canonical gate-safe recovery, manual cause, policy-aware effects, traversal order, no invented drift, idempotence, output contract, factory deps, sovereign schema, nextAction from lifecycle guidance). 29 verify scenarios.
Implementation Status: Implemented. Verified: shape validation before schema resolution and any mutation; accumulated target errors; guard + invalidation inside one `reconcile.mutate`; guard reads post-pre-pass change so fingerprint-stale consent needs no force; `forceRecoveries` uses effective policy and `previewArtifactReviewRequired`; use case never calls `Change.invalidate`; cause `artifact-review-required` set by reconciler (`reconcile-change-validity.ts:662`); nextAction from `evaluateLifecycle` over `evaluateLegalTargets` with neutral fallback `{targetStep, actionType:'cognitive', intent:null}`; errors host-neutral.
Discrepancies:

- INFO: spec says guard is computed from "canonical reconciled verdict (observe pass)"; code reads the projection status after the reconciler pre-pass (`consentToRevoke`). Equivalent in effect, wording differs.
- INFO: `execute` @throws omits errors that can surface from the reconciler/mutate (lock/IO); acceptable.
  Test coverage: invalidate-change.spec (27), policy-audit (10), ready-audit (7), next-action (3). Covers force preview, ready-stays-in-ready, redesign, verifying-disabled routing, target/policy validation.
  Missing tests: none identified.
  Counts: HIGH 0, MEDIUM 0, LOW 0, INFO 2.

### core:archive-change

Requirements Summary: 29 requirements (ports/ctor, bindings-not-RunStepHooks, input, sovereign schema, ArchivedChange construction, archivable guard, canonical validity preflight, deferred transition, readOnly guard, overlap guard, pre-archive hooks, tracked selection, prepare plan, staged commit, batch snapshot/restore/orphans, lifecycle rollback, debug logging, delta merge, validity preservation, repository call, index metadata, post hooks, metadata generation, spec-lock sidecar, result shape, typed errors, shared runners, effective bindings/skip validation, impl review/materialization/out-of-scope guards, factory deps, fallback snapshot lifetime). 178 verify scenarios.
Implementation Status: Implemented. Verified execute order: load -> resolve schema -> reconcile -> inline state guard (ReconciledOperationBlockedError if recovery committed, else InvalidStateTransitionError) -> resolveEffectiveBindings -> validateSkipChecks -> predicates (failFastOn schema.nameMatch) -> peer invalidation when spec.overlap bypassed -> before-persist effects -> post-hook reconcile (+state guard) -> predicate rerun -> `postHookValidityBlocksArchive` -> plan -> preflight (+deps.consistent rerun) -> orphan detect + snapshots -> `mutate{assertArchivable; transition('archiving')}` -> publish -> archive -> cleanup -> metadata -> after-persist effects. Batch restore + rollback to archivable on success, ArchiveBatchRestoreError otherwise.
Discrepancies:

- D-A1 (MEDIUM, spec-internal/spec-vs-code): requirement "Archivable guard" says "After the schema name guard, execute() MUST evaluate `archive.archivable`", but code runs the state guard BEFORE the archive predicates (so before `schema.nameMatch`); "Skip validation" paragraph and verify "State guard precedes skip validation" say the opposite order relative to validation. A schema-name mismatch on a non-archivable change yields InvalidStateTransitionError, not the nameMatch failure. Fix spec wording to "after schema resolution, before predicates".
- D-A2 (LOW): verify scenarios "Change not in archivable state" and "Guard runs after archivable check and state transition" (readOnly) still say InvalidStateTransitionError is "thrown from `assertArchivable()`"; in code the pre-publication guard is the inline check (`new InvalidStateTransitionError(change.state,'archiving')`); `assertArchivable()` only runs inside the later mutate. Also, when reconciliation committed a recovery the error is ReconciledOperationBlockedError, not InvalidStateTransitionError (spec covers this elsewhere). Round-8 fixed the Requirement/Constraints text but not these scenarios.
- D-A3 (LOW): "Typed errors" lists `CheckPredicateFailedError ... including archive.archivable`; with the inline guard the registered `archive.archivable` predicate cannot fail except in a race, so this is effectively unreachable (INFO-grade).
- D-A4 (LOW): "Typed errors" says ArchiveChange MUST NOT throw generic Error and lists `ArchivePreflightError`; that class does not exist anywhere in `packages/` (only in specs/core/archive-change spec+verify), and `resolveSealedArchiveDependsOn` throws plain `Error` (missing ContentHasher). Spec references a non-existent error class.
- D-A5 (LOW): Debug-logging requirement lists "archivable guard pass", per-spec orphan-detection outcomes, batch snapshot per spec, tracked-selection direct vs delta, backup cleanup; in `archive-change.ts` there is no archivable-guard log (22 Logger.debug calls; snapshot adapter has 9). Pre-existing, not touched by this change.
- D-A6 (LOW): `execute` @throws missing items noted in Round-8 item 4 (plain Error; HookFailedError from after-persist abort bindings).
- INFO: `archive-change.ts:90` JSDoc mentions "CLI flags".
  Test coverage: archive-change.spec (121), audit (5), batch-restore (8, incl. orphan errors), input (2), links-audit (10), skip-ids-audit (4); reconciled preflight (L3819+), skip validation (L4574+), archiving transition (L3280+), DeltaApplicationError (L2398).
  Missing tests: M-T1 ArtifactParseError propagation from execute (base artifact / delta unparsable) has no use-case test; M-T2 missing-ContentHasher path untested; M-T3 after-persist hook with `onFailure: abort` throwing HookFailedError untested; M-T4 no test for the inline-guard vs `archive.archivable` ordering relative to schema.nameMatch (see D-A1).
  Counts: HIGH 0, MEDIUM 1 (D-A1), LOW 5 (D-A2, D-A4, D-A5, D-A6, M-T1 grouped as missing tests), INFO 2.

## Overall counts (batch B)

HIGH 0 | MEDIUM 1 | LOW 11 (L1, L2, L3, L4, L7, D-A2, D-A4, D-A5, D-A6, D-A3 counted as LOW-INFO, missing-test items M-T1..M-T4 not counted) | INFO 6. Test results: 473/473 targeted pass, 4051/4053 full core pass (2 todo), 0 failures.
No regressions found for rounds 4-9 (no CLI strings in core runtime messages, naming consistent, `--skip-hooks` absent).

---

# Batch C partial (round 9, verification-attempt-11)

Specs audited (spec + verify merged via spec-preview): cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source.
Read-only audit. No code, spec, doc or lifecycle changes. A real failing transition was NOT run (it is a lifecycle command); the repair-guide sample was checked against transition.ts.

## Test results

- `pnpm --filter @specd/cli test`: Test Files 115 passed (115); Tests 1749 passed (1749). Single run, no flakes (guide-sdk and change-deps passed first time).
- `pnpm --filter @specd/skills test`: Test Files 16 passed (16); Tests 183 passed (183).

## Round-8 items re-verified

1. transition.ts shared `isCheckPredicateFailed` (instance OR `name === 'CheckPredicateFailedError'`): used at line 100 (isRepairGuideError), 235 (text repair guide) and 565 (JSON hint). VERIFIED consistent in both paths. The new test (`transition.spec.ts` "treats a name-only CheckPredicateFailedError like the real class in json mode") covers the JSON path only. The text path with a name-only error is not tested (LOW, test gap). Text uses truthy `cpErr.skippable`, JSON uses `=== true`. Same result for boolean values.
2. change-edit CLI tests: `change-edit.spec.ts` now has the 3 added tests (remove spec not in change, workspaces after add from another workspace, remaining workspace after core drops one). edit.ts now projects `nextAction` through `projectCliNextAction` and adds `intent` and `action`. VERIFIED. edit.ts JSON `blockers` are Core `ValidityBlocker` objects (code, message, action?, details?). They carry no raw `isSkippable`, so there is no leak. Text edit output prints only blocker code and message and the next action command/reason, not a blocker `command:` (INFO, not required by any audited spec).
3. docs/cli/cli-reference.md bypass paragraph: VERIFIED. `resolveCliBypassFlag` builds `--skip-checks <checkId>` from `isSkippable` and `checkId`. status.ts text prints `    bypass: <flag>` under the blocker (4 spaces, matches the sample). JSON/TOON `bypassFlag` and no raw `isSkippable` match projectCliBlocker. The `--next` wording (CLI passes `to: 'next'`, Core resolves via `HAPPY_PATH_NEXT`) matches transition.ts and the `HAPPY_PATH_NEXT` map exactly (10 entries, none for archivable/archiving).
4. docs/cli/change-verification.md: VERIFIED against verification.ts. The projected `nextAction` carries targetStep, actionType, reason, command, guidance (only if present), intent, action. Blockers carry code/message/label/checkId/details/action/bypassFlag, plus `command` or `guidance` for invalidate. Text prints the `bypass:` line and `command:` or `guidance:`. Format and `--reason` validation happen before `resolveCliContext`. Minor: start/complete JSON `blockers` come from `validity.blockers` and carry only code/message. The sentence "Each projected blocker carries ..." is in the invalidate context, so this is only a nuance (INFO).
5. docs/core/use-cases.md: VERIFIED for checkCode (`APPROVAL_REQUIRED` with approveSpecAction/approveSignoffAction), the TransitionChange error table, archive error rows (CheckPredicateFailedError; InvalidStateTransitionError for not archivable or archiving, matches archive-change.ts lines 378 and 481) and approve states (ApproveSpec uses `boundFromStates('approval.spec')` = ready, pending-spec-approval, spec-approved; ApproveSignoff = done, pending-signoff, signed-off, matching check-bindings.ts).
6. docs/core/errors.md: VERIFIED. `CheckPredicateFailedError.code` returns `checkCode`. `skippable` is optional. The per-check `details` payloads match domain/checks exactly: protocol.edge {from,to}; workflow.requires {artifactId,status?,blockedBy?}; taskCompletion {artifactId,incomplete,complete,total,byArtifact} or {reason,artifactId,byArtifact}; impl.filesResolved {files}; impl.linksInScope {outOfScopeSpecIds}; deps.consistent {mismatches,specIds}; spec.overlap {entries?,peers?}; workspace.readOnly {specs,specIds}; schema.nameMatch {changeName?,changeSchemaName,schemaName}.
7. docs/core/custom-checks.md repair-guide sample: line ORDER and labels match writeTextRepairGuide (error, blockers, `repair guide:`, state, target, check, code, hop, detail, command, guidance, bypass, reason). The sample omits the validity lines (`spec approval:`, `verification:` and similar) that `validityTextLines` prints between `state:` and `target:` when status carries a validity projection (LOW, abbreviated sample). The `guidance:` line (no `command:`) is correct for an unknown action kind.

## Per-spec summary

### cli:change-status

- Requirements: signature, drafted read-only, output format, DAG task display, display-state, lifecycle projections from GetStatus checks, reconciled validity and next-action output, text review omission, blocker labels, archive bypass from resolved bindings, schema warning, not found, schema-derived fields, refresh delegation, implementation/tasks/basic/specs sections, stable display status.
- Implementation status: IMPLEMENTED. status.ts uses `projectCliBlocker`, `projectCliNextAction` and `resolveCliBypassFlag`. Text prints `    bypass: --skip-checks <id>`, `! CODE — label: msg`, and a `guidance:` line when command is null. The overlap bypass suffix is appended by the presenter for the archive intent only.
- Discrepancies: none in code. INFO: INTENT_COMMANDS are slash commands (`/specd-design`), and cli-reference says `command` is "always an executable command or null". This matches the spec wording.
- Tests: status.spec.ts, guidance-presenter and presenter tests pass. Missing: none identified.

### cli:change-transition

- Requirements: signature, `--skip-checks` and aliases, `--next` resolution, validity-aware guidance, refresh delegation, approval routing, output on success and failure (stream records), check progress, hooks, error hints.
- Implementation status: IMPLEMENTED. Check failure guidance: the own-action guidance is always shown and a next-action command accompanies it. The failed check's `code:` is printed even without a matching blocker. One `bypass:` line per distinct skippable blocker. Mandatory checks print no bypass. deps.consistent gets the extraction hint only when not skippable. The structured failure carries error{code,message,checkId?}, hint, state, validity, verification, projected blockers and nextAction with intent/action/command/guidance. The reconciled-blocked path renders a repair guide with no invalid-edge line, tested in reconciled-blocked.spec.ts.
- Discrepancies: none HIGH/MEDIUM.
- Tests: transition.spec.ts (~110 cases) covers all scenarios. Missing (LOW): name-only CheckPredicateFailedError in text mode.

### cli:change-invalidate

- Implementation status: IMPLEMENTED. Blockers projected with `projectCliBlocker` and a text `bypass:` line. nextAction projected with `projectCliNextAction`, plus a `guidance:` line when command is null.
- Discrepancies: none. Tests: change-invalidate.spec.ts passes. Missing: none identified.

### cli:change-verification

- Implementation status: IMPLEMENTED. start/complete/invalidate projections are whitelisted. The mismatch hint is in reportVerificationError. Invalidate blockers carry command/guidance/bypassFlag.
- Discrepancies: none. Tests: verification.spec.ts passes. Missing: none identified.

### cli:change-archive

- Implementation status: IMPLEMENTED. Text CheckPredicateFailedError rendering uses check/hop/detail/command|guidance/bypass|hint. The overlap special case prints the peers and then `skippableCheckHint('spec.overlap')` only when skippable. ReconciledOperationBlockedError renders a repair guide or a structured record. JSON archive failures go through handleError, which emits the check code.
- Discrepancies:
  - LOW: archive.ts line 213 tests `err instanceof CheckPredicateFailedError` only. transition.ts also accepts a duck-typed name, so cross-package class duplication behaves differently between the two commands. The spec does not require it.
  - LOW (doc): cli-reference.md line 643 says text format prints `bypass:  Retry with ...`. For `spec.overlap` with `details.entries`, archive.ts prints the peer list followed by the bare hint, with no `bypass:` prefix. This matches the spec scenario wording but not the doc sentence.
- Tests: archive.spec.ts passes. Missing: none identified.

### cli:change-approve

- Implementation status: IMPLEMENTED. Help text uses bound-from language. Success output includes `state:` (unchanged) and no transition. Failures re-read status and render state, labelled blockers, bypass and the next action in text. JSON enrichment is done via the error metadata.
- Discrepancies: DOC contradictions with the spec and code, see MEDIUM-1 below.
- Tests: approve.spec.ts passes (includes the legacy parking state scenario).

### default:\_global/error-handling-conventions

- Implementation status: core src grep for slash commands, `--skip-checks`, `--force`, `--next`, `--target`, `--allow-*` and `specd <cmd>` inside non-comment string literals found nothing. Projections use intents and actions (kind, params, guidance) plus `isSkippable` and `checkId`. The CLI hint catalog covers VERIFICATION_STALE, SPEC_NOT_INITIALIZED, force-guard codes, DEPENDS_ON_OVERWRITE for every command, and HAPPY_PATH_NEXT_UNAVAILABLE.
- Discrepancies: none. Not exhaustively audited here: input-name imperatives such as "Pass force" in messages (covered by other batches).

### skills:skill-templates-source

- Implementation status: templates (`shared.md.tpl` and the specd-design/verify/archive/new/implement skills) read `nextAction.command`, fall back to `guidance` ("MUST follow guidance instead of inventing a command"), use `--skip-checks <id>` as canonical, and mention the `--allow-*` aliases only as aliases. Consistent with the CLI projection.
- Tests: skills 16 files / 183 tests pass. Missing: none identified.

## Discrepancies and findings (final doc sweep and regressions)

MEDIUM-1 (docs contradict spec and code on approve states):

- docs/cli/cli-reference.md line 352: "requires the committed state to be exactly `ready` ... leaves the change in `ready` ... a state other than `ready`, exit 1".
- docs/cli/cli-reference.md line 366: the same for "exactly `done`".
- docs/guide/workflow.md line 408: "records consent only from `ready`".
- docs/guide/workflow.md line 433: "records consent only from `done`".
- Spec cli:change-approve says ApproveSpec and ApproveSignoff are valid in the binding `from` states of the check: ready plus the legacy pending-spec-approval and spec-approved; done plus the legacy pending-signoff and signed-off. check-bindings.ts and approve-spec.ts and approve-signoff.ts agree, and so do docs/core/use-cases.md and the specd-new skill template.
- Fix: reword these four statements to "ready (or a legacy parking state)" and "done (or a legacy parking state)". The command stays in its current state.

LOW-1: docs/core/errors.md `TransitionFailureReason` snippet (around line 446) omits the optional `status` and `blockedBy` fields on `incomplete-artifact` that exist in invalid-state-transition-error.ts. Not changed this round, so it is pre-existing.

LOW-2: docs/core/custom-checks.md repair-guide sample omits the validity lines (see item 7).

LOW-3: archive text CheckPredicateFailedError uses `instanceof` only, and the cli-reference line 643 `bypass:` nuance (see cli:change-archive).

LOW-4 (test gap): no text-mode test for a name-only CheckPredicateFailedError. The shared predicate makes this very low risk.

INFO-1: docs/core/overview.md error table omits `UNSUPPORTED_MANIFEST_VERSION`, which docs/core/errors.md lists.

INFO-2: change-verification.md start/complete blockers (from reconciliation `validity.blockers`) carry only code and message, with no bypassFlag.

Regressions across rounds 4-9: none found. All the following are consistent with code: skippability defaults (only spec.overlap and impl.linksInScope on transition and archive); the `--skip-checks` and alias docs; the host-neutral `command` or `guidance` split; the legacy-parking approve and transition semantics in docs/core/domain-model.md, docs/guide/workflow.md tables and ADR 0028 update note; recovery from `ready` (spec recovery not requested, redesign recovery still applies, matching change-validity.ts).

## Counts

- Specs audited: 8
- Findings: HIGH 0, MEDIUM 1 (4 doc statements), LOW 4, INFO 2
- Tests: CLI 1749/1749 (115 files); skills 183/183 (16 files)
