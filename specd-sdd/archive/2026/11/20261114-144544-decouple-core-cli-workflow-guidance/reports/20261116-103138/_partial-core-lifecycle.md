# Partial compliance report: core lifecycle specs

Change: decouple-core-cli-workflow-guidance
Scope: core:lifecycle-engine, core:get-status, core:workflow-model, core:workflow-topology, core:change (+ default:\_global/architecture and default:\_global/error-handling-conventions consistency)
Method: merged spec-preview text, deltas, packages/core/src and packages/core/test. Read-only; nothing modified.
Test run (read-only): `npx vitest run` on lifecycle-guidance, lifecycle-verdict, lifecycle-engine, get-status, workflow-topology, change-state specs -> PASS 215, FAIL 0.

Note: `specd changes spec-preview ... default:_global/architecture` fails ("not in current specIds of change"), so the global architecture spec had no delta/preview. Global error-handling-conventions preview worked (new requirement "Host-Neutral Core Projections" is present).

Path prefix used below: P = /Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core

---

## 1. core:lifecycle-engine

### Requirements Summary

Domain verdict = plain functions (`evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`), no command/bypassFlag, option `skippedCheckIds` (host-neutral ids only); blockers carry `checkId`, `action`, no `bypassFlag`; verification validity blockers carry `CheckAction` not `details.command`; application `lifecycle-guidance.ts` maps `nextHop` to `{intent, action}` (phase-only `LifecycleActionIntent`, first failed hop action wins, `supersedesIntent`, no gate/check names, topology-derived); `evaluateLifecycle` derives `hopFailures`; next hop derives only from review + availableTransitions + pipeline (no approval projections); one drain rule; generic INVALID_TRANSITION; single verification boundary derivation.

### Implementation Status

Satisfied (evidence):

- No class, plain functions: P/src/domain/services/lifecycle-verdict.ts:171 (`evaluateLifecycleVerdict`), :380 (`projectArtifacts`); lifecycle-engine.ts is a pure re-export barrel (19 lines).
- `LifecycleDomainVerdict` / `LifecycleNextHop` / `LifecycleBlocker` have no `command`/`bypassFlag` (verdict.ts:99-147). `skippedCheckIds` option, exact-id match only (verdict.ts:64, :33-35, :847); flag syntax is not parsed. No `warnings` field.
- Blocker propagates `action` and `checkId`, skippability from resolved bindings (verdict.ts:831-851).
- `LifecycleActionIntent = 'design'|'implement'|'verify'|'archive'` (P/src/application/services/lifecycle-guidance.ts:14); `resolveLifecycleIntent` signature matches spec incl. `hopFailures` (guidance.ts:38-47); first failed action wins, `supersedesIntent === false` keeps phase intent (guidance.ts:52-57).
- guidance.ts contains none of the forbidden identifiers (`approval.spec`, `boundFromStates`, `activeSpecApproval`, `validity.specApproval`, `pending-spec-approval`, ...). Verification boundary derives from `isAtOrAfterVerificationBoundary` (guidance.ts:91; verdict.ts:974), which is the single derivation also used by reconcile-change-validity.ts:294 and invalidate-verification.ts:147.
- `evaluateLifecycle` = verdict + `selectHopFailures` + guidance (P/src/application/services/lifecycle-evaluation.ts:34-65). TransitionChange (transition-change.ts:320,628) and InvalidateChange (invalidate-change.ts:253) consume it; ValidateArtifacts/GetArtifactInstruction use only the domain verdict with empty checks (validate-artifacts.ts:258, get-artifact-instruction.ts:101) and attach no intent.
- Domain `nextHop` on `ready` stays in place with reason "Remaining blockers prevent leaving ready" (verdict.ts:1090-1096, no approval wording). Drain states use one rule (`nextWorkflowStep` in availableTransitions else stay) (verdict.ts:1106-1122). Generic INVALID_TRANSITION from topology (verdict.ts:568-577).
- Optional-step recommendation policy: `recommendedForwardTarget` (verdict.ts:1009-1038).
- Archiving guidance incl. `commitStarted` -> designing (verdict.ts:1184-1203; guidance.ts:164-176).

### Discrepancies

1. [major] Verification validity blockers REQUIRED / IN_PROGRESS carry no `action`. Spec (Machine-readable blockers): blockers from the validity reconciler for `VERIFICATION_STALE`, `VERIFICATION_REQUIRED`, `VERIFICATION_IN_PROGRESS`, `VERIFICATION_VALIDITY_UNAVAILABLE` MUST carry `action` (start-verification / refresh-status). Code: only STALE has it (P/src/domain/services/change-validity.ts:553-557 and application/use-cases/reconcile-change-validity.ts:480-486). REQUIRED and IN_PROGRESS are pushed bare at change-validity.ts:548 and :550. Also `approval.signoff` verification failures (P/src/domain/checks/approval-signoff.ts:58-80) have no action (spec text is about reconciler blockers, so this one is advisory). VALIDITY_UNAVAILABLE is emitted by the check and does carry `refresh-status` (domain/checks/verification-current.ts:33-39) - satisfied. Fix is code (add `startVerificationAction(changeName)` at the two lines) - the spec is unambiguous.
2. [major, spec-vs-spec/code tension] Stale spec approval scenario "Stale spec approval resolves through the check" (change in `ready`, spec gate on, stale approval -> `nextAction.action = {kind:'redesign-spec'}`, `intent = null`) is not what real evaluation does. `projectValidityNextHop` (verdict.ts:915-927) reads `validity.specApproval === 'stale'|'revoked'` and forces `nextHop.targetStep = 'designing'`; `selectHopFailures` (lifecycle-evaluation.ts:84-86) then reads failures of target `designing`, where `approval.spec` (bound to ready->implementing) does not appear, so no action is attached and guidance returns intent `'design'` (guidance.ts:127). Existing tests confirm the code behavior, not the scenario: lifecycle-verdict.spec.ts:1198-1216 expects `intent 'design'` with no action; get-status.spec.ts:1584-1611 expects `intent 'design'`. The only test of `redesign-spec` (lifecycle-guidance.spec.ts:126-152) hand-feeds `hopFailures`, so it never exercises the real path. Either the scenario is wrong (get-status spec line "Required stale spec consent ... yields committed designing guidance" and the guidance requirement "...and from review / recovery signals for 'design'" support the code), or the code should not special-case spec approval in the verdict. Recommend fixing the scenario text (state: design intent via recovery) OR adding the real-path test if redesign-spec action is intended.
3. [major, spec-vs-code] "Next hop derives from candidate evaluation": the domain `nextHop` MUST NOT read approval projections / approval gates. `projectValidityNextHop` (verdict.ts:915-949) reads `validity.specApproval` and `validity.signoff` to override nextHop to `designing` / `done`. The requirement names `activeSpecApproval`, `activeSignoff`, `approvals` gates and `boundFromStates`, not `validity.*`, so this is a gray area; but it contradicts the stated intent ("no approval ... knowledge in the verdict", delta description) and get-status "stale sign-off alone returns a later change to done". Spec should explicitly carve out validity-driven overrides (stale consent / verification renewal) OR the override should move to the application guidance. Also `resolveLifecycleNextHop` receives `approvals`, used only to build the pipeline (acceptable).
4. [minor] "drain-only state ... MUST apply one rule without naming individual drain states": `resolveLifecycleNextHop` tests `state in DRAIN_OFFSETS` (verdict.ts:1106), and `DRAIN_OFFSETS` (verdict.ts:855-862) names the four states with anchors. The behavior is the single rule, but the four states are still enumerated (and mapped onto pipeline anchors for `pipelinePosition`/`isForward`), which sits uneasily with workflow-topology's "drain states SHALL NOT be normalized onto a pipeline position". The topology rule is scoped to transition computation; the offsets are comparison-only. Tolerable; flag as hardcoded-list residue.
5. [minor] Guidance hardcodes lifecycle state names. Spec: guidance "MUST NOT use hardcoded lifecycle state lists" and must derive owner of a target from `resolveWorkflowPipeline` + `isWorkflowStepEnabled`. `intentForStateAndHop` (guidance.ts:119-191) is an if-chain on `drafting|designing|ready|implementing|verifying|done|archivable|archiving` and targetStep names. Only the verification boundary is topology-derived (guidance.ts:85-96). Passing tests exist for disabled verifying / noncanonical row order (lifecycle-engine.spec.ts:261, :327) so the stated scenarios hold. Spec wording ("lists") vs bedrock names: ambiguous; code is literal-noncompliant.
6. [minor] `signed-off` is not handled explicitly by guidance for the "done or signed-off -> archivable -> archive" rule; it works only through the generic fallback at guidance.ts:178-188 (targetStep != state). When a legacy parking state is blocked (targetStep == state, no hop action) guidance returns `null` (guidance.ts:190), whereas spec scenario "Legacy pending states resolve to the phase intent" says it returns the phase intent of the pipeline position. Real blocked-by-approval case is covered via the action, but a blocked parked state with no action gets `intent: null`.
7. [minor] Residual CLI syntax in comments/doc/messages in core src:
   - P/src/application/errors/verification-stale-error.ts:16 message contains `/specd-verify` (known, already noted).
   - P/src/domain/services/lifecycle-verdict.ts:522 comment `/specd-design`.
   - P/src/domain/value-objects/workflow-step.ts:66,83,101; P/src/domain/services/transition-checks.ts:486,554; P/src/domain/errors/check-predicate-failed-error.ts:48 JSDoc mention `--skip-checks`.
   - P/src/application/use-cases/get-status.ts:963 JSDoc mentions `/specd-implement`.
     No runtime string in projections (nextAction, blockers, checks, validity) contains `specd ...`, `--flag` or `/specd-*` (grep of core/src clean except the above).
8. [minor] Test titles still reference slash commands: lifecycle-verdict.spec.ts:808 (`/specd-verify`), :826 (`/specd-design`), :873 (`/specd-verify`), :887 (`/specd-archive`); lifecycle-engine.spec.ts:137, :207. Assertions are correct (intent-based), only names are stale.
9. [spec text stale, no code change] lifecycle-engine Purpose: "Application `evaluateLifecycle` attaches public `nextAction.command`" (should be `intent`/`action`). Requirement "Available steps": "`--skip-checks impl.linksInScope`" (CLI flag in core spec; should say check id `impl.linksInScope`). The delta did not touch these paragraphs.
10. [info] Verdict `skippedCheckIds` is exercised only by tests; `TransitionChange`/`ArchiveChange` take `skipChecks` (transition-change.ts:75,291-316; archive-change.ts:92,329) and do not pass `skippedCheckIds` into `evaluateLifecycleVerdict` (grep shows no `skippedCheckIds` outside the domain verdict). Not a violation of the spec text, but the verdict-level bypass is effectively dead in production paths.
11. [info] GetStatus has a redundant fallback (get-status.ts:744-755) that attaches the first failing check action from `verdict.checks` when guidance produced no intent and no action. `verdict.checks` is `checksByTarget[nextHop.targetStep]` (verdict.ts:331-334), i.e. the waiting hop, so it normally duplicates `selectHopFailures`; but it is a second, non-spec'd precedence path (it ignores `kind === 'predicate'` and any "first in binding order" guarantee beyond array order) and could contribute an action from a hop that guidance deliberately ignored if `nextHop.targetStep == requestedTarget` ever differs. Low risk; consider removing.

### Test Coverage

Good: no LifecycleEngine class/command (lifecycle-verdict.spec.ts:209); CLI flag syntax ignored and canonical id omits blocker (lifecycle-verdict.spec.ts:513, :538); schema non-skippable overlap (:573); incomplete tasks -> implement (:783) and complete tasks -> verify (:808); designing->ready design intent (:826); verifying->done verify (:873); archivable -> archive (:887); blocked archivable (:902); done lists backward hops (:978); verifying-disabled routing (lifecycle-engine.spec.ts:110-326); guidance: first-failed-action, `supersedesIntent:false`, other-hop failures ignored, source-scan for forbidden strings (lifecycle-guidance.spec.ts:58-229); `isAtOrAfterVerificationBoundary` (verdict.spec :1308-1345); recommendedForwardTarget optional-step policy (:54-110); approve-spec on blocked ready (:369-408).

### Missing / Weak Tests

- No domain-level test for "Parked state recommends its delivery edge when available" / "Parked state stays in place when exit is blocked" (`resolveLifecycleNextHop` drain branch, verdict.ts:1106-1122) for all four drain states; only topology tests cover drain exits.
- "Illegal target reports generic INVALID_TRANSITION" for `ready -> pending-spec-approval` at verdict level: not tested with that pair (INVALID_TRANSITION appears only in other contexts).
- "Missing approval keeps hop in place": ready test exists (verdict.spec.ts:369) but does not assert the reason string lacks approval wording or `actionType: 'mechanical'`.
- "Verification boundary has one derivation" for `pending-signoff` through reconcile and invalidate-verification: boundary unit test exists (:1323-1326) but no test asserting both consumers use it.
- "Stale spec approval resolves through the check" real path (see discrepancy 2) - only a synthetic test.
- "Verification validity blockers carry action" for REQUIRED / IN_PROGRESS reconciler blockers - no test (and code is wrong).
- "Legacy pending states resolve to the phase intent" (no-action blocked case) not tested.

Counts (lifecycle-engine): blocker 0, major 3, minor 5, info 3, spec-text 1. Verdict: PASS (no scenario outright unsatisfied by an implementation bug except the REQUIRED/IN_PROGRESS action requirement, see note) -- see overall verdict below.

---

## 2. core:get-status

### Requirements Summary

`nextAction` exposes `targetStep, actionType, reason, intent, action?` (no command); drafted status computed only through `projectArtifacts`, never `evaluateLifecycle`/verdict, `intent: null`, no action, empty transitions; GetStatus executes matching predicates per candidate, calls `evaluateLifecycle`; blockers carry `isSkippable`/`checkId`/`action` and no `bypassFlag`; live archive overlap keeps `intent 'archive'`, `targetStep 'archivable'`, reason host-neutral (not "Ready to archive"); verification blockers carry `start-verification` with `changeName`.

### Implementation Status

Satisfied:

- `NextAction` shape with `intent` + `action` (P/src/application/use-cases/get-status.ts:283-292); no `command` anywhere.
- Drafted: `_buildDraftedResult` uses `projectArtifacts` (get-status.ts:879) and returns `intent: null` with no action (get-status.ts:950-954); `availableTransitions` empty.
- Active path calls `evaluateLifecycle` (get-status.ts:686), merges blockers from check results with `action` propagated (get-status.ts:1031, 1050).
- Overlap: `_nextActionAfterArchiveOverlap` (get-status.ts:1065-1079) returns `intent 'archive'`, `targetStep 'archivable'`, reason = overlap blocker message (host-neutral check message; verified in test get-status.spec.ts:1395-1433 -> matches /overlap/i, not "Ready to archive", no `--skip-checks`).
- Schema failure degradation: `intent: null` (get-status.ts:564-593, 838-842).
- No `bypassFlag` field in `Blocker` (get-status.ts:266-273).

### Discrepancies

1. [spec text stale, minor] "Execute matching predicates then project" still says: "Live `spec.overlap` failure MAY then appear as public `OVERLAP_CONFLICT`, with `bypassFlag: '--skip-checks spec.overlap'` only when ... skippable" (spec line ~116) - directly contradicts "Blockers MUST NOT carry CLI `bypassFlag` strings" (Identifies blockers). Also: "`GetStatus` MUST call `evaluateLifecycle` ... to obtain public `nextAction.command`" (spec line ~124) - should say `intent`/`action`. Code is correct; spec paragraphs need update (delta did not reach them).
2. [minor] `_nextActionAfterArchiveOverlap` discards any `action` that guidance attached (get-status.ts:1073-1079). Spec requires only intent/targetStep/reason, so compliant; noted because a blocking archive check that declares an action would lose it from `nextAction` (it stays on the blocker).
3. [minor] get-status.ts:963 JSDoc still mentions `/specd-implement`.
4. [info] Redundant action fallback at get-status.ts:744-755 (see lifecycle-engine item 11).
5. [info] "Stale spec consent ... committed designing guidance" is satisfied (get-status.spec.ts:1584-1611) but conflicts with the lifecycle-engine scenario (item 2 above).
6. [info] Spec: blocker "SHALL carry `isSkippable` and `checkId` only when the resolved binding is skippable". Domain `blockersFromFailedChecks` always sets `checkId` (verdict.ts:836-841); GetStatus-level non-skippable overlap test (get-status.spec.ts:1814) passes, so GetStatus presumably trims; not re-verified for every blocker path. Pre-existing behavior, not part of this change's delta.

### Test Coverage

Overlap nextAction (get-status.spec.ts:1395-1433), invalidation-overlap -> design (:1352-1393), drafted null intent (:1078-1099), drafted DAG cascade without evaluate (:1101), verification in place with action `start-verification` and `supersedesIntent:false` (:1499-1555), stale verification keeps earlier-phase guidance (:1556), committed spec-approval recovery (:1584-1611), blocked done -> `approve-signoff` action with null intent (:1691-1700), bypassFlag absence (:732, :846, :1637, :1793), schema-hardened/locked/plugin overlap skippability (:1793-1900).

### Missing / Weak Tests

- Scenario "Failed gate check action reaches blocker and nextAction" (ready, spec gate, no approval -> blocker `action {kind:'approve-spec'}`, `nextAction.action {kind:'approve-spec'}`, `intent null`): GetStatus test at get-status.spec.ts:1339-1349 asserts only the code `APPROVAL_REQUIRED`; no action/intent assertion at the GetStatus level (the verdict-level test lifecycle-verdict.spec.ts:369-408 covers it).
- Scenario "Verification blocker carries start-verification" in `done` with stale evidence: no GetStatus test asserts the blocker `action` and the absence of `details.command` (the existing test at :1499 uses `verifying` and only checks nextAction).
- Drafted scenario: no assertion that `nextAction.action` is `undefined` (:1098 asserts only intent null).
- No test that GetStatus does not call `evaluateLifecycle`/verdict for drafts other than the DAG cascade name test (:1101).

Counts (get-status): blocker 0, major 0, minor 3, info 3, spec-text 1. Verdict: PASS.

---

## 3. core:workflow-model

### Requirements Summary

Delta changes only: `workflow.requires` and `workflow.taskCompletion` failures are check failures (`CheckPredicateFailedError`), one shared evaluation between status and TransitionChange; `CountTasks` composed in `createWorkflowTaskCompletion`; no duplicate file walks in the verdict.

### Implementation Status

- Verdict does not walk files; it projects from supplied `CheckResult`s (`blockingArtifactIds`, verdict.ts ~700; DAG-only fallback when check results absent, verdict.ts:~610-624 `hasRequiresResult`).
- TransitionChange throws `CheckPredicateFailedError` for first failed predicate (spec-driven; domain/errors/check-predicate-failed-error.ts). `createWorkflowTaskCompletion` composes CountTasks (application/checks, not re-audited in depth).

### Discrepancies

1. [minor, spec text] workflow-model spec line ~127: "`skippable`: Permission to bypass via `--skip-checks`" retains CLI flag wording in a core spec; mirrors code JSDoc (workflow-step.ts:66,83,101). Consistent with the code comments but not with the new global "host-neutral" rule (that rule governs projections/messages, not spec prose, so not a violation).
2. [info] Section about Authority Boundary (spec line ~47) says agent skills consume `availableTransitions` and `nextAction`; consistent with `nextAction.intent`/`action` design.

### Test Coverage

`workflow.requires`/`taskCompletion` failure through the check are covered in lifecycle-verdict.spec.ts:215 (blockingArtifacts from check details), :783 (INCOMPLETE_TASKS), :1148 (no MISSING_ARTIFACT dual-write), transition-change.spec.ts (CheckPredicateFailedError cases).

### Missing Tests

- Scenario "Transition blocked when requiresTaskCompletion artifact has incomplete tasks ... `CheckPredicateFailedError` thrown for `workflow.taskCompletion` with the incomplete count in `details`": not located as a TransitionChange-level assertion on `details` count (not exhaustively searched; flag for confirmation in the per-use-case report).

Counts: blocker 0, major 0, minor 1, info 1. Verdict: PASS.

---

## 4. core:workflow-topology

### Requirements Summary

Delta: drain states expose only the exits `VALID_TRANSITIONS` lists for the exact source (filtered by enablement), never normalized onto the pipeline, no exit leads into another drain state; `nextWorkflowStep` applies one rule to all four drain states (first non-`designing` legal exit, or `null`).

### Implementation Status

Satisfied:

- `listWorkflowTransitions` for drain states returns `VALID_TRANSITIONS[from]` filtered by `isWorkflowStepEnabled` (P/src/domain/services/workflow-topology.ts:187-190).
- `nextWorkflowStep` single rule for all drain states via `DRAIN_STATES` + first non-designing legal exit (workflow-topology.ts:~395-405); `archivable`/`archiving` -> null.
- `VALID_TRANSITIONS`: pending-spec-approval = [implementing, designing]; pending-signoff = [archivable, designing, done]; no entry edges into spec-approved/signed-off (P/src/domain/value-objects/change-state.ts:32-45). `isWorkflowTransitionLegal('pending-spec-approval','verifying')` = false.
- Drain states are not in the pipeline (`CANONICAL_PIPELINE`, workflow-topology.ts:35-44).

### Discrepancies

1. [minor] `DRAIN_STATES` is a list of the four drain names in topology (workflow-topology.ts:~48-53). Acceptable (the topology spec is the authority that classifies drain states); the "MUST NOT special-case individual drain states" requirement is met (no per-state branches).
2. [info] Cross-spec: lifecycle-verdict's `DRAIN_OFFSETS` maps drain states onto pipeline anchors for comparison (see lifecycle-engine item 4); not in conflict with `listWorkflowTransitions`, but it is a second representation of drain membership.

### Test Coverage

Covered: pending-signoff exits `['archivable','designing','done']` and next `archivable` (workflow-topology.spec.ts:349-356); pending-spec-approval exits `['implementing','designing']` (:358-364); next steps for approved drain states (:366-369); spec-approved null when implementing disabled (:408-412); drain states never in the pipeline (:466-477); legality of `nextWorkflowStep` result (:396-405).

### Missing Tests

- Scenario "Drain states gain no forward shortcuts": no explicit assertion of `isWorkflowTransitionLegal('pending-spec-approval','verifying') === false` nor that neither result contains `spec-approved`/`signed-off`.
- Scenario "Drain states only return legal next steps": `pending-spec-approval` -> null when `implementing` disabled is not tested (only `spec-approved`); `pending-signoff`/`signed-off` -> archivable partly covered.

Counts: blocker 0, major 0, minor 1, info 1. Verdict: PASS.

---

## 5. core:change

### Requirements Summary

Delta replaces the "Drain:" paragraph: `VALID_TRANSITIONS` for ready/done unchanged (no pending-\* exits); `pending-spec-approval` = implementing, designing; `pending-signoff` = archivable, designing, done; forward exit listed first; `spec-approved`/`signed-off` keep exits but no transition leads into them; approval enforcement belongs to bound checks, not the table. New scenarios: pending-spec-approval exits; pending-signoff exits; no entry edge into spec-approved/signed-off.

### Implementation Status

Fully satisfied: P/src/domain/value-objects/change-state.ts:32-45 matches the spec table exactly (ready: [implementing, designing]; done: [archivable, designing, implementing, verifying]; forward exit first). `HAPPY_PATH_NEXT` consistent (change-state.ts:~95-108).

### Discrepancies

None against the spec. [info] The doc comment on `VALID_TRANSITIONS` describes drain behavior accurately.

### Test Coverage

change-state.spec.ts:33-52 (allowed edges incl. pending-\*), :70-72, :79-85 (HAPPY_PATH_NEXT and no spec-approved/signed-off exit from the pending states), :107-109; transition-change.spec.ts:343-376 (pending exits succeed when gates off), :646-690 (rejecting pending->approved/signed-off), :698-735 (gated by approval.spec/approval.signoff).

### Missing Tests

- Scenario "spec-approved and signed-off have no entry edge": no test scans every source state for an exit to `spec-approved`/`signed-off` (partial coverage by two explicit negative `isValidTransition` assertions at change-state.spec.ts:84-85 and :107-109). Also no explicit assertion that `implementing` is listed first for pending-spec-approval at the table level (covered through topology `toEqual` order at workflow-topology.spec.ts:358-364).

Counts: blocker 0, major 0, minor 0, info 1. Verdict: PASS.

---

## Global spec consistency

- default:\_global/error-handling-conventions (new "Host-Neutral Core Projections" requirement): core projections (NextAction, Blocker, CheckResult, validity details) contain no `specd ...`, `--flag` or `/specd-*` at runtime, except `VerificationStaleError.message` (verification-stale-error.ts:16, known; that is an error, governed by the sibling "Host-Neutral Core Errors" requirement, so this is a real violation of the global error rule, minor/known). `CheckAction.guidance` doc says "MUST NOT contain CLI syntax" (transition-checks.ts:~92) - consistent. Presenter-side fallback to `guidance` for unknown kinds is a CLI concern (out of scope for this partial).
- default:\_global/architecture: could not preview (spec not in the change's specIds). Layering checked manually: `lifecycle-guidance.ts` / `lifecycle-evaluation.ts` are in `application/services` and import only domain modules (OK); domain `lifecycle-verdict.ts` imports no application code (OK); no `LifecycleEngine` class. Domain uses ambient `Logger.debug` (allowed by the logging spec exception).
- Spec-vs-spec contradictions to fix in the merged specs (all stale prose, not code): lifecycle-engine Purpose `nextAction.command`; lifecycle-engine "--skip-checks impl.linksInScope"; get-status `bypassFlag: '--skip-checks spec.overlap'` and `nextAction.command`; plus the stale-spec scenario vs recovery-signal rule (lifecycle-engine item 2).

---

## Final counts and verdict

| Spec                   | blocker | major | minor | info |
| ---------------------- | ------- | ----- | ----- | ---- |
| core:lifecycle-engine  | 0       | 3     | 5     | 3    |
| core:get-status        | 0       | 0     | 3     | 3    |
| core:workflow-model    | 0       | 0     | 1     | 1    |
| core:workflow-topology | 0       | 0     | 1     | 1    |
| core:change            | 0       | 0     | 0     | 1    |
| Total                  | 0       | 3     | 10    | 9    |

Per-spec verdict:

- core:lifecycle-engine: FAIL on one narrow requirement (major #1: VERIFICATION_REQUIRED / VERIFICATION_IN_PROGRESS validity blockers carry no `action`, change-validity.ts:548,550); everything else is satisfied or a spec-wording issue. Two further majors (#2, #3) are spec-vs-code design tensions needing a decision, not unambiguous scenario failures.
- core:get-status: PASS
- core:workflow-model: PASS
- core:workflow-topology: PASS
- core:change: PASS

Overall: FAIL (one genuinely unsatisfied normative sentence: reconciler VERIFICATION_REQUIRED / VERIFICATION_IN_PROGRESS blockers must carry `CheckAction`; fix is two lines plus tests). All 215 related core tests pass; the gap is not caught by existing tests.

Recommended actions (priority order):

1. Add `action: startVerificationAction(changeName)` to REQUIRED and IN_PROGRESS blockers (change-validity.ts:548,550) and add tests (verdict + GetStatus `done` scenario asserting no `details.command`).
2. Decide the stale spec approval semantics (design intent via recovery vs `redesign-spec` action) and align either the scenario or the code; add a real-path test.
3. Clarify in the spec that validity-driven overrides (`projectValidityNextHop`) are permitted in the domain verdict, or move them out.
4. Clean stale spec prose (Purpose, `bypassFlag` in get-status, `--skip-checks impl.linksInScope`, `nextAction.command`).
5. Fill missing tests listed per spec (parked-state next hop, generic INVALID_TRANSITION pair, drain topology scenarios, GetStatus gate-action and verification-blocker-action scenarios).
6. Replace `/specd-verify` in VerificationStaleError message (known) and stale comments/test titles.
