# Specs compliance — change decouple-core-cli-workflow-guidance

Mode: delegated (attempt verification-attempt-1). Date: 2026-11-16.

## Summary

| Batch                                                                                                                     | Verdict                 | Blockers | Major | Minor   |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ----- | ------- |
| core lifecycle (lifecycle-engine, get-status, workflow-model, workflow-topology, change)                                  | FAIL (lifecycle-engine) | 0        | 3     | 10      |
| core transitions (transition-checks, transition-change, invalidate-change, approve-spec, approve-signoff, archive-change) | PASS                    | 0        | 3     | several |
| cli + skills (6 cli specs, skills templates, error-handling-conventions)                                                  | PASS                    | 0        | 0     | ~14     |

Automated: typecheck, lint, tests (core 3820, cli 1650, skills 166, sdk 187) all pass.

## Detailed Findings

### \_partial-core-lifecycle.md

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

### \_partial-core-transitions.md

# Partial compliance report: core transition / invalidate / approve / archive specs

Change: decouple-core-cli-workflow-guidance
Scope: core:transition-checks, core:transition-change, core:invalidate-change, core:approve-spec, core:approve-signoff, core:archive-change (+ global default:\_global/error-handling-conventions; default:\_global/architecture is not in the change's specIds so spec-preview refuses it; its rules were taken from the error-handling spec and the architecture-related requirements quoted in the specs).
Method: merged spec preview vs packages/core/src and packages/core/test. Read-only audit; no code/spec files modified. Paths below are relative to packages/core unless stated.
Focus: host-neutral intents/actions (no CLI strings, flags, slash commands) and the uniform `skipChecks` contract. Unrelated pre-existing requirements (delta merge, snapshots/restore, debug logging, spec-lock sealing, hook ordering) were NOT re-audited line by line.

Severity legend: blocker = scenario genuinely unsatisfied; major = requirement intent violated / likely user-visible defect, scenarios still literally pass; minor = cosmetic, doc/spec drift, weak test.

---

## 1. core:transition-checks

---

### Requirements Summary (decoupling-relevant)

- CheckResult carries optional host-neutral `action` (`CheckAction {kind, params?, guidance?, supersedesIntent?}`), only on fail; Check / CustomCheckDefinition carry no static action; no CLI flags/commands/slash commands in action/details.
- Built-in action kinds typed + factory helpers exported; plugin kinds namespaced `@plugin.id`.
- approval.spec: APPROVAL_REQUIRED -> approve-spec, APPROVAL_STALE -> redesign-spec. approval.signoff: REQUIRED or STALE -> approve-signoff. verification.current: start-verification / refresh-status with `{changeName}` and `supersedesIntent:false`, no details.command.
- nextAction = host-neutral `intent` (design|implement|verify|archive) + optional `action`; approve-spec => intent null; stale => redesign-spec; informational actions keep phase intent.
- Blockers: `isSkippable`/`checkId` only from the resolved binding; no CLI `bypassFlag`.
- impl.linksInScope message host-neutral (no `--allow-out-of-scope`), preserves `outOfScopeSpecIds`.
- Per-code `details` contract, executed from resolved bindings, single resolver (`resolveEffectiveBindings`).
- Parking-state approval bindings; no Core code outside the binding table names parking states to apply an approval rule.

### Implementation Status

Satisfied:

- `CheckAction`, `BuiltInCheckActionKind`, factories `approveSpecAction/approveSignoffAction/redesignSpecAction/startVerificationAction/refreshStatusAction`: src/domain/services/transition-checks.ts:80-152; exported in src/public.ts:790-796. `fail()` accepts `action` (transition-checks.ts:366-390); `Check`/`CustomCheckDefinition` have no `action` (transition-checks.ts:426-467).
- approval.spec: APPROVAL_STALE -> redesignSpecAction, REQUIRED -> approveSpecAction: src/domain/checks/approval-spec.ts (run()). approval.signoff REQUIRED/STALE -> approveSignoffAction: src/domain/checks/approval-signoff.ts. verification.current all 4 codes: src/domain/checks/verification-current.ts (actions have `supersedesIntent:false`, `params.changeName`; no `details.command`).
- Lifecycle guidance holds no check ids / parking states / CLI strings: src/application/services/lifecycle-guidance.ts (`resolveLifecycleIntent` takes `action` from first failed hop predicate; `supersedesIntent === false` keeps phase intent, else intent null). Source-scan test enforces it (test/application/services/lifecycle-guidance.spec.ts:58-69).
- `NextAction` = `{targetStep, actionType, reason, intent, action?}`, no `command`: src/application/use-cases/get-status.ts:282-293.
- Blocker policy from resolved bindings: get-status.ts:1002-1052 (`isSkippable` from effective bindings, `checkId` + `label` attached, no bypassFlag). Archive bindings resolved identically to ArchiveChange (get-status.ts:663-684).
- Single resolver / skip validation: src/application/services/validate-skip-checks.ts; src/application/services/evaluate-transition-candidate.ts (protocol.edge fail-fast in execute mode lines 112-129, step-skip loop 135-159); synthetic bypass `{outcome:'skip', details:{bypassedByUser:true}}` at src/application/services/execute-matching-predicates.ts:169-184.
- Binding table governance Category A/B/C and archive locks: src/domain/services/check-bindings.ts:40-251; parking rows at 111-112 and 123-124; `boundFromStates` at 326.
- Per-check `details` shapes: protocol-edge.ts `{from,to}`; workflow-requires.ts `{artifactId,status,blockedBy?}`; workflow-task-completion.ts `{artifactId,complete,incomplete,total}`; deps-consistent.ts `{mismatches:[{specId,extracted,persisted}]}` (message also lists both lists); spec-overlap.ts entries/peers; workspace-read-only.ts `{specs:[{specId,workspace}]}`; schema-name-match.ts `{changeName,changeSchemaName,schemaName}`; impl-files-resolved.ts `{files}` (all under src/domain/checks/).
- Retired `SpecOverlapError` / `ArchiveDependencyMismatchError` removed (git diff stat: src/domain/errors/spec-overlap-error.ts, archive-dependency-mismatch-error.ts deleted; src/domain/errors/index.ts updated). No `allowOutOfScope`/`allowOverlap` input anywhere in src except the string below.

### Discrepancies

1. [major] impl.linksInScope message still carries a stale bypass hint: src/application/services/detect-impl-links-in-scope.ts:52 -> "... Re-run with allowOutOfScope if intentional." Commit 77f5da727 merely renamed `--allow-out-of-scope` to `allowOutOfScope`. That input no longer exists on TransitionChange/ArchiveChange (spec: "MUST NOT accept ad-hoc check bypass booleans"; test/application/use-cases/archive-change-input.spec.ts:15-17 asserts it is absent), so the hint is wrong for every host and violates the intent of "Host-neutral impl.linksInScope message" and of default:\_global/error-handling-conventions "Host-Neutral Core Errors" (names `--allow-out-of-scope` explicitly as forbidden; the spirit applies to its camelCase twin). The scenario passes only because it asserts the literal `--allow-out-of-scope`.
   - Code fix: drop the sentence; hosts derive the hint from `isSkippable` + `checkId`.
   - Spec fix alternative: tighten the scenario to assert no bypass hint at all.
2. [minor, spec vs code] Spec "CheckExecutionContext ... strictly contextual facts: change, schema, attempt, config, validity, onCheckProgress" conflicts with (a) spec's own verify scenario ("change, schema, attempt, baked approvals, resolved config, skipChecks, checkRegistry") and (b) code: src/domain/services/transition-checks.ts:426-454 also has `skipHookPhases`, `effectiveStatusByArtifact`, `approvals`, `passMemo`; `skipChecks`/`checkRegistry` are added by an intersection type in execute-matching-predicates.ts:146-149. No bypass booleans exist, so the real MUST is met; the spec list is stale and should be reconciled with the verify scenario.
3. [minor] `CheckAction.params` is `Record<string, unknown>` (transition-checks.ts:92) so "built-in kinds have a fixed, typed params shape" is enforced only by the factories, not by the type. Plugin-kind namespacing (`@plugin.id`) is documented but not validated anywhere (spec only requires hosts to treat unknown kinds via `guidance`, so acceptable).
4. [minor] approval.signoff failures with VERIFICATION_IN_PROGRESS / VERIFICATION_REQUIRED / VERIFICATION_STALE (src/domain/checks/approval-signoff.ts, last 3 `fail(...)` calls) carry no action. Spec only mandates actions for REQUIRED/STALE approval and for verification.current, and verification.current emits `start-verification` on the same edge, so no scenario breaks. Note `resolveLifecycleIntent` uses `hopFailures.find(...)` (first failure with an action); if a future ordering put an informational action ahead of `approve-signoff`, intent would stay at phase value.
5. [minor] get-status.ts:744-755 fallback: when `nextAction.intent === null && action === undefined`, the first failing check with an action across ALL legal targets (`verdict.checks`) is promoted into nextAction. Spec says nextAction is derived from the hop evaluation; this fallback can surface an action from an unrelated target. No test targets it.
6. [minor] Blocker `isSkippable` aggregation ORs across targets/coordinates by check id (get-status.ts:1002-1017) and `_throwPredicateFailures` / `validateSkipChecks` use `bindings.find(b => b.check.id === id)` (first binding per id): src/application/use-cases/transition-change.ts:499-504,518; validate-skip-checks.ts:44. Spec says policy comes from the resolved binding "for the attempt being evaluated"; with the same id bound at both `transition` and `step-skip` coordinates having different `skippable` the first wins. Not reachable with built-ins (same values), reachable via schema overlays; low risk.
7. [minor] Core comments still mention delivery syntax (not behaviour): src/domain/services/transition-checks.ts:443,486,554; src/domain/value-objects/workflow-step.ts:66,83,101; src/domain/errors/check-predicate-failed-error.ts:48 (`--skip-checks`/`--skip-hooks`); src/domain/services/lifecycle-verdict.ts:522 (`/specd-design`); src/application/use-cases/get-status.ts:963 (`/specd-implement`). Also `NextAction`-adjacent leftover: src/application/use-cases/archive-change.ts:1457-1459 has an unclosed duplicated `/**` doc comment.
8. [minor, naming only] Parking-state names remain in non-binding core code: src/domain/services/transition-checks.ts:207-210 (classifyAlong for parking hops, explicitly required by spec), lifecycle-verdict.ts:858-861 (position map), change-validity.ts:104-110, and src/application/use-cases/transition-change.ts:107 (`SKILL_HOP_SOURCES` includes `signed-off`). None applies an approval rule, so the "No Core code outside the binding table MAY name the parking states to apply an approval rule" requirement holds.

### Test Coverage

- action factories and verification.current actions: test/application/checks/verification-current.spec.ts:61-90.
- intent/action precedence, supersedesIntent, verifying disabled, parking from bound check: test/application/services/lifecycle-guidance.spec.ts:71-215.
- approve-spec/approve-signoff actions through the real path: test/application/use-cases/transition-change.spec.ts:519-535, 597, 698-729; test/domain/services/lifecycle-verdict.spec.ts:406; test/application/use-cases/get-status.spec.ts:1696; invalidate-change.spec.ts:446,496.
- Plugin action preserved/namespaced, skip validation, bypass marker: test/application/services/execute-matching-predicates.spec.ts, validate-skip-checks.spec.ts.
- Binding table / boundFromStates: test/domain/services/transition-checks.spec.ts:225-264; check-registry.spec.ts:361,500.
- impl.linksInScope message: test/application/services/detect-impl-links-in-scope.spec.ts:17-28 (weak, see Missing).

### Missing / Weak Tests

- No unit test that the real `approval.spec` check returns `{kind:'redesign-spec'}` for APPROVAL_STALE. There is no test/domain/checks/approval-spec.spec.ts; lifecycle-guidance.spec.ts:126-150 hand-builds the failure with `redesignSpecAction()`, and workflow-check-registry.spec.ts:211 only asserts `code: 'APPROVAL_STALE'` for signoff. The spec scenario "approval.spec emits redesign-spec when approval is stale" is thus covered only by construction, not by the check.
- test/domain/checks/approval-signoff.spec.ts never asserts `action` (scenario "approval.signoff emits approve-signoff on failure" only covered indirectly via use-case specs).
- No test for "Check and CustomCheckDefinition declare no static action" (type-level `expectTypeOf(...).not.toHaveProperty('action')`) nor for details host-neutrality across all built-ins ("Details are host-neutral" scenario) beyond lifecycle-guidance source scan.
- detect-impl-links-in-scope.spec.ts only asserts `not.toContain('--allow-out-of-scope')`; should assert no bypass hint / no `allow` token (would have caught Discrepancy 1).
- No test for the get-status.ts:744 fallback or for cross-coordinate skippability.

### Counts

Requirements reviewed: 21 (listed); satisfied: 19; satisfied-with-caveat: 2 (Host-neutral impl.linksInScope message; CheckExecutionContext facts list). Scenarios: all literally satisfiable. Findings: 1 major, 7 minor.

### Verdict: PASS (with 1 major to fix)

---

## 2. core:transition-change

---

### Requirements Summary (decoupling-relevant)

- Input: `skipChecks` only; no `allowOutOfScope`/`allowOverlap`.
- Every predicate failure -> single `CheckPredicateFailedError` {checkId,label,code,message,action,details,skippable,from,to}; collect policy aggregates in `details.failures`; no `command` property; no check-id switch choosing error class.
- Committed recovery: thrown error reports committed state + host-neutral `nextAction` from `evaluateLifecycle` using forward checks via CheckRegistry (non-empty `checksByTarget`); no CLI/slash text; no `/specd-verify`; honours disabled `verifying`.
- `HappyPathNextUnavailableError` message host-neutral, exposes `state`.
- Skip validation: UnknownCheckError / CheckNotSkippableError (effects, non-skippable resolved binding).
- Parked approval repair uses same bound checks (APPROVAL_REQUIRED with action).

### Implementation Status

- Input type has `skipChecks`, `skipHookPhases`, `refreshImplementationTrackingBefore`; no bypass booleans (src/application/use-cases/transition-change.ts; asserted by test/application/use-cases/archive-change-input.spec.ts:15-17 for both inputs).
- Validation against resolved bindings: transition-change.ts:278-297 (`resolveEffectiveBindings` + `validateSkipChecks`).
- Shared evaluator in execute mode and again after hooks on fresh reconciled state: transition-change.ts:304-317, 369-412.
- `_throwPredicateFailures` (transition-change.ts:483-539): one CheckPredicateFailedError with `action`, `details`, `skippable` from the matching resolved binding, `{from,to}`; collect path adds `details.failures` (incl. per-failure `action`). The legacy reason mapper is gone (invalid-state-transition-error.ts drops incomplete-tasks / missing-task-capability / approval-required / gate-not-required reasons).
- Committed recovery: `_committedRecoveryError` (transition-change.ts:612-646) evaluates `evaluateLegalTargets(this._transitionBindings, {..., checkRegistry})` and `evaluateLifecycle`, so `nextAction` = lifecycle intent + check-declared action; `reason` text "Validity reconciliation returned the change to X" is host-neutral; `ReconciledOperationBlockedError` message uses the intent/action kind token only (src/application/errors/reconciled-operation-blocked-error.ts).
- HappyPathNextUnavailableError: src/domain/errors/happy-path-next-unavailable-error.ts (message has no `--next`, exposes `state`).
- Parked approval repair uses the bound `approval.spec`/`approval.signoff` rows (check-bindings.ts:111-124), no drain list in the use case.

### Discrepancies

1. [minor, spec] Verify scenario titled "Canonical built-in failures map to InvalidStateTransitionError reasons" asserts the opposite (CheckPredicateFailedError, no InvalidStateTransitionError). Title is stale; fix the title. Constraint text "InvalidStateTransitionError ... `incomplete-artifact` eligibility failure of ApproveSpec/ApproveSignoff" matches code (approve-spec.ts / approve-signoff.ts).
2. [minor, spec] Scenario "Committed recovery to ready reports the gate action from the check" is unreachable with the current reconciler: `selectAutomaticRecovery` (src/domain/services/change-validity.ts:200-207) only yields `designing` or `done`, never `ready`. The code is generic (would surface `approve-spec` if state were `ready`), but the scenario cannot be produced or tested end to end. Spec should target a reachable recovery (e.g. `done` with sign-off gate -> `approve-signoff`) or the scenario should be dropped.
3. [minor] `_emitFailureProgress` (transition-change.ts:576-599) branches on `workflow.requires` / `workflow.taskCompletion` ids to emit legacy `requires-check` / `task-completion-failed` events. Error class/reason are not chosen by it, and the spec's progress-callback requirement lists those events, so acceptable; it does contradict the literal "the use case contains no switch on the check id" in the scenario text. Spec wording could say "no switch to choose the error".
4. [minor] `_throwPredicateFailures` takes `change` and `schema` parameters it discards (`void change; void schema`, lines 492-493): dead params.
5. [minor] Unrelated-to-spec observation: when reconciliation changes state without `automaticReturn`, a generic `InvalidStateTransitionError` is thrown (transition-change.ts:233-236, 385); spec only defines the committed-recovery error when a recovery was committed, so OK.

### Test Coverage

- Committed recovery with verifying disabled: test/application/use-cases/transition-change.spec.ts:136-225 (asserts `intent !== 'verify'` and reason text).
- Parked approval, CheckPredicateFailedError carrying `action.kind`, `from`, `to`: transition-change.spec.ts:519-535, 698-729.
- skipChecks validation/bypass, collected failures, plugin failure fields: transition-change.spec.ts (multiple), validate-skip-checks.spec.ts.
- Input has no bypass booleans: archive-change-input.spec.ts:15-17.

### Missing / Weak Tests

- transition-change.spec.ts:178-225 asserts only `intent !== 'verify'`; the scenario also requires "no action has kind start-verification" and "neither the error message nor the guidance contains a CLI or slash command". Add `expect(error.message).not.toMatch(/specd|--|\//)` and `expect(nextAction.action?.kind).not.toBe('start-verification')`. The test title still mentions "/specd-verify".
- No test for committed recovery with verifying ENABLED (positive path), nor a committed-recovery case where `action` comes from a check (e.g. `approve-signoff` after sign-off recovery to `done`).
- No test asserting `HappyPathNextUnavailableError.message` lacks `--next` was found in the files grepped for this audit (verify scenario exists; locate before closing).

### Counts

Requirements reviewed: 24 (decoupling-relevant subset of 34); satisfied: 24. Findings: 0 major, 5 minor.

### Verdict: PASS

---

## 3. core:invalidate-change

---

### Requirements Summary (decoupling-relevant)

- Validation messages host-neutral (`targets`, `policy`, no `--target`); `InvalidateRequiresForceError` with `gates`/`recoveries`, no `--force`.
- `nextAction` after automatic recovery from `evaluateLifecycle` for the recovered state, host-neutral `intent` + optional `action`, evaluating forward checks through `CheckRegistry` (never empty `checksByTarget`); verifying disabled => never `verify`/`start-verification`.

### Implementation Status

- Messages: src/application/use-cases/invalidate-change.ts:279-298 ("targets are not allowed with policy ..."; "At least one target is required with policy ..."), src/application/errors/invalidate-requires-force-error.ts (message says "Pass force", exposes `gates`, `recoveries`).
- `invalidationNextAction` (invalidate-change.ts:234-270): `evaluateLegalTargets(transitionBindings, {..., checkRegistry})` -> `evaluateLifecycle(..., checksByTarget, bindingsByTarget)`; reason "Invalidation returned the change to X". Without recovery returns `{intent:null, reason:'Review the reported blockers before advancing'}`.
- Composition wires approvals, bindings, registry: src/composition/use-cases/invalidate-change.ts (`resolveInvalidateChangeDeps`).

### Discrepancies

1. [minor] Constructor defaults hide wiring gaps: `approvals = {spec:false, signoff:false}`, `transitionBindings = TRANSITION_BINDINGS` (domain stub table), `checkRegistry` optional (invalidate-change.ts:111-117). A deps-form caller omitting them silently gets gate-less guidance (no `approve-spec`/`approve-signoff` actions). The spec says the use case "MUST evaluate the forward checks ... through the CheckRegistry supplied at construction". Composition paths are correct; direct construction is a footgun. TransitionChange by contrast composes application bindings explicitly.
2. [minor, spec] `resolveInvalidateChangeDeps` requirement lists only `changes`, `actor`, `schemaProvider`; code also resolves `resolveChangeSchema`, `reconcile`, `approvals`, `transitionBindings`, `checkRegistry` (composition/use-cases/invalidate-change.ts). Update the spec list (and its factory scenario).
3. [minor, spec/code] Scenario "Recovery with verifying enabled still routes to verification" says `nextAction.intent` is `'verify'` for any recovery to `done`. With a valid verification, code returns `{intent:null, action:{kind:'approve-signoff'}}` (confirmed by test/application/use-cases/invalidate-change.spec.ts:492-497, "routes to approve-signoff when verifying is enabled and sign-off is missing"). That behaviour matches the lifecycle projection rule (approval action supersedes) and is arguably right; the scenario GIVEN does not pin verification state. `verify` is only produced when verification is stale/absent. Clarify the scenario (GIVEN verification required but stale) or add a test for that branch.
4. [minor, spec] "Recovery to ready reports the gate action from the check" cannot occur (see transition-change #2); no test exists, and none can be written without bypassing the reconciler.

### Test Coverage

- test/application/use-cases/invalidate-change.spec.ts:440-497: forced sign-off withdrawal -> `approve-signoff` action; verifying disabled -> intent `design` (because the invalidated design artifact is pending review), never `verify`, no action.
- Force/validation messages: invalidate-change.spec.ts (host-neutral message tests; CLI side in packages/cli).

### Missing / Weak Tests

- The "verifying disabled" test passes through the review-required branch (`design`); the clean-review branch (`archive` intent for `done`) is not exercised, so "intent and action come from lifecycle guidance for `done`" is only half verified.
- No test of the stale-verification branch (`intent: 'verify'`, `action: start-verification`, `supersedesIntent:false`) which is what the "verifying enabled" scenario literally describes.
- No assertion that `checksByTarget` passed to `evaluateLifecycle` is non-empty / that `CheckRegistry` is consulted (spy on `evaluateLegalTargets` or assert the action comes from a registry-supplied check).
- No test that the validation message omits `--target` beyond string content checks (verify scenarios list this; check CLI tests cover the flag projection).

### Counts

Requirements reviewed: 5 decoupling-relevant of 15; satisfied: 5. Findings: 0 major, 4 minor.

### Verdict: PASS

---

## 4. core:approve-spec

---

### Requirements Summary

Gate guard; sovereign schema; scope/artifact fingerprint; consent recorded without any transition; eligible states come from `boundFromStates('approval.spec')`; reconciler-owned mutation; single decorated actor; factories. (Decoupling change: eligibility from bindings, drop drain transition.)

### Implementation Status

- Gate/lookup/schema/actor order: src/application/use-cases/approve-spec.ts (`execute`): `ApprovalGateDisabledError('spec')` first, `ChangeNotFoundError`, `ResolveChangeSchema`, one `actor` reused in `reconcile.mutate`.
- Eligibility from bindings and no transition: approve-spec.ts `boundFromStates('approval.spec').includes(state)` (diff in working tree replaces the hardcoded `ready`/`pending-spec-approval` test and removes `ctx.change.transition('spec-approved', actor)`).
- Ineligible state -> `InvalidStateTransitionError(state,'ready')`; incomplete artifact -> `InvalidStateTransitionError` reason `incomplete-artifact`.

### Discrepancies

1. [minor, spec] Spec Purpose/Requirement says ineligible reconciliation "stops with the reconciled blocker" / "returns the typed blocker", but the use case throws `InvalidStateTransitionError` (no blockers, no nextAction). `ReconciledOperationBlockedError` only supports `operation: 'transition' | 'archive'`. Pre-existing and not part of this decoupling, but approve flows are the one place a host cannot render structured next-step guidance after recovery.
2. [minor, spec] Scenario "Enabled gate allows execute..." and "Consent in a parking state never transitions" match code. No contradictions found with the verify scenarios.

### Test Coverage

- test/application/use-cases/approve-spec.spec.ts (+14/-? lines in working tree) covers gate disabled, not found, parking state consent without transition (per diff), bound eligibility; composition: test/composition/use-cases/approve-spec.spec.ts.

### Missing / Weak Tests

- Scenario "Eligible states come from the check bindings ... any other state fails with InvalidStateTransitionError" is only meaningful if a test asserts a non-bound state (e.g. `implementing`) rejects; verify in the spec file (not re-read line by line here).

### Counts

Requirements reviewed: 8; satisfied: 8. Findings: 0 major, 1-2 minor.

### Verdict: PASS

---

## 5. core:approve-signoff

---

### Requirements Summary

As approve-spec, plus: sign-off only when verification evidence is current (when `verifying` enabled); distinct typed verification errors; stale evidence error "with `/specd-verify` recovery".

### Implementation Status

- Same structure as approve-spec: src/application/use-cases/approve-signoff.ts:91-187 (gate, schema, bound-from-states at line 113, no transition, verification outcomes mapped to VerificationNotFoundError / VerificationInProgressError / VerificationStaleError / VerificationFingerprintMismatchError, verifying disabled skips evidence).
- Distinct stale vs not-found: lines 116-128, 165-173.

### Discrepancies

1. [major, spec vs code, CONTRADICTION WITH GLOBAL SPEC] src/application/errors/verification-stale-error.ts:16 message: "Verification for change '<name>' is stale; run /specd-verify before sign-off". The approve-signoff spec itself mandates this ("typed stale/not-current error with `/specd-verify` recovery"), but default:\_global/error-handling-conventions ("Host-Neutral Core Errors" / "Host-Neutral Core Projections") forbids slash commands and delivery syntax in core. Both are wrong: the spec sentence should say "typed stale/not-current error with host-neutral recovery guidance and the change name as metadata", and the code should drop `/specd-verify` and expose `changeName` (currently no metadata property). (Known item; recorded as agreed.)
2. [minor, spec] Requirement "Signoff recording and state transition" still says that for historic `pending-signoff` the use case "records consent and moves to `signed-off`". Purpose, the verify scenarios ("Enabled gate allows execute ... remains in `pending-signoff`", "Consent in a parking state never transitions") and code (the `transition('signed-off')` branch was removed) say it never transitions. Stale sentence in the spec body.
3. [minor] Not-yet-actionable verification errors: `VerificationNotFoundError` / `VerificationInProgressError` are fine; `VerificationFingerprintMismatchError` unchanged.

### Test Coverage

- test/application/use-cases/approve-signoff.spec.ts:240-276 (VerificationStaleError for stale and legacy-unknown), plus parking-state/no-transition (per diff), verifying-disabled; composition spec test/composition/use-cases/approve-signoff.spec.ts.

### Missing / Weak Tests

- Nothing asserts the stale-error message is host-neutral (the tests only check the class); once the message is fixed add `not.toMatch(/specd|--|\//)`.

### Counts

Requirements reviewed: 8; satisfied: 8 (one satisfied only by literally honoring a spec sentence that conflicts with global spec). Findings: 1 major, 2 minor.

### Verdict: PASS (with 1 major to fix)

---

## 6. core:archive-change

---

### Requirements Summary (decoupling-relevant)

- Input: `skipChecks` only; no bypass booleans; `skipHookPhases`.
- Effective bindings via `resolveEffectiveBindings`, skip validation before any predicate/hook/write; governance locks (spec.overlap, impl.linksInScope the only skippable built-ins).
- All archive predicate failures -> `CheckPredicateFailedError` (checkId, label, code, message, action, details, from/to, `skippable` from resolved binding); `SpecOverlapError`/`ArchiveDependencyMismatchError` retired; `ReadOnlyWorkspaceError`/`ArchiveImplementationStateError` no longer produced.
- If reconciliation commits a mandatory return: typed diagnostic with committed state, automatic return, blockers and next action.
- Overlap bypass keyed on `spec.overlap` in skipChecks; peers invalidated via reconciler intent.

### Implementation Status

- Input/validation/effective bindings: src/application/use-cases/archive-change.ts:323-336; predicates run from resolved set with `skipChecks`: 338-354; `overlapBypassed` keyed on `spec.overlap` + effective binding: 334-336, 356-363; post-hook rerun 418-434.
- Failure mapping via one helper, `skippable` from resolved binding: archive-change.ts:1468-1483 (`throwArchivePredicateFailure`); merge-time deps check also `CheckPredicateFailedError` (1247-1256); link-materialization failures too (1277-1301).
- Committed recovery -> `ReconciledOperationBlockedError` (archive-change.ts:302-312, 404-414, helper at 1336-1356).
- Governance locks: check-bindings.ts:166-251.

### Discrepancies

1. [major, code] `archiveRecoveryError` hard-codes the next action: `intent: recovery.to === 'designing' ? 'design' : 'verify'` (src/application/use-cases/archive-change.ts:1342-1347). It does NOT use `evaluateLifecycle` / `CheckRegistry` like TransitionChange (`_committedRecoveryError`) and InvalidateChange do. Consequences: (a) recovery to `done` after a revoked sign-off yields `intent: 'verify'` with no `approve-signoff` action even when verification is valid; (b) when the schema disables `verifying` it still routes to `verify`, the exact defect the transition and invalidate specs forbid ("when the change schema disables `verifying`, the guidance MUST NOT route to verification"); (c) no check-declared `action` is ever present. The archive spec text only requires "a typed application diagnostic containing the committed state, automatic return, canonical blockers, and next action" and the verifying-disabled rule for the `verification.current` predicate, so no scenario literally fails, but this is inconsistent with the change's design (core:transition-checks "Projections", core:transition-change "Committed recovery reporting") and with default:\_global architecture intent of one guidance source. Either extend the archive spec with the same rule (recommended) and reuse `evaluateLegalTargets` + `evaluateLifecycle`, or document the exception.
2. [minor, spec internal contradictions: requirement bodies not updated for the retired errors]
   - "ReadOnly workspace guard" body mandates `ReadOnlyWorkspaceError` with a fixed multi-line message ("Cannot archive change ... Archiving would write deltas into protected specs."); verify scenario and code produce `CheckPredicateFailedError` for `workspace.readOnly` with message "Check 'workspace.readOnly' failed: Change contains specs from readOnly workspaces: ..." (src/domain/checks/workspace-read-only.ts:51-56).
   - "Overlap guard" body: "MUST throw `SpecOverlapError`" and "`SpecOverlapError` ... exposes `skippable`" vs "Typed errors" body ("`SpecOverlapError` retired") and verify scenario (CheckPredicateFailedError).
   - "Archive checks share runners" body: "mismatch SHALL throw `ArchiveDependencyMismatchError` via `deps.consistent`" vs retirement; scenarios "Dependency mismatch throws ArchiveDependencyMismatchError", "Open implementation file throws ArchiveImplementationStateError", "Built-in failures keep their dedicated errors", "Stale verification fails archive through the generic error" have stale titles whose bodies already assert CheckPredicateFailedError.
   - "Out-of-scope sidecar update guard": "ArchiveImplementationStateError" in body.
     Code follows the retirement/CheckPredicateFailedError path everywhere; the spec bodies/titles need cleanup.
3. [minor] Archive `postHookValidityBlocksArchive` failure throws a bare `InvalidStateTransitionError(change.state,'archiving')` (archive-change.ts:415-417) with no structured blockers/next action, while spec says missing/stale evidence "recommends renewing evidence in the current state". The predicate rerun (418-434) normally throws the typed `CheckPredicateFailedError` first, so this is a rarely-hit fallback; consider reusing the verdict blockers.
4. [minor] `throwArchivePredicateFailure` throws only the first failed predicate; unlike TransitionChange it does not aggregate multiple failures (spec does not require aggregation for archive). `from` is `change.state` and `to` is `'archiving'` (an attempted-hop label for an operation; spec says archive has no from/to/along, but the "Typed errors" requirement says the error carries "the attempted from / to"), consistent.
5. [minor] Out-of-scope guard coverage: `impl.linksInScope` message leak (see transition-checks #1) is what archive users see on out-of-scope maintenance failures.

### Test Coverage

- Overlap/readOnly/skipChecks/predicate failures: test/application/use-cases/archive-change.spec.ts (e.g. 4570 `skipChecks`, 4687-4703 no `--skip-checks`/`--allow-overlap` in overlap message, overlap peer reconcile 4104-4290); committed recovery diagnostic 3857-3915 (asserts `targetStep:'designing', intent:'design'` only).
- Input has no bypass booleans: test/application/use-cases/archive-change-input.spec.ts:15-17.
- Skip validation: test/application/services/validate-skip-checks.spec.ts (archive bindings at line 89).

### Missing / Weak Tests

- No test for `archiveRecoveryError` with recovery to `done` (the hard-coded `verify` path), with `verifying` disabled, or asserting a check-declared `action`; the only archive recovery test is the `designing` case (archive-change.spec.ts:3897-3907). A test written to the spec's own rule would currently FAIL.
- No archive test that failure messages for readOnly/deps/linksInScope are host-neutral (only the overlap message is checked at 4687-4703). A generic `expect(message).not.toMatch(/--|specd|\//)` over all archive predicate failures would have caught transition-checks Discrepancy 1.
- No test for `skippable` on `CheckPredicateFailedError` where a schema makes `spec.overlap` non-skippable (spec: `isSkippable:false`); verify scenarios 1725-1731 imply it.

### Counts

Requirements reviewed: 14 decoupling-relevant of 35; satisfied: 13; satisfied-with-caveat: 1 (committed recovery next action). Findings: 1 major, 4 minor.

### Verdict: PASS (with 1 major to fix)

---

## Cross-cutting: global specs

---

- default:\_global/error-handling-conventions "Host-Neutral Core Errors and Delivery Hints": violated by `VerificationStaleError` (`/specd-verify`) and, in spirit, by the `allowOutOfScope` hint in `detectImplLinksInScope`; satisfied for `HappyPathNextUnavailableError`, `InvalidateRequiresForceError` ("Pass force" names the input, not a flag), `ReconciledOperationBlockedError`, `CheckPredicateFailedError`, all built-in check messages/details, and all `NextAction`/blocker projections (grep of src for `specd <cmd>`, `/specd-*` literals in strings, `--flag` literals, `bypassFlag`, `command` found only the items above plus comment text).
- "Host-Neutral Core Projections": NextAction, Blocker, CheckResult, validity details are intent/action/`isSkippable`+`checkId` only. Satisfied. Archive recovery projection is host-neutral but not lifecycle-derived (archive Discrepancy 1).
- Actionable Messaging: `ReconciledOperationBlockedError` message ends "Follow the '<intent>' next action." (vague but structured metadata is exposed); acceptable. `CheckPredicateFailedError` prefixes `Check '<id>' failed:`.
- default:\_global/architecture could not be previewed (not in change specIds); the architecture-relevant points (use cases depend on ports, no CLI knowledge in core, composition injects application `create*` bindings) hold: TransitionChange/Archive/GetStatus compose `resolveWorkflowCheckRegistry`; only InvalidateChange defaults to domain stub bindings when constructed directly.

---

## Final counts and verdict

---

Specs audited: 6. Major findings: 3 (impl.linksInScope message `allowOutOfScope`; VerificationStaleError `/specd-verify`; archiveRecoveryError hard-coded intent). Blockers: 0. Minor findings: ~24 (mostly spec text drift and weak/missing tests). No scenario is genuinely unsatisfied.

Per-spec verdicts: transition-checks PASS, transition-change PASS, invalidate-change PASS, approve-spec PASS, approve-signoff PASS (major noted), archive-change PASS (major noted).

OVERALL: PASS (no blockers; 3 majors recommended to fix before merge; spec text cleanup needed for archive-change retired-error references, approve-signoff `signed-off` transition sentence, transition-checks execution-context list, unreachable "recovery to ready" scenarios in transition-change and invalidate-change).

### \_partial-cli-skills.md

# Partial compliance audit: CLI, skills, global error-handling (decouple-core-cli-workflow-guidance)

Method: merged spec content via `spec-preview`; read `packages/cli/src/guidance-presenter.ts`, `commands/change/{status,transition,archive,approve,invalidate,edit,verification}.ts`, `packages/skills/templates/**`, and the corresponding tests. Ran `vitest` for `packages/cli/test/guidance-presenter.spec.ts` + `test/commands/change` (518 passed, 0 failed) and `packages/skills` template-workflow/protocol specs (55 passed).
Scope note: where a spec lists many pre-existing requirements, only those touched by the change (presenter projection, bypass flags, intent/action exposure, in-place approval gates, host-neutral projections) were audited in depth; unchanged requirements were spot-checked against existing tests.

Presenter (`packages/cli/src/guidance-presenter.ts`): `resolveCliWorkflowCommand` (L27-65: intent first, then `approve-spec`, `approve-signoff`, `redesign-spec`, `start-verification`, `refresh-status` with real changeName, default = `action.guidance ?? null`), `resolveCliBypassFlag` (L84-93, requires `isSkippable===true` and non-empty `checkId`), `projectCliNextAction` (L115-140, appends ` Use --skip-checks <id> to archive anyway.` only for `intent==='archive'` + skippable `OVERLAP_CONFLICT`), `describeCheckFailure`. All consistent with the spec text.

---

## 1. cli:change-status

### Requirements Summary

Touched requirements: "Archive bypass hints come from resolved bindings" (bypass line / `bypassFlag`, overlap reason suffix, command projection from `intent`/`action`, additive `intent`/`action`/`blocker.action` for non-draft, drafted suppresses command/intent/action); "Drafted change status is read-only"; "Lifecycle projections come from GetStatus checks"; others unchanged.

### Implementation Status

- Text blockers + bypass line: `status.ts:268-279` (`    bypass: --skip-checks <id>` via `resolveCliBypassFlag`). OK.
- Next action projection (text): `status.ts:305-312`. OK.
- JSON/TOON: `status.ts:454-481` blockers carry `label`, `checkId`, `action`, `bypassFlag` (only when presenter returns one); `nextAction` = `{targetStep, actionType, reason, command, intent, action?}`. OK.
- Drafted: `status.ts:145-205` builds `nextAction` with `command: null` and only targetStep/actionType/reason (no intent/action leaks); `availableTransitions: []`, `availableSteps: []`, no DAG. OK.
- Overlap suffix only appended if `intent==='archive'`, skippable, and not already included. OK; locked/hardened blockers get nothing.

### Discrepancies

- minor: Drafted JSON/TOON emits `blockers: statusResult.blockers` raw (`status.ts:~198`), bypassing the blocker projection used for active changes. Blockers there may carry Core `isSkippable`, `details`, and `action` but never `bypassFlag`. Spec says `blocker.action`/`bypassFlag` are exposed "for non-draft results"; for drafts it is unspecified. Not a scenario failure (spec only requires nextAction not leaking). Either tighten the spec ("drafted blockers are passed through unprojected") or project them consistently.
- minor: "Unknown action kind: shows the guidance and invents no command". Implementation puts the guidance string into the `command:` field (text `command: Run the audit fixer`, JSON `nextAction.command`). The spec text for status is satisfied ("resolves to its host-neutral guidance or no command"), but the presenter conflates "command" and "guidance" (see verification spec below where the spec says "guidance and no command").
- minor (spec wording): "bypass: line directly under the blocker" holds, but the spec also says the CLI "MUST NOT filter ... locally"; presenter does not. No issue.

### Test Coverage (status.spec.ts)

Covered: bypass line text + multi-blocker + locked (L1877-1889), no bypass when not skippable (L1891), JSON/TOON `bypassFlag` exactly when text (L1900-1915), disabled overlap (L1917), drafted JSON empties hops/command null (L77-109), drafted text (L111-143), intent `verify` -> `/specd-verify` (L1147), presenter unit tests incl. overlap suffix for skippable and locked (`guidance-presenter.spec.ts` L75-117).

### Missing Tests (weak/absent)

1. "Gate action is rendered as a command" (`intent:null, action approve-spec` -> `specd changes approve spec`) at status command level: absent (only unit-tested in presenter spec).
2. "Stale approval is rendered as redesign" (`redesign-spec` -> `/specd-design`) at command level: absent.
3. "Intent wins over an informational action" at command level: absent (presenter unit test covers it, L26).
4. "Structured output exposes intent and action additively" (`nextAction.intent`, `nextAction.action`, `blocker.action` in JSON and TOON): no assertion found (status.spec L1485 only mocks a `start-verification` action for text validity).
5. "Drafted status does not leak intent or action": the drafted tests' mock `nextAction` has no `intent`/`action`, and no assertion that the keys are absent. Weak: the test would pass even if the code spread `statusResult.nextAction`. Add a mock with `intent: 'design'` + `action` and assert `'intent' in nextAction === false`.
6. "Unknown plugin action falls back to guidance" at command level: absent.
7. Overlap `reason` suffix through the status command ("Core reason carries no flag; CLI-projected reason ends with `Use --skip-checks spec.overlap to archive anyway.`"): the status test `archivable()` helper uses reason `'Ready to archive'` and never asserts the suffix; "Schema-hardened overlap: next-action reason does not suggest one" is also asserted only via `not.toContain('--skip-checks')` at L1891 (OK) but the positive suffix case is missing.
8. "Plugin archive check follows resolved skippability" (`@security.code-scan` blocker bypass in status): absent (generic bypass tests use built-in ids only).
9. "Missing display status falls back": exists (L249).

### Counts

Scenarios audited (decouple-related): 18. Satisfied by code: 18. Directly tested at command level: 9. Not (or weakly) tested at command level: 9 (items 1-8 above).
Verdict: PASS (implementation satisfies all scenarios; test gaps only).

---

## 2. cli:change-transition

### Requirements Summary

"Validity-aware transition guidance" (project `--skip-checks <checkId>` from `blocker.isSkippable` + `checkId`, project `nextAction.command` from intent/action via presenter, real change name); "Invalid transition error" (`CheckPredicateFailedError` repair guide, `command:` from check `action` via presenter, `Retry with --skip-checks <id> if an exception is granted` when skippable, none when mandatory); "CLI-rendered transition error hints".

### Implementation Status

- `transition.ts:164-212` `writeTextRepairGuide`: next action via `projectCliNextAction(status.nextAction, status.blockers)`; for `CheckPredicateFailedError` command = `resolveCliWorkflowCommand(null, cpErr.action) ?? projectedNextAction?.command` (L180); skippable bypass from hint helper or fallback `Retry with --skip-checks <id> if an exception is granted` (L184-193); non-check errors use `resolveCliBypassFlag` on the first skippable blocker (L205-212).
- Structured failure record: `transition.ts:440-490` projects `bypassFlag` on every blocker and `nextAction` with `command`, `intent`, `action`. OK.
- `HappyPathNextUnavailableError` hint via `resolveCliErrorHint` (L141-148, L455-462). OK.

### Discrepancies

- minor (spec internal tension): "Invalid transition error" requires the exact text `Retry with --skip-checks <id> if an exception is granted`, but "CLI-rendered transition error hints" requires the centralized helper for `impl.linksInScope`, which yields `Re-run with --skip-checks impl.linksInScope (or --allow-out-of-scope) if intentional` (`error-hints.ts:89`; asserted in `transition.spec.ts:1643`). Code follows the more specific requirement; the generic one should say "for checks without a dedicated hint". Same applies to archive.
- minor: Non-`CheckPredicateFailed` repair guide shows the bypass for only the first skippable blocker (`blockers.find`, L206), while `status` shows one per blocker. Spec scenario only needs one; consider listing each.
- minor: Command fallback (L180) `?? projectedNextAction?.command` can print a next-action command (e.g. `/specd-design`) under a check failure that declared no action. Spec says "if the failed check declared an action ... command from it"; the fallback is an extension, not contradicted.

### Test Coverage

Covered: repair guide with check label/command/bypass for a skippable `CheckPredicateFailedError` (L1613, L1735), mandatory check omits bypass (L1647), approve-signoff command (L858), `design`/`verify` next-action commands (L1313, L1460), HappyPath structured hint (L889), `--skip-checks` parsing.

### Missing Tests

1. "Missing approval shows the projected approval command" for `approval.spec`/`approve-spec`: the test at L280-335 (and L388) sets up the exact error but never asserts `command: specd changes approve spec` or the absence of `bypass:`.
2. "Repair guide projects bypass flag from isSkippable and checkId" (blocker-driven path, L205-212 and structured `bypassFlag` L469): no test; `grep 'Retry with'` only hits CheckPredicate cases.
3. "Repair command uses the real change name" (`start-verification` with `params.changeName`) in transition: not tested (only in status/presenter).
4. Structured failure record exposing `intent`/`action`: no assertion.
5. "Committed recovery is not rendered as an edge error": covered only indirectly by L1460.

### Counts

Scenarios audited (decouple-related): 9. Satisfied: 9. Tested: 5. Untested/weak: 4.
Verdict: PASS.

---

## 3. cli:change-invalidate

### Requirements Summary

"Reporting": `nextAction.command` projected from Core's `intent` (and optional `action`) via presenter; JSON/TOON expose `reason`.

### Implementation Status

`invalidate.ts:113-127` wraps `projectCliNextAction(rawNextAction)` and adds `intent` and `action` for text/json/toon (text prints the same projected command). Same pattern in `edit.ts:100-112` (not part of this spec). OK.

### Discrepancies

- none (minor: `rawNextAction.intent` is spread unconditionally; if a Core result ever lacks `intent` it serializes as `undefined`, but the core type requires it).

### Test Coverage / Missing Tests

- The existing invalidate tests (`change-invalidate.spec.ts:76-117`) mock `nextAction` in the old shape (`command: null`, no `intent`) and assert only `targetStep`. Nothing asserts "Recovery output names committed state ... `nextAction.command` is projected from `intent`" in text, JSON, or TOON. Missing: a test with `intent: 'design'` asserting `command: /specd-design` plus `intent` exposure, and that a mocked Core `command` field is ignored. Also, the old-shape mock no longer matches the Core type (stale mock).

### Counts

Scenarios audited: 3 (Recovery output names committed state, Structured success preserves reason, Preserve output reports blockers). Satisfied: 3. Presenter projection tested at command level: 0 of 1.
Verdict: PASS (test gap: major-ish for traceability, not a failing scenario).

---

## 4. cli:change-verification

### Requirements Summary

Start/complete MUST NOT synthesize a next action; invalidate renders Core's next action via presenter, exposes `intent`/`action`; blocker remediation `start-verification` resolves with real `changeName`, falls back to guidance when `params.changeName` is missing ("shows the guidance text and no command").

### Implementation Status

- `verification.ts:232` only `renderInvalidate` builds `nextAction`; start/complete have none. OK.
- `verification.ts:296-309` `projectNextAction`: presenter command + `intent: value.intent ?? null` + `action`. OK.
- `verification.ts:268-285` JSON blocker: `{code, message, action?, command?}` where `command = resolveCliWorkflowCommand(null, action)`.
- Text mode blocker lines (`verification.ts:246-250`) print only `! code: message`; the remediation command/guidance of a blocker is not rendered in text.

### Discrepancies

- minor: "Missing changeName falls back to guidance: shows the guidance text and no command". `resolveCliWorkflowCommand` returns the guidance string as the command, so JSON blockers get `command: 'Start a new verification attempt'`, i.e. guidance appears in the `command` field. Spec may be wrong (collapse to "command or guidance") or code wrong (separate `guidance` field and omit `command`). Same conflation as status.
- minor: Spec scenario "Verification remediation uses the real change name ... the CLI renders the remediation": text mode never renders blocker remediation (only JSON/TOON include `command`), and `command` on blockers is an undocumented additive field (spec only names `intent`/`action`/`command` for `nextAction`).

### Test Coverage

`verification.spec.ts:354-410` asserts the invalidate `nextAction` JSON including `command: '/specd-verify'` and `intent: 'verify'` (good, also checks private fields stripped). Persisted-reason test covers text/json/toon.

### Missing Tests

1. Blocker remediation with `start-verification` + `changeName` (no `<name>` placeholder).
2. Missing `changeName` fallback to guidance.
3. Assert start/complete outputs contain no `nextAction` (partially implied by the "does not invent one" scenario; `verification.spec.ts:70-135` does not assert absence).
4. Text-mode `command:` projection for invalidate (L354 loops text/json/toon but only asserts the JSON-structured shape; check text includes `/specd-verify`).

### Counts

Scenarios audited: 5 (structured output, persisted reason, command from presenter, real changeName, missing changeName). Satisfied by code: 4 fully, 1 partially (missing-changeName semantics, and text-mode remediation rendering). Tested: 2.
Verdict: PASS (no scenario outright unsatisfied; ambiguity on "no command").

---

## 5. cli:change-archive

### Requirements Summary

"Error cases"/"Check progress rendering": check failures report id/label/message + `details` context + check-declared `action` projected by presenter; skippable -> `bypass:  Retry with --skip-checks <id> if an exception is granted`; overlap error ends with `Use --skip-checks spec.overlap to proceed despite overlap.` when skippable; non-skippable -> no bypass; stale verification suggests the action projected from `start-verification`.

### Implementation Status

`archive.ts:166-215`: overlap path prints `Use --skip-checks spec.overlap ...` only when `err.skippable === true`; generic path: `cpCommand = resolveCliWorkflowCommand(null, err.action)`, `describeCheckFailure(err)` detail lines, bypass vs hint by `err.skippable`. Command line is printed when non-null. OK.

### Discrepancies

- minor: same Retry/Re-run tension as transition (hint helper wins for `impl.linksInScope`).
- minor: in the overlap branch (`archive.ts:~170-190`) an overlap failure with a declared `action` prints no `command:`; spec only requires the action projection in the generic case. Fine.
- minor: Text-only: `opts.format === 'text'` gates the repair formatting; JSON path relies on `handleError` and does not include the projected `command` from `action` (spec scenario "Plugin check failure in structured output" only requires code + exit code). Not a failure.

### Test Coverage (archive.spec.ts)

Covered: skippable overlap suggests bypass (L604), not skippable no suggestion (L629), plugin failure prints check/command/bypass (L687), non-skippable plugin no bypass (L702), JSON structured (L713, L652), impl.linksInScope hint (L725), `--skip-checks` parsing/dedupe/alias/hooks (L422-533), unknown/non-skippable/hook ids (L536-579).

### Missing Tests

1. "Stale verification suggests the verification action" (`verification.current` with `start-verification` action -> command with real change name): absent (grep for `start-verification` / `verification.current` in archive.spec.ts finds nothing).
2. "Dependency mismatch lists every mismatching spec" and "Read-only workspace lists affected specs" through the archive command (`describeCheckFailure` is unit-tested, but not wired-through for archive; `workspace.readOnly` appears only as a `CheckNotSkippableError` id at L582).

### Counts

Scenarios audited (decouple-related): 6. Satisfied: 6. Tested: 4. Untested: 2 (+ deps/readOnly render path).
Verdict: PASS.

---

## 6. cli:change-approve

### Requirements Summary

Approval failure reloads canonical status and renders actual state/blockers/next action; no stale pre-operation state.

### Implementation Status

`approve.ts:~139-175` `enrichApprovalFailure` calls `status.execute({name})` and projects `projectCliNextAction(status.nextAction, status.blockers)` plus `intent`/`action`; falls back to original error on reload failure. OK.

### Discrepancies

- none. (Observation: if status reload throws, the original error is rendered without context, consistent with code comment and acceptable.)

### Test Coverage / Missing Tests

`approve.spec.ts:203-234` covers text rendering (`next action: /specd-design` from `intent: 'design'`). Missing: JSON/TOON variants of the failure record (spec scenario "text, JSON, and TOON include actual state, blockers, and next action"), and an `action`-driven command (e.g. `specd changes approve spec`).

### Counts

Scenarios audited: 2. Satisfied: 2. Tested: 1 fully (text), 1 partial (json/toon not asserted).
Verdict: PASS.

---

## 7. skills:skill-templates-source

### Requirements Summary

Changed requirement: "In-place approval gates in workflow templates" (8 scenarios incl. new drain-state acceptance by `specd-implement`; routing table in `specd-new` drain-only rows). Related unchanged: overlap vs invalidation, archive bypass teaching (`--skip-checks <checkId>`, aliases, locked checks).

### Implementation Status (templates verified)

- `shared.md.tpl:482` pending states only as drain; `shared.md.tpl:~603` forbids listing pending states as happy-path intermediates; "stays in ready or done" copy present.
- `specd-verify`: stays in `done`, `approve signoff` (L424), no `pending-signoff`.
- `specd-design`: stays in `ready`, `approve spec` (L111, L461), no pending reference.
- `specd-implement` (L80-92): accepts `ready`/`pending-spec-approval`/`spec-approved`; no consent -> "stay in place", tells user to run `approve spec`, "Do **not** `transition implementing`"; with consent transitions.
- `specd-new` (L148-155): drain-only rows for `pending-signoff`/`pending-spec-approval` with matching approve command and "otherwise follow `nextAction`".
- `specd-archive` (L5-12): requires `archivable`/`archiving`, signoff wait is `/specd-verify` in `done`; bypass copy L29, L219-235 teaches `--skip-checks <checkId>` and aliases only as aliases, `--skip-hooks pre`.
- `specd` entry skill: no `approve`/`signoff`/`pending` text (grep returned none).
- Templates still tell agents to follow `nextAction.command` (design L59/L457, implement L40/L332, verify L45/L99/L333/L428/L465, archive L43, new L134). Consistent: the CLI keeps `nextAction.command` in JSON/TOON for compatibility.

### Discrepancies

- none blocking. minor: The templates reference `nextAction.command` and slash commands, which is the CLI-projected contract; if SDK/MCP hosts consume the same templates they would not have `command`. Not required by the spec as written.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts:124-166` covers verify/implement/shared/new/design/entry/archive scenarios (absence of pending-happy-path copy, presence of stay-in-state and approve copy, drain acceptance), `template-protocol.spec.ts`, `generated-skill-protocol.spec.ts`. All pass (55).

### Missing Tests

- Weak: "Hook list does not walk pending as happy-path intermediates" is asserted only via a single `toContain('Do **not**\nlist ...')` string match that is whitespace-sensitive (`template-workflow.spec.ts:141`); a re-wrap of the template would break it without changing meaning.
- "Implement skill accepts pending-spec-approval after consent": test asserts only that the strings appear (L133-135), not the with/without-consent split.
- The new archive-bypass teaching scenarios ("Archive skill teaches the canonical check bypass", "does not suggest bypassing a blocker without a flag", naming `workspace.readOnly`, `impl.filesResolved`, `deps.consistent`): the template is correct (archive L219-235) but I did not find a dedicated assertion for `--skip-checks <checkId>` / aliases / never-bypassable names in `template-workflow.spec.ts`; recommend adding.

### Counts

Scenarios audited (in-place gates 9, overlap/bypass 4): 13. Satisfied: 13. Tested: 9 directly, 4 weak/untested.
Verdict: PASS.

---

## 8. default:\_global/error-handling-conventions

### Requirements Summary

New "Host-Neutral Core Projections": non-error core models (next actions, blockers, check results, validity) MUST NOT embed `specd ...`, flags such as `--skip-checks`, or `/specd-*`; guidance is `intent`/`action`/`isSkippable`+`checkId`; hosts fall back to `guidance` for unknown kinds. Existing "Host-Neutral Core Errors and Delivery Hints" covers error messages (flags and `specd ...` CLI syntax).

### Implementation Status

- Grep of `packages/core/src`, `packages/sdk/src`, `packages/mcp/src` for `specd (change|changes|project|graph|spec) `, `/specd-(design|implement|verify|archive|new)`, `--skip-checks`, `--force`, `--allow-`, `--next`, `--skip-hooks` in non-comment code finds only: `core/.../errors/verification-stale-error.ts:16` and `sdk/src/presentation/_shared/catalogue.ts:40`. No leaks in `lifecycle-guidance.ts`, `lifecycle-evaluation.ts`, `get-status.ts`, or `application/checks/*`.
- CLI side: single presenter; no command strings elsewhere in `commands/change/*` besides presenter, `error-hints.ts` (allowed: CLI hint layer), `validate.ts` (CLI-authored spec-preview hint text) and archive overlap suffix (CLI).

### Discrepancies

- minor (already noted): `VerificationStaleError` message `Verification for change '<name>' is stale; run /specd-verify before sign-off` (core `verification-stale-error.ts:16`). Does the global spec require otherwise? Literally, the Errors requirement bans flags and "CLI command syntax (such as `specd ...`)", and the new Projections requirement exempts errors ("Non-error"). A `/specd-verify` slash command is agent-delivery syntax, so it violates the intent of the Errors requirement ("MUST NOT embed delivery-mechanism flags ... or CLI command syntax") though not its literal examples. The CLI has no `VERIFICATION_STALE` hint in `error-hints.ts` (grep: 0 matches), so the slash command reaches users verbatim. Fix options: reword to host-neutral text ("run verification before sign-off") and add a CLI hint, or widen the spec to name slash commands explicitly for errors.
- minor: `core/.../use-cases/get-status.ts:963` JSDoc comment still says `nextAction` remains `/specd-implement` (comment only; stale vs the intent model).
- minor (out of core scope): `sdk/src/presentation/_shared/catalogue.ts:40` embeds `specd changes spec-preview ...` in an SDK catalogue string. The spec's host list includes `@specd/sdk callers` as translators, and the SDK is not `@specd/core`, so no violation; mentioned for awareness.

### Test Coverage

Presenter unit tests cover unknown-kind fallback to guidance (`guidance-presenter.spec.ts:46-61`). Core-side "projections omit delivery syntax" is outside my assigned test dirs; no CLI-side test asserts it. I did not find a CLI/core test that greps projections for `specd `/`--skip-checks`/`/specd-`.

### Missing Tests

- A core-level contract test asserting `NextAction`/`Blocker`/`CheckResult`/validity from `GetStatus` contain no `specd `, `--`, or `/specd-` strings (scenario "Core projections omit delivery syntax").
- MCP mapping scenario (`@specd/mcp MAY map...`) is MAY-level; no test expected.

### Counts

Scenarios audited: 3 (omit delivery syntax, host translates, unknown kind falls back). Satisfied: 3 (code level). Tested: 2 (translate, unknown-kind via presenter unit tests); 1 untested (omit delivery syntax).
Verdict: PASS.

---

## Overall

| Spec                                        | Scenarios audited | Satisfied     | Tested at command level | Verdict |
| ------------------------------------------- | ----------------- | ------------- | ----------------------- | ------- |
| cli:change-status                           | 18                | 18            | 9                       | PASS    |
| cli:change-transition                       | 9                 | 9             | 5                       | PASS    |
| cli:change-invalidate                       | 3                 | 3             | 2 (projection untested) | PASS    |
| cli:change-verification                     | 5                 | 4 + 1 partial | 2                       | PASS    |
| cli:change-archive                          | 6                 | 6             | 4                       | PASS    |
| cli:change-approve                          | 2                 | 2             | 1.5                     | PASS    |
| skills:skill-templates-source               | 13                | 13            | 9                       | PASS    |
| default:\_global/error-handling-conventions | 3                 | 3             | 2                       | PASS    |

Totals: blockers 0, majors 0, minors ~14 (listed above), missing/weak tests ~30 (mostly command-level traceability for presenter projection scenarios).
Overall verdict: PASS (no scenario is genuinely unsatisfied). Highest-value follow-ups:

1. Add command-level tests for presenter-driven scenarios in status (gate action, redesign, intent-wins, unknown plugin guidance, additive intent/action, drafted no-leak with intent in the mock, overlap reason suffix) and transition (`approve-spec` command, blocker-driven bypass), invalidate (intent -> command), archive (stale verification action), approve (JSON/TOON).
2. Reword `VerificationStaleError` to host-neutral text (and add a CLI hint) or widen the spec to include slash commands for errors.
3. Resolve the spec tension "Retry with --skip-checks <id>..." vs hint-helper `Re-run with ... (or --allow-out-of-scope)` for `impl.linksInScope`.
4. Decide semantics for "guidance and no command": either split `guidance` from `command` in the presenter or relax the verification spec wording.
5. Add a core contract test for host-neutral projections.
