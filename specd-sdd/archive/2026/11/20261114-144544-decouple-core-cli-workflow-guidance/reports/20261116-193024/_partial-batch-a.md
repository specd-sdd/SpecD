# Partial compliance report, batch A (change `decouple-core-cli-workflow-guidance`)

Specs: core:lifecycle-engine, core:workflow-topology, core:workflow-model. Read-only audit. Merged content from `changes spec-preview`. Paths are relative to `packages/core/` unless noted. Tests listed by name or file.

---

## 1. core:lifecycle-engine

---

### Requirements Summary

1. Stateless domain lifecycle verdict: plain functions, no `LifecycleEngine` class. `LifecycleDomainVerdict` has no `command`/`bypassFlag`. The input option is `skippedCheckIds` (host-neutral check ids only).
2. Centralized validation logic: the verdict projects `CheckResult`s only, with no I/O, no `run:` effects, no snapshot bag.
3. Effective artifact status computation (`projectArtifacts`, parent-review precedence).
4. Canonical-state-only interpretation.
5. Machine-readable blockers: `code`, `message`, `isSkippable`, `checkId`, `action` (CheckAction propagated), `affectedArtifacts`. No `bypassFlag`. Validity verification blockers carry `start-verification` / `refresh-status` actions, not `details.command`. Skippable blockers listed in `skippedCheckIds` are omitted, and there are no warnings.
6. Available steps and domain next hop: canonical order, `listWorkflowTransitions`, optional-step recommendation policy, hop matrix, archiving guidance. `nextHop` has no `command`/`intent`.
7. Next hop derives from candidate evaluation only (no approval or validity reads). Generic INVALID_TRANSITION. One `isAtOrAfterVerificationBoundary`. Stale consent recovery is expressed through checks.
8. Application lifecycle guidance: `LifecycleActionIntent` is `design|implement|verify|archive`. Check-declared action precedence uses only `hopFailures`. `lifecycle-guidance.ts` has forbidden-token rules and one declarative table. `evaluateLifecycle` attaches `nextAction`. DAG-only consumers use empty `checksByTarget`.
9. Archiving escape transitions (`along = recovery`, no requires on archiving to archivable).
10. Review summary integration (drift, overlap).
11. Shared lifecycle interpretation for consumers (GetStatus/TransitionChange/Invalidate/Archive use `evaluateLifecycle`; ValidateArtifacts and GetArtifactInstruction use verdict with empty `checksByTarget`; CompileContext not a consumer; `lifecycle-engine.ts` is only a barrel).
12. Next artifact topological order.
13. Predicate blocker artifact identity.

### Implementation Status

1. Stateless domain verdict: OK.
   - `domain/services/lifecycle-verdict.ts:76` `evaluateLifecycleVerdict`, `:~375` `projectArtifacts`. `LifecycleDomainVerdict` (`:121-134`) has no command/bypassFlag/warnings. `LifecycleVerdictInput.skippedCheckIds` (`:66`); `isCheckSkipped` does an exact id set lookup (`:35`), so flag syntax is never parsed.
   - No `LifecycleEngine` class. `domain/services/lifecycle-engine.ts:1-19` is a re-export barrel. Public API test `test/public-api.spec.ts:7-10`.
2. Centralized validation: OK. Verdict reads only injected `checksByTarget` (`lifecycle-verdict.ts:196-205`) and skips targets with no injected results (no fallback to `check.run`). `Logger.debug` is the only side effect (`:337`).
3. Effective artifact status: OK (`effectiveStatus` helper and `findBlockingParent`, `find-blocking-parent.ts`).
4. Canonical-only: OK (tests `lifecycle-verdict.spec.ts:644`, `:696`).
5. Blockers: OK, with one PARTIAL.
   - `blockersFromFailedChecks` (`:822-842`) sets `checkId`, `isSkippable` from resolved bindings, and propagates `action`. It omits skippable blockers listed in `skippedCheckIds`. There is no `bypassFlag` anywhere in `packages/core/src` (grep clean).
   - Validity blockers: `validityBlocker` (`:886-894`) propagates `action`. `domain/services/change-validity.ts:545-565` emits VERIFICATION_REQUIRED/IN_PROGRESS/STALE with `startVerificationAction(changeName)` (`params.changeName`, `supersedesIntent:false`). The reconciler STALE path is at `application/use-cases/reconcile-change-validity.ts:480-485`.
   - PARTIAL: `VERIFICATION_VALIDITY_UNAVAILABLE` is not a reconciler/ValidityBlocker code. It comes from the `verification.current` check (`domain/checks/verification-current.ts:33-38`, `refreshStatusAction`) and reaches blockers through the generic check-failure projection. The spec's attribution to "the validity reconciler" is imprecise, but the behaviour (action `refresh-status` with `params.changeName`, no command string) is satisfied.
   - Validity blockers hard-code `isSkippable: false` and no `checkId` (fine; spec says nothing contrary).
6. Available steps and next hop: OK.
   - `availableSteps` is built from `resolveWorkflowPipeline` (canonical order, disabled excluded) and only rows with extras (`workflowStep === null` returns `[]`, `:208-211`).
   - `resolveLifecycleNextHop` (`:~1000-1136`) implements the hop matrix. `recommendedForwardTarget` (`:~930-960`) implements the optional-step walk (furthest available target across a consecutive optional run, fallback to the immediate optional step).
   - Overlap review gives `designing` (`:~981`). Archiving failed-commit gives `designing`, otherwise retry `archiving`.
   - Note (LOW): the verdict still keys the hop matrix on literal state names (`'ready'`, `'implementing'`, `'verifying'`, `'done'`, `'archivable'`). The spec itself prescribes this matrix, and position/boundary logic is derived from the pipeline, so this is consistent. The spec sentence "hardcoded lifecycle state lists MUST NOT be used" is satisfied for position comparison, not for the per-state matrix.
7. Next hop derives from candidate evaluation: OK.
   - `resolveLifecycleNextHop` takes `approvals` only to hand to topology (`recommendedForwardTarget`, `nextWorkflowStep`). It never reads `activeSpecApproval`/`validity`. `options.validity` only feeds `validityBlockers`, not `nextHop` (`:315`, `:318`). Test `lifecycle-verdict.spec.ts:1349` (identical nextHop with and without validity).
   - Drain states use one rule (`isDrainState` plus `nextWorkflowStep`, `:~1040`).
   - Generic INVALID_TRANSITION: test `:1314`.
   - Single boundary function `isAtOrAfterVerificationBoundary` (`:905`). Used by `reconcile-change-validity.ts:294`, `invalidate-verification.ts:147`, `lifecycle-guidance.ts:95`. No local lists. Tests `:1437-1470`.
8. Application lifecycle guidance: OK.
   - `application/services/lifecycle-guidance.ts:18` intent type is exactly the 4 phases. `resolveLifecycleIntent` (`:42-64`): first failed `hopFailures` result with `action` wins. `supersedesIntent === false` keeps the phase intent, otherwise intent is `null`.
   - Forbidden-token grep on the file is clean (no approval.spec, approval.signoff, verification.current, boundFromStates, activeSpecApproval, activeSignoff, validity.specApproval, validity.signoff, pending-spec-approval, pending-signoff, `reason` matching). A test enforces this (`lifecycle-guidance.spec.ts:57`).
   - Declarative tables `OWN_PHASE` / `TARGET_PHASE` (`:115-130`) map only to the four intents. Enablement and drain facts come from `isWorkflowStepEnabled`, `isDrainState`, `nextWorkflowStep`, `isAtOrAfterVerificationBoundary`.
   - Note (LOW): `intentForStateAndHop` still holds several `if (state === ...)` branches (`done`, `archiving`, `implementing`) beside the tables. Spec: "MUST NOT be duplicated across several if chains". One consolidated flow exists, so borderline. Not a clear violation.
   - Note (LOW): `resolvePhaseIntent` reads `validity.verification`, `validity.artifactReviewRequired`, `validity.recovery`. The spec forbids only `validity.specApproval`/`validity.signoff` in guidance and forbids all validity reads only in the domain `nextHop`. OK as written.
   - `evaluateLifecycle` (`lifecycle-evaluation.ts:35-64`) computes `hopFailures` via `selectHopFailures` (hop target, or first failing forward candidate by pipeline position) and then attaches `nextAction`. OK.
   - `done` + `archivable` available gives `'archive'`. `verifying` disabled never gives `verify` (`:164`, `:89-100`). Overlap review gives `'design'`.
9. Archiving escape: OK. `listWorkflowTransitions('archiving')` yields `archivable` and `designing` (`workflow-topology.ts:~190`). `transitionBlockers` skips the `archiving` to `archivable` requires projection (`lifecycle-verdict.ts:~257`). Test `lifecycle-verdict.spec.ts:721`, `:1054`.
10. Review summary: OK (`deriveReview`, `collectUnhandledOverlaps`). Test `:472`.
11. Shared interpretation: OK.
    - `evaluateLifecycle` consumers: `transition-change.ts:320,628`, `invalidate-change.ts:253`, `get-status.ts:686`, `archive-change.ts:315`.
    - DAG-only: `validate-artifacts.ts:258`, `get-artifact-instruction.ts:101`. Tests assert `checksByTarget: {}` (`validate-artifacts.spec.ts:317`, `get-artifact-instruction.spec.ts:111`).
    - `compile-context.ts` has no lifecycle calls (grep clean).
    - `gatherPredicateSnapshots` absent (`transition-checks.spec.ts:390`).
12. Next artifact topological order: OK (test `lifecycle-verdict.spec.ts:676`).
13. Predicate blocker artifact identity: OK (`lifecycle-verdict.ts:701`, test `:217`).

### Discrepancies

- D1 (LOW, spec wording): the spec attributes `VERIFICATION_VALIDITY_UNAVAILABLE` to the validity reconciler, but it is emitted by the `verification.current` check (`domain/checks/verification-current.ts:33`). Either the spec wording should say "validity reconciler or `verification.current` check" (spec is stale), or the reconciler should emit it (code would change). Code behaviour matches the intent, so the spec should be fixed.
- D2 (LOW, spec/code style tension): the spec says a single declarative table and no duplicated if chains in guidance. Code uses two tables plus an if chain in `lifecycle-guidance.ts:147-191`. Either tighten the spec ("tables plus topology-derived branching") or collapse the branches into the table. Not a behavioural defect.
- D3 (INFO): the spec text still names `--skip-checks`/`--allow-overlap` in verify.md scenario "CLI flag syntax is not interpreted by core" as negative examples only. This is intentional and tested (`lifecycle-verdict.spec.ts:515-538`).
- No contradictions found with project/global specs or dependencies (`core:workflow-topology`, `core:transition-checks`, `default:_global/architecture`, `default:_global/logging`). The Logger use at `lifecycle-verdict.ts:337` is the permitted exception.

### Test Coverage (verify.md scenario to test)

Covered: No LifecycleEngine class (`public-api.spec.ts:7`); verdict unifies dimensions (`lifecycle-verdict.spec.ts:1133`); no I/O (`:1095`); availableSteps lookup rows (`:1119`); no dual-write MISSING_ARTIFACT (`:1150`); recursive and mixed parent (`:250`, `:347`); complete-with-drift and missing+drift (`:644`, `:696`); skippability without bypassFlag (`:575`, `:924`, `:952`); flag syntax ignored (`:515`, `:540`); skip bypass; overlap review hop and history detection (`:472`); incomplete tasks / complete tasks (`:785`, `:810`); optional recommendations (`recommendedForwardTarget` tests `:56-110`); disabled verifying (`lifecycle-engine.spec.ts:110-250`); designing/verifying/archivable/done hops (`:828-1001`); alternative explicit target (`:1403`); missing approval keeps hop in place and illegal target (`:371`, `:1314`); one boundary derivation (`:1437`); archiving transitions and restore (`:721`, `:751`, `:1054`); consumer scenarios (get-status/transition-change/validate-artifacts specs); guidance scenarios (`lifecycle-guidance.spec.ts`, `lifecycle-engine.spec.ts:261`, `:327`); stale consent scenarios (`lifecycle-verdict.spec.ts:1200-1260`); verification currency (`:1260-1310`); preserve review (`:1329`); nextHop ignores validity (`:1349`); DAG order (`:676`); predicate artifact identity (`:217`); host-neutral serialization (`host-neutral-projections.spec.ts:59,90`).

### Missing Tests

- M1: "Blocker propagates CheckAction from failed check" has no assertion on `blocker.action` (grep finds only `nextAction.action` assertions: `lifecycle-verdict.spec.ts:408`, `get-status.spec.ts:1547,1695`). Blocker-level `action` preservation is only indirectly covered.
- M2: "Every verification validity blocker carries an action" has no direct test over all four codes through `evaluateLifecycleVerdict`. The check-level test (`verification-current.spec.ts`) covers the check, and `change-validity.spec.ts:214` only asserts codes. Add one asserting `action.kind` and `params.changeName` and no `details.command` for REQUIRED/IN_PROGRESS/STALE/VALIDITY_UNAVAILABLE.
- M3: "availableSteps follow canonical order regardless of row order" has no test (no verdict-level test with rows declared verifying, implementing, ready). Pipeline order is tested only in topology.
- M4: "All artifacts complete yields null next artifact": no explicit assertion found (`nextArtifact` null is not asserted in `lifecycle-verdict.spec.ts`).
- M5: "Parked state recommends its delivery edge / stays in place" is covered in `lifecycle-guidance.spec.ts:246` at guidance level; the domain `nextHop` side for `spec-approved` and `signed-off` is not obviously asserted.
- M6 (spot): "Passing skip checks recommend bypassing optional implementing" and "Consecutive optional steps" are tested via `recommendedForwardTarget` only, not through `evaluateLifecycle` end to end.

### Summary counts (lifecycle-engine)

Requirements: 13 total. OK 12, PARTIAL 1 (blockers: wording of VALIDITY_UNAVAILABLE), MISSING 0. Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW, 1 INFO. Missing tests: 6 (4 clear, 2 partial).

---

## 2. core:workflow-topology

---

### Requirements Summary

1. Module of pure workflow functions: 6 named exports; no class; internal helpers not exported.
2. Ordered pipeline construction (canonical order, row order ignored, omitted default enabled, disabled excluded, optional annotated, bedrock/anchor errors, drain states never steps).
3. Forward connectivity by construction.
4. Dynamic legal transitions (forward, optional shortcut, backward only if in VALID_TRANSITIONS and precedes, redesign, archive boundary, drain exits, disabled).
5. Bypassed step detection.
6. Topological forward progression (`nextWorkflowStep`).
7. Step enablement and verification boundary (consumers consult `isWorkflowStepEnabled('verifying')`).

### Implementation Status

1. Pure functions: OK. `domain/services/workflow-topology.ts` exports `resolveWorkflowPipeline` (`:~140`), `isWorkflowStepEnabled`, `listWorkflowTransitions`, `isWorkflowTransitionLegal`, `listBypassedWorkflowSteps`, `nextWorkflowStep`. Additionally exports `drainAnchorOf`, `isDrainState`, types `ApprovalGates`, `PipelineStep`, `DrainAnchor`. Internal helpers (`buildActivePipeline`, `forwardTargets`) are not exported. Test `workflow-topology.spec.ts:431` ("exposes only the topology functions including the drain-state table accessors"). See D1.
2. Ordered pipeline: OK.
   - `CANONICAL_PIPELINE` constant (`:34-43`) and `buildActivePipeline` (`:92-125`) normalise order silently; omitted rows default enabled/not optional; disabled filtered; optional attribute set.
   - Bedrock disabled/optional throw `SchemaValidationError` (`:103-113`). `ready` disabled with `approvals.spec` throws (`:114-119`). Drain states never in `CANONICAL_PIPELINE`.
   - `done` is bedrock, so `done` optional/disabled always throws; `approval.signoff` skip is in the check, not topology (tests `:177-195`; the check-level skip test is outside this file).
3. Forward connectivity: OK, by construction (`forwardTargets` `:~135-165`). Test `:135`, `:419`.
4. Dynamic legal transitions: OK.
   - `listWorkflowTransitions` (`:~190-225`): disabled `from` gives empty; drain states return `VALID_TRANSITIONS[from]` filtered by enablement with no pipeline normalisation; non-drain returns `forwardTargets` plus canonical moves that are redesign (`designing`), recovery (`archiving` to `archivable`), or backward (pipeline index lower).
   - Redesign `designing` to `designing` is admitted (`VALID_TRANSITIONS.designing` contains `designing`; test `:414`).
   - Archive-boundary: `forwardTargets` stops `archivable` unless `from === 'done'` and `archiving` unless `from === 'archivable'`.
   - Pending-signoff exits: `archivable, designing, done` (matches spec). Pending-spec-approval exits: `implementing, designing`.
   - `isWorkflowTransitionLegal` is exactly membership.
5. Bypassed steps: OK (`:~250-268`). Returns the strictly-between active steps for forward jumps, empty for adjacent/backward/self. Note: it does not itself check that `to` is legal. Acceptable per spec.
6. `nextWorkflowStep`: OK (`:~275-300`). `archivable`/`archiving` give null. Drain states use the first non-`designing` exit from `listWorkflowTransitions` (same rule for all four). Otherwise the next active step, including optional.
   - Legality invariant tested at `:379`.
7. Step enablement: OK. `isWorkflowStepEnabled` (`:~170`): bedrock true, else `!disabled`. Consumers: `reconcile-change-validity.ts:293`, `invalidate-verification.ts:144`, `approve-signoff.ts:107`, `lifecycle-verdict.ts:912`, `lifecycle-guidance.ts:89`. Archive consults it via the `verification.current` binding (`reconcile`/validity is used by `archive-change.ts`); end-to-end archive with disabled verifying has coverage in `archive-change.spec.ts`, `approve-signoff.spec.ts`, `get-status.spec.ts` (disabled verifying fixtures).

### Discrepancies

- D1 (LOW, spec vs code): the spec says "Internal helpers SHALL NOT be exported" and lists six functions. Code also exports `drainAnchorOf`, `isDrainState` (and `DrainAnchor`) used by `lifecycle-verdict.ts` and `lifecycle-guidance.ts`. Either the spec's export list is stale (add these accessors, and the test at `workflow-topology.spec.ts:431` already allows them), or these should move out of the topology module. Prefer updating the spec. verify.md scenario "Topology is consumed as named function imports" says "exports six plain functions"; it does not forbid extras, but "no internal helpers" is arguable.
- D2 (LOW, spec/code): spec item 3 for backward transitions says "edge admitted by VALID_TRANSITIONS AND destination precedes from"; code additionally admits `isRedesign` and `isRecovery` without the precedes test (`workflow-topology.ts:~213-219`). This matches the spec text for redesign (explicit) and archive escape (item 4), so it is consistent. Recorded because the code comment-free branch is not mentioned for recovery specifically as a separate rule.
- D3 (LOW): `listBypassedWorkflowSteps` does not verify `to` is legal; spec does not require it. No action.
- No contradictions with `core:workflow-model` or `core:schema-format`. Theme check: no CLI/skill strings in this module.

### Test Coverage

Covered: pipeline canonical/shuffled/bedrock/optional/disabled/anchor/done mandatory (`workflow-topology.spec.ts:21-200`); `isStepEnabled` (`:203-222`); legal transitions, shortcuts, disabled source, approval snapshot (`:225-275`); bypassed steps (`:276-308`); next step incl. approval snapshot (`:310-345`); drain states (`:346-370`, `:408`, `:483`); optional entry (`:372`); legality invariant (`:379`); redesign re-entry (`:414`); ready to done (`:419`); backward edges (`:458`); shortcut boundary (`:445`); drain not in pipeline (`:468`).

### Missing Tests

- M1: "Disabled signoff skips its check rather than done" (needs `approval.signoff` returns skip, `done` stays in pipeline): topology tests cover `done` staying mandatory but this exact scenario is not in the topology spec file; verify the check-level test exists in `application/checks/` (not found in a quick grep; `workflow-check-factories.spec.ts` uses `signoff:false` but no explicit skip assertion located).
- M2: "Pipeline order does not invent backward protocol edges" (`implementing` not returning `drafting`): no explicit test found by name in `workflow-topology.spec.ts` (partially implied by `:458`).
- M3: "Drain states gain no forward shortcuts" assertion that `isWorkflowTransitionLegal('pending-spec-approval','verifying')` is false is not clearly present (tests `:346-370` assert exits only).
- M4: "Disabled verifying never requires verification evidence end to end" with real reconciler: exists in several use-case specs (get-status, archive-change, approve-signoff, reconcile) but no single end-to-end implementing to done to archivable to archive test was confirmed.

### Summary counts (workflow-topology)

Requirements: 7 total. OK 7, PARTIAL 0, MISSING 0. Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW. Missing tests: 4 (all partial or unverified).

---

## 3. core:workflow-model

---

### Requirements Summary

Change delta touches only "Requires-based gating" and "Task completion gating" (check-failure wording). The remaining requirements are baseline: step names reference lifecycle states; step semantics; optional/disabled declarations; checks/skipChecks/archiveChecks declarations with governance locks; sovereign schema authority; requires-based gating; task completion gating; step check declarations; step availability evaluation; array order not significant; step-to-state mapping; hook execution at boundaries; two execution modes; requires reference artifact IDs.

### Implementation Status

1. Step names reference lifecycle states: OK. `domain/services/build-schema.ts:~830-860` rejects unknown steps ("not a valid lifecycle state") and drain-only states ("is a drain-only state and cannot be declared"). Omitted row gives `workflowStep()` null and enabled (`workflow-topology.ts isWorkflowStepEnabled`).
2. Step semantics: OK (behavioural; verification routing in verifying/transition use cases; out of this change's delta).
3. Optional/disabled declarations: OK.
   - Bedrock errors: `build-schema.ts:~860-870` and `workflow-topology.ts:103-113`.
   - Approval-anchor enforcement at build/resolve with approvals, including `schema validate`: `application/use-cases/validate-schema.ts:81-85` and `resolve-schema.ts:122-127` call `resolveWorkflowPipeline` when approvals supplied. `buildSchema` itself has no approvals (so enforcement is via the use cases; matches spec "built or resolved with project approvals"). Test `resolve-schema.spec.ts`.
   - Optional with no skip checks is an unconditional bypass: `recommendedForwardTarget` and bypass evaluation (shared candidate evaluator); covered by `lifecycle-verdict.spec.ts:90`.
4. Checks / skipChecks / archiveChecks: OK. `skipChecks` on disabled step (`build-schema.ts:~872`), `archiveChecks` only on `archiving` (`:~876`), governance errors in `build-schema.ts`/`check-bindings.ts`. Tests in `build-schema.spec.ts`, `build-schema-archive-checks.spec.ts`, `check-registry.spec.ts`.
5. Sovereign schema authority: OK (`resolve-change-schema.spec.ts`, `lazy-schema-provider.spec.ts`, `get-status.spec.ts` SCHEMA_VERSION_DRIFT).
6. Requires-based gating: OK. Evaluated as `workflow.requires` check shared by status and `TransitionChange` (`application/checks/*`, `lifecycle-verdict.ts:700-704`). Delta wording is satisfied.
7. Task completion gating: OK. `createWorkflowTaskCompletion` composes `CountTasks` (`application/checks/workflow-check-factories.spec.ts`). The verdict does not read task files (`lifecycle-verdict.ts` has no file I/O).
8. Step check declarations: OK (`schema.ts` / `build-schema.ts` carry `from`, `along` default `forward`, `onFailure`, `skippable`, `disabled`, `config`).
9. Step availability evaluation: OK, computed fresh each call (`evaluateLifecycleVerdict`), `CompileContext` does not evaluate (grep clean).
10. Array order not significant: OK (`CANONICAL_PIPELINE`, `workflow-topology.spec.ts:91`, `:117`). Along classification uses `isForward`/`pipelinePosition` (`lifecycle-verdict.ts:~890-905`), derived from the pipeline.
11. Step-to-state mapping: OK (no mapping table).
12. Hook execution at boundaries / two execution modes: OK for baseline behaviour (`transition-change.ts`, `archive-change.ts`; `skipHookPhases` specs).
13. Requires reference artifact IDs: OK (build-schema DAG/ID validation; baseline).

### Discrepancies

- D1 (LOW, theme conflict in spec text): `workflow-model` "Step check declarations" says `skippable`: "Permission to bypass via `--skip-checks`, subject to kernel governance locks." That is a CLI flag name inside a core spec. The change theme (core host-neutral, delivery hosts translate flags to check ids) suggests it should read "Permission to bypass via the orchestrator's check-bypass input (`skippedCheckIds`)". This section is NOT in the change delta (delta touches only Requires-based gating and Task completion gating), so it will remain unchanged after merge. Either (a) update the spec text, since core does not accept `--skip-checks` (confirmed: no `skip-checks` string in `packages/core/src` apart from the `validate-skip-checks` service filename), or (b) keep as a historical CLI mention. Recommend (a) for consistency with `lifecycle-engine`.
- D2 (LOW): "Skills MAY pass `skipHookPhases` and invoke `run-hooks` / `hook-instruction` manually" (Two execution modes) names CLI-flavoured command names in a core spec. It is baseline, not in delta, and not a behavioural defect.
- D3 (INFO): `core:workflow-model` still lists `core:compile-context` as a dependency whose description says "step availability during context assembly", while the spec body says `CompileContext` MUST NOT evaluate step availability. Dependency blurb is stale (baseline wording). Code agrees with the body (compile-context has no lifecycle calls).
- No contradiction with project/global specs or `core:workflow-topology` (consistent on order, anchors, bedrock rules).

### Test Coverage

Covered (representative): invalid/drain step rejection (`build-schema.spec.ts`), bedrock/anchor/connectivity (`workflow-topology.spec.ts`, `resolve-schema.spec.ts`), checks/skipChecks governance (`build-schema.spec.ts`, `build-schema-archive-checks.spec.ts`, `check-registry.spec.ts`), task-completion counts and CountTasks composition (`workflow-check-factories.spec.ts`, `transition-change.spec.ts`), schema sovereignty (`resolve-change-schema.spec.ts`, `lazy-schema-provider.spec.ts`), requires gating through status/transition parity (`get-status.spec.ts`, `transition-change.spec.ts`), hooks and `skipHookPhases` (`transition-change.spec.ts`, `archive-change.spec.ts`), noncanonical order (`workflow-topology.spec.ts:91`).

### Missing Tests

- M1: "Invalid step name rejected" - a grep for the literal message "not a valid lifecycle state" found no test asserting it (a generic SchemaValidationError test may exist; unverified).
- M2: "Status and execute share requires evaluation" as a single parity test (GetStatus and TransitionChange rejecting via `workflow.requires` for the same attempt): parity is exercised separately, no single combined test confirmed.
- M3: "Axis classifies along without sequential locking" / "Omitted listed step still classifies along via fallback" (`ready` to `verifying` is forward with `implementing` omitted; `verifying` to `implementing` is backward): along classification lives in `transition-checks.ts`; those scenarios were not located in the core tests I scanned (belongs to `core:transition-checks` batch; flag for the other reviewer).
- M4: Bulk of delta-unrelated scenarios were spot-checked, not exhaustively verified one by one.

### Summary counts (workflow-model)

Requirements: 14 total (2 changed by delta, 12 baseline). OK 14, PARTIAL 0, MISSING 0 (baseline ones spot-checked). Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW, 1 INFO. Missing tests: 3 (unverified or located elsewhere).

---

## Batch totals

- Requirements: 34 (OK 33, PARTIAL 1, MISSING 0).
- Discrepancies: 0 HIGH, 0 MEDIUM, 7 LOW, 2 INFO.
- Missing/weak tests: 13 (most notable: blocker-level `action` propagation, validity blocker action shape across all four codes, availableSteps canonical-order scenario, null nextArtifact).
- Theme verdict: no CLI/skill command strings or bypass flags remain in domain/application core code paths for these specs (`bypassFlag`, `--skip-checks`, `--allow-overlap`, `details.command` absent in `packages/core/src`; `host-neutral-projections.spec.ts` enforces it). Residual CLI-flavoured wording is only in spec prose (`core:workflow-model` "via `--skip-checks`") and not in the delta.
