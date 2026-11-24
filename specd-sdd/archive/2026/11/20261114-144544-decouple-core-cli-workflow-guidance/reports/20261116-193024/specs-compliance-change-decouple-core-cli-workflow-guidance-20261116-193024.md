# Specs compliance — change decouple-core-cli-workflow-guidance

Mode: delegated (attempt verification-attempt-3). 19 specs, 6 batches (A–F). Static audit; read-only.

## Aggregate summary

| Batch | Specs                                                        | Result                               | Discrepancies                          |
| ----- | ------------------------------------------------------------ | ------------------------------------ | -------------------------------------- |
| A     | core:lifecycle-engine, workflow-topology, workflow-model     | 33 OK / 1 PARTIAL / 0 MISSING        | 0 high, 0 med, 7 low, 2 info           |
| B     | core:get-status, core:change                                 | get-status 24/24 OK; change delta OK | 1 med (stale spec text), rest low/info |
| C     | core:transition-checks, transition-change, invalidate-change | 58 OK / 10 PARTIAL / 0 MISSING       | 1 med (stale spec text), rest low      |
| D     | core:approve-spec, approve-signoff, archive-change           | 0 MISSING, 3 PARTIAL                 | 2 med, 8 low/info                      |
| E     | 6 cli:change-\* specs                                        | 71 OK / 5 PARTIAL / 0 MISSING        | 2 med, ~19 low                         |
| F     | error-handling-conventions, skills:skill-templates-source    | 1 PARTIAL                            | 1 med, rest low                        |

No HIGH findings. No MISSING requirements. Core has no CLI/slash strings or bypassFlag left.

# Detailed findings

---

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

---

# Batch B compliance audit: core:get-status, core:change

Change: decouple-core-cli-workflow-guidance. Read-only audit. Scope note: depth concentrated on the change theme (host-neutral intents/actions, no CLI strings/bypass flags in core). The very large `core:change` spec was audited mainly on its delta (Lifecycle wording, legacy-state exits) plus theme-related text; the remaining unchanged requirements were not re-verified line by line.

---

## Spec 1: core:get-status

---

### Requirements Summary

Active GetStatus refreshes impl tracking, reconciles validity, projects artifacts/blockers/nextAction from check evaluation. Drafts are read-only. Blockers carry `isSkippable`/`checkId`/`label`/`action` but never CLI `bypassFlag`; `nextAction` is `{targetStep, actionType, reason, intent, action?}` with no command strings; archive overlap keeps intent `archive` with a host-neutral reason.

### Implementation Status

- Accepts name input (+refresh/ifModifiedSince): OK. `packages/core/src/application/use-cases/get-status.ts` `execute` ~L491.
- Returns change/draftView/artifactStatuses/specDependsOn/review/blockers/nextAction: OK. Result type L363-391.
- Resolution order get -> getDraft -> ChangeNotFoundError; no getDiscarded: OK (L493-500; getDiscarded not referenced).
- Revision evaluation (reconcile before unchanged): OK per code path (tests L1245-1320). Drafts ignore `ifModifiedSince` (spec says "may"): OK.
- Drafted read-only (empty transitions, intent null, no action): OK. `_buildDraftedResult` L841-945.
- Implementation status projection: OK (`projectImplementationTracking`, L632/775).
- Pre-read refresh / operational reconciliation / schema-failure degradation: OK (L504-520, `_buildActiveResult` L578-638, tests L336-435).
- Drift-aware display status: OK (L601-607, L711-721).
- Task completion counts from check, no 2nd CountTasks: OK (`taskCompletionFromChecks` L696; tests L582-680).
- Execute matching predicates + archive bindings: OK (L650-685). Archive overlap carries `isSkippable` only from resolved archive binding (`_mergeBlockers` L959-1042). No bypassFlag field exists in `Blocker` (L264-279). No `--skip-checks`/CLI strings found anywhere under `packages/core/src` (grep).
- Archive overlap nextAction: OK. `_nextActionAfterArchiveOverlap` L1052-1066 uses `overlap.message` as reason; intent `archive`, targetStep `archivable`.
- Shared candidate evaluation: OK (`evaluateLegalTargets`, `evaluate-transition-candidate.ts`).
- Blockers incl. label/action propagation: OK (L1014-1039). `details` field exists for schema identity mismatch (L399+).
- IMPLEMENTATION_STATE skippability only for impl.linksInScope: OK via resolved bindings (tests L732-900).
- Approval/verification/fingerprint projection (`ValidityStatusProjection`, `fingerprintIssues`): OK (L312-322, L781).
- Constructor deps / resolveGetStatusDeps / createGetStatus config: OK per tests in `composition/use-cases/workflow-check-registry.spec.ts`, `composition/use-cases/get-status.spec.ts`.
- Schema warnings as structured result field: OK (`schemaWarnings`).

### Discrepancies

1. LOW (spec wording): verify.md "Drafted result still includes artifact statuses" says `result.artifacts`; code field is `artifactStatuses`. Spec typo; code is consistent with spec.md body.
2. LOW: `OVERLAP_CONFLICT` nextAction reason is simply the failed check's message (`get-status.ts` L1063). Spec requires only "names live overlap in host-neutral terms". Satisfied only as long as the spec.overlap check message stays host-neutral. Current detection messages contain no flags (grep clean), but this is an implicit coupling with no guard test on the real check (the test at get-status.spec.ts L1395-1433 uses a stub check message "Specs overlap with other active changes"). Either spec is fine and code is fine, or add a guard test on real `spec-overlap.ts`.
3. INFO: `_nextActionAfterArchiveOverlap` drops any `action` from the verdict nextAction when overlap present; spec silent. Acceptable.
4. INFO: `hook-effect-shared.ts` / `transition-checks.ts:396` use `command` in hook progress details; this is the hook shell command, not CLI guidance. Not a violation of the theme.

### Test Coverage (`packages/core/test/application/use-cases/get-status.spec.ts`, plus composition tests)

Covered: not-found, sovereign schema, refresh toggles, schema degradation + identity mismatch (L336-435), shortcut/step-skip evaluation (L437-540), CountTasks memo (L582-680), bypassFlag absence (L732, 846, 1426, 1471, 1636, 1792), gerund label, overlap vs invalidation, archive binding overrides (L1728-1918), validity projection, ifModifiedSince (L1245-1320), fingerprint diagnostics (L1920), draft read-only (L1078-1220).

### Missing Tests

- MISSING: "Failed gate check action reaches blocker and nextAction" at GetStatus level (blocker `action: {kind:'approve-spec'}` and `nextAction.action`, intent null). Only verdict-level coverage (`domain/services/lifecycle-verdict.spec.ts` L408) and `lifecycle-guidance.spec.ts` L125; `get-status.spec.ts` has no `approve-spec` assertion.
- PARTIAL: "Verification blocker carries start-verification" for a stale-verification `done` change. get-status.spec.ts L1548 asserts only `nextAction.action`; the blocker `action` and absence of `details.command` are not asserted.
- MISSING: "Discarded-only name is not found / getDiscarded not invoked" at GetStatus level (getDiscarded appears only in helper files).
- MISSING: "Draft resolution uses getDraft not get" spy assertion is only implicit.
- MISSING: "Drafted status ... nextAction.action is undefined" not explicitly asserted (intent null covered).
- MISSING: "Archive predicates run without user bypass" (empty skipChecks assertion) and "Status evaluation has no transition effects" (no hook/persist) not found as explicit tests.
- MISSING: "Missing reconciler fails instead of falling back" at GetStatus level (a composition-level `mandatory-validity-reconciler.spec.ts` exists; not verified to cover GetStatus direct deps).
- No guard test that the real spec.overlap message is flag-free (see discrepancy 2).

### Summary counts

Requirements: 24 | OK: 24 | PARTIAL: 0 | MISSING: 0 | Discrepancies: 2 LOW + 2 INFO | Untested/partially tested scenarios: 7

---

## Spec 2: core:change

---

### Requirements Summary

Change entity owns persisted lifecycle facts: identity, lifecycle table, gates, verification/approval projections, artifacts, history, drafting. Change delta: host-neutral Lifecycle wording and legacy pending-state exit edges (`pending-spec-approval` -> implementing/designing; `pending-signoff` -> archivable/designing/done; no edge into `spec-approved`/`signed-off`).

### Implementation Status (delta + theme-related)

- Lifecycle table / VALID_TRANSITIONS: OK. `packages/core/src/domain/value-objects/change-state.ts` L32-45 matches the delta exactly (ready: implementing,designing; done includes archivable,designing,implementing,verifying; pending-spec-approval and pending-signoff exits ordered forward-first; archiving: archivable,designing; no entry edges to spec-approved/signed-off).
- Sign-off recovery edges only via central reconciliation: OK. `RECOVERY_ONLY_TRANSITIONS` L63-100 (`signed-off`/`archivable` -> `done`), absent from VALID_TRANSITIONS.
- Designing self-entry: OK (`designing: ['ready','designing']`).
- Lifecycle interpretation authority: PARTIAL (see discrepancy 1).
- Remaining unchanged requirements (identity, workspaces, artifacts, history, drafting, fingerprints): not re-verified in depth; no contradictions with theme noticed.

### Discrepancies

1. MEDIUM: Stale text in core:change "Requirement: Lifecycle interpretation authority" (merged spec ~L409): "which blocker or domain `nextHop` should be surfaced (`evaluateLifecycle` attaches `nextAction.command`)". Code has no `nextAction.command` (`grep nextAction.command packages/core` empty); `NextAction` is `{targetStep, actionType, reason, intent, action?}` (get-status.ts L282-293). core:get-status explicitly says "neither nextAction nor any blocker may carry a CLI or slash-command string". Either the spec should be updated to "attaches host-neutral `nextAction.intent`/`action`" (code correct, spec stale; recommended, and this line is not touched by any delta of this change) or core really should expose a command (contradicts the change theme). Not covered by `deltas/core/change/spec.md.delta.yaml` (only Lifecycle section is modified).
2. LOW: "Requirement: Artifacts" says skip is performed "via a CLI command ... defined in the CLI spec" and via "skill definition". Core spec referencing CLI/skill delivery is mild theme leakage but is descriptive, not a core output string. Either leave (documentation) or reword to "delivery adapter". Code is unaffected.
3. LOW: History table row `description-updated` references `EditChange` "with `--description`", a CLI flag in a core spec. Same class as 2.
4. INFO: Delta verify.md adds three scenarios under "Requirement: Lifecycle" while the merged verify.md also has other scenarios (e.g. L663-683); consistent.

### Test Coverage

`packages/core/test/domain/value-objects/change-state.spec.ts`: covers pending-spec-approval exits (L33-34), pending-signoff exits (L46-48), `isValidTransition('pending-spec-approval','spec-approved')` false (L84), `pending-signoff -> signed-off` false (L85), `spec-approved -> pending-spec-approval` false (L107), recovery edges kept out of manual (L70, L157), ready/done/archivable/archiving tables (L130-150), HAPPY_PATH_NEXT (L76).

### Missing Tests

- PARTIAL: scenario "spec-approved and signed-off have no entry edge" (scan every source state): only pairwise checks at L84/85/107 exist; no loop asserting no source state lists either target.
- PARTIAL: "exactly `implementing` and `designing`" ordering for `pending-spec-approval` is checked via pairwise `isValidTransition` rows (L33-34), not an exact-array/ordering assertion (verify "forward exit listed first").
- Other unchanged scenarios of core:change were not audited for coverage in this pass.

### Summary counts

Requirements audited in depth: 3 (Lifecycle, Neutral designing self-entry, Lifecycle interpretation authority) | OK: 2 | PARTIAL: 1 | MISSING: 0 | Discrepancies: 1 MEDIUM, 2 LOW, 1 INFO | Partially untested delta scenarios: 2

---

## Top findings

1. core:change still says `evaluateLifecycle` attaches `nextAction.command`; code and core:get-status say there is no command string (spec stale, MEDIUM).
2. core:get-status implementation is fully host-neutral (no bypassFlag, no CLI strings in core); gaps are test-only: GetStatus-level `approve-spec` action propagation, blocker-level `start-verification`, discarded-only not-found, no-effects/empty-skipChecks.
3. core:change delta lifecycle table matches code exactly; the "no entry edge" scenario lacks a full-scan test.
4. Core specs still mention CLI flags (`--description`, CLI command for skip) in core:change (LOW).

---

# Partial compliance report, batch C

Change: `decouple-core-cli-workflow-guidance`
Specs: `core:transition-checks`, `core:transition-change`, `core:invalidate-change`
Method: merged content via `changes spec-preview`; code in packages/core/src, tests in packages/core/test. The audit was read-only, and no test suites were run (static comparison only).
Paths below are relative to `packages/core/` unless they start with `specd-sdd`.

---

## 1. core:transition-checks

---

### Requirements Summary

Delta-changed requirements (the focus of this change):

- Check identity and result: `CheckResult.action` is an optional host-neutral `CheckAction`. There is no CLI text in `action` or `details`.
- Check ABI and `CustomCheckDefinition`: neither carries a static `action` or `command`.
- Actionable fail diagnostics and skippable blocker projection: `isSkippable` and `checkId` come from resolved bindings, with no `bypassFlag`.
- New: Check-declared host-neutral actions (`CheckAction`, `BuiltInCheckActionKind`, typed factories, and the approval and verification proof of concept).
- Projections: `nextAction` has host-neutral `intent` plus `action`.
- Dynamic binding composition: the resolver is the single owner of overlays, and policy is read from resolved bindings.
- New: approval bindings cover legacy parking sources.
- New: per-check `details` contract.
- Modified: host-neutral `impl.linksInScope` message.
- New: `verification.current` bounds every verification-requiring exit.

Unchanged requirements were spot-checked only: applicability and classifyAlong, step-skip scope, archive operation, phase and `onFailure`, progress bus, validity verdict and reconciler, registry governance categories, and the no-snapshot-bag rule.

### Implementation Status (per requirement)

| Requirement                                                                                                                                        | Status          | Evidence                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check identity and result (`action` on CheckResult, no CLI text)                                                                                   | OK              | `domain/services/transition-checks.ts:146-163` (`CheckResult.action`); `:359-378` (`fail()` accepts `action`); no CLI strings found in core checks or details                                                                                     |
| Skip sources (self-discard and bypassedByUser)                                                                                                     | OK              | `application/services/execute-matching-predicates.ts` (bypassedByUser injection, tested at `test/application/services/execute-matching-predicates.spec.ts:647`)                                                                                   |
| Check ABI (`Check` has no action or command)                                                                                                       | OK              | `transition-checks.ts:491-510`                                                                                                                                                                                                                    |
| `CheckExecutionContext` fields                                                                                                                     | OK              | `transition-checks.ts:416-444` has all listed fields and no bypass booleans                                                                                                                                                                       |
| `CustomCheckDefinition`                                                                                                                            | OK              | `transition-checks.ts:450-457`                                                                                                                                                                                                                    |
| One file per check, no applicability in the check                                                                                                  | OK              | `domain/checks/*.ts`, `application/checks/*.ts`; bindings in `domain/services/check-bindings.ts`                                                                                                                                                  |
| Applicability from, to, along; classifyAlong via `resolveWorkflowPipeline`                                                                         | OK              | `transition-checks.ts:215-253`, `:279-302`                                                                                                                                                                                                        |
| Step-skip scope                                                                                                                                    | OK              | `transition-checks.ts:175-178`, `:265-270`, `:286-291`                                                                                                                                                                                            |
| Dynamic binding composition, items 1-10 (single resolver, single-pass cascade, coordinate isolation, archive overlay, InvalidInputError on mixing) | OK              | `transition-checks.ts:694-905` (`resolveEffectiveBindings`, shared `overlay`, `cascadeConfig` once, archive overlay at `:~820`, InvalidInputError at `:708-712`)                                                                                  |
| Archive is an operation                                                                                                                            | OK              | `ARCHIVE_BINDING_SPECS` (`check-bindings.ts`), attempt `{scope:'archive'}`; `approval.signoff` not bound there                                                                                                                                    |
| Binding phase and onFailure                                                                                                                        | OK              | `check-bindings.ts` hook.pre/hook.post rows for transition and archive match the spec table                                                                                                                                                       |
| Predicate vs effect, evaluation, shared candidate evaluator                                                                                        | OK (spot-check) | `application/services/evaluate-transition-candidate.ts` (tested in `evaluate-transition-candidate.spec.ts`)                                                                                                                                       |
| Validity verdict and single reconciler                                                                                                             | OK (spot-check) | `application/use-cases/reconcile-change-validity.ts`                                                                                                                                                                                              |
| Registry bindings and governance categories                                                                                                        | PARTIAL         | See D3 and D4 below                                                                                                                                                                                                                               |
| Actionable fail diagnostics (deps, overlap, readOnly messages)                                                                                     | OK              | `domain/checks/deps-consistent.ts:56-63`; `domain/checks/spec-overlap.ts:23-45`; `domain/checks/workspace-read-only.ts:38-45`                                                                                                                     |
| Skippable blocker projection without bypassFlag                                                                                                    | PARTIAL         | `isSkippable` and `checkId` come from resolved bindings (`application/use-cases/get-status.ts:1000-1040`; `domain/services/lifecycle-verdict.ts:822-840`). `checkId` is attached on every failed-check blocker, not only skippable ones (see D1). |
| Host-neutral `impl.linksInScope` message                                                                                                           | OK              | `application/services/detect-impl-links-in-scope.ts` (message has the count and examples, no flags); `outOfScopeSpecIds` preserved; test at `test/application/services/detect-impl-links-in-scope.spec.ts:17-28`                                  |
| Check-declared actions: `CheckAction` type, `BuiltInCheckActionKind`, factories                                                                    | OK              | `transition-checks.ts:81-143`; exported from `domain/services/index.ts:135-140` and `public.ts:790-795`                                                                                                                                           |
| Action: approval.spec emits `approve-spec` for REQUIRED and STALE                                                                                  | OK              | `domain/checks/approval-spec.ts:42-58`                                                                                                                                                                                                            |
| Action: approval.signoff emits `approve-signoff` for REQUIRED and STALE                                                                            | OK              | `domain/checks/approval-signoff.ts:36-56`                                                                                                                                                                                                         |
| Action: verification.current emits `start-verification` or `refresh-status` with `supersedesIntent:false`                                          | OK              | `domain/checks/verification-current.ts:28-86`                                                                                                                                                                                                     |
| Plugin action kinds namespaced `@plugin.id`                                                                                                        | PARTIAL         | Documented only (`transition-checks.ts:89`). Core does not validate or enforce the namespace, and `params` is untyped `Record<string, unknown>`. The spec says unknown kinds are "unknown to every host", which could be read as a host concern.  |
| Progress bus                                                                                                                                       | OK (spot-check) | `transition-checks.ts:385-410`                                                                                                                                                                                                                    |
| Projections (intent and action, `supersedesIntent`)                                                                                                | OK              | `application/services/lifecycle-guidance.ts:41-70`. Verified: action kind with default `supersedesIntent` gives `intent:null`; `false` keeps the phase intent. In implementing, `TARGET_PHASE` yields `verify`.                                   |
| No shared snapshot bag                                                                                                                             | PARTIAL         | Behaviour OK. Spec text is stale (see D2).                                                                                                                                                                                                        |
| Approval precedence, no hardcoded parked-state rule                                                                                                | OK              | `lifecycle-guidance.ts` no longer names parking states. Only `isDrainState` / `nextWorkflowStep` topology helpers remain.                                                                                                                         |
| Approval bindings cover legacy parking sources                                                                                                     | OK              | `check-bindings.ts` approval.spec rows for ready, pending-spec-approval and spec-approved; approval.signoff rows for done, pending-signoff and signed-off. `boundFromStates` test at `test/domain/services/transition-checks.spec.ts:224-235`     |
| Verification currency bounds every exit                                                                                                            | OK              | `check-bindings.ts` verification.current rows: verifying to done, plus the three archivable sources, plus the archive scope. Locks are false. Test at `test/application/checks/verification-current.spec.ts:55-62`.                               |
| Per-check details contract                                                                                                                         | PARTIAL         | See D5.                                                                                                                                                                                                                                           |

### Discrepancies

- **D1 (low-medium), skippable blocker projection: `checkId` is attached to non-skippable blockers.**
  - Spec: "SHALL attach `isSkippable` and `checkId` only when the resolved binding ... is skippable" (spec.md Actionable fail diagnostics; Projections). The same spec also says non-skippable blockers carry `isSkippable:false`, and that blockers "SHOULD include `checkId`".
  - Code: `lifecycle-verdict.ts:822-840` and `get-status.ts:1029-1037` always set `checkId: check.id` and `label`, with `isSkippable` true or false.
  - Possibility A: the spec's "only when skippable" is too strong, since `checkId` and `label` are used for display. The second sentence "SHOULD include checkId" in the transition-checks progress-bus section supports this. In that case, reword the spec.
  - Possibility B: the spec is right, and a host could wrongly offer a bypass because `checkId` is present. Hosts must gate on `isSkippable`. Resolve the spec's internal contradiction.

- **D2 (low, spec stale), "No shared snapshot bag" says `evaluateLifecycle` attaches `nextAction` "(including `command`)".**
  - Spec: spec.md:367. This section was not touched by the delta.
  - Code: `LifecycleNextAction` has `intent` and `action`, with no `command` (`lifecycle-guidance.ts:20-24`; no `command` matches in `lifecycle-verdict.ts` or `lifecycle-evaluation.ts`).
  - Recommendation: the spec text is outdated and should read "(including `intent` and `action`)". This contradicts the new Projections requirement.

- **D3 (low-medium, spec vs code), Category C bindings.**
  - Spec: `impl.filesResolved` and `impl.linksInScope` are bound under "step-skip implementing, transition entering verifying, and archive". Spec: `deps.consistent` and `workspace.readOnly` are Category C with `allowDisable:true`.
  - Code adds rows not in the spec: `from implementing to * forward` and `operation verification-start` on both impl checks (`check-bindings.ts`). Archive rows for `deps.consistent`, `workspace.readOnly` and `impl.filesResolved` are locked (`allowDisable:false`, `allowBindingOverride:false`).
  - Possibility A: the code is intentional (CLAUDE verification-start gating and archive hardening), and the spec should list the extra rows and archive locks.
  - Possibility B: the spec is authoritative (Category C = overridable) and the archive locks are over-restrictive.
  - Not caused by this change, but it affects spec accuracy.

- **D4 (low, spec contains CLI strings in core spec), Registry bindings requirement.**
  - Spec: "bypassed via `--skip-checks spec.overlap` (or legacy alias `--allow-overlap`)", "`--skip-hooks`", "Cannot be bypassed via CLI flag" (spec.md:240, 246-247). This is left in despite the change theme (core free of CLI strings).
  - Code is host-neutral. These are descriptive spec statements about delivery behaviour, not core output.
  - Suggestion: rephrase to "via skipChecks `spec.overlap` (CLI alias is a delivery concern)".

- **D5 (low), per-check details contract.**
  - Spec: `workflow.requires` details `{artifactId, status?, blockedBy?}`, where `blockedBy` is computed by the check. Code: `domain/checks/workflow-requires.ts:48-55` and `application/checks/workflow-requires.ts` pass `change` into the runner, so it matches.
  - Spec: `workflow.taskCompletion` details are `{artifactId, incomplete, complete, total}` or `{artifactId, reason}`. Code adds `byArtifact` (extra, harmless): `domain/checks/workflow-task-completion.ts:46-62`.
  - Spec: `spec.overlap` details are `{entries:[{specId,changes:[{name,state}]}]}`. Code (`domain/checks/spec-overlap.ts:38-45`) sets `entries` only when non-empty. It adds a `peers` key and omits `entries` when none are known. If the archive path supplies no entries, the contract is not met. The shape depends on `OverlapEntry` and was not verified end to end.
  - Spec: `workspace.readOnly` details are `{specs:[{specId, workspace}]}`; code adds `specIds` and uses `'(unknown)'` as the workspace fallback.
  - Spec: `deps.consistent` is `{mismatches:[...]}`; code adds `specIds`. OK.
  - `approval.signoff` can also fail with `VERIFICATION_*` codes carrying no action (`approval-signoff.ts:62-80`). The spec only states the action for `APPROVAL_*`. This is not a contradiction, but a gap.

- **D6 (info), `skippable` flag in the thrown error.** See transition-change D3.

### Test Coverage

Covered:

- CheckAction factories and emission: `test/application/checks/verification-current.spec.ts`; `test/application/use-cases/transition-change.spec.ts:534,597,708,729`; `test/application/use-cases/get-status.spec.ts:1695`; `test/application/services/lifecycle-guidance.spec.ts` (includes a source scan that lifecycle-guidance has no CLI strings or `boundFromStates`).
- Approval parking rows (`boundFromStates`): `test/domain/services/transition-checks.spec.ts:224-235`; `test/composition/use-cases/workflow-check-registry.spec.ts:150-170`.
- deps.consistent mismatches: `transition-checks.spec.ts:330-344`.
- Host-neutral links message: `detect-impl-links-in-scope.spec.ts`.
- Blockers without `bypassFlag`: `get-status.spec.ts:732-846`.
- `lifecycle-verdict.spec.ts:515` (no CLI aliases as domain flags).
- resolveEffectiveBindings: `transition-checks.spec.ts` (~1150-1340, archive operation), `build-schema-archive-checks.spec.ts`.
- Bypass: `execute-matching-predicates.spec.ts:329,647`.

### Missing Tests

- No test asserts that `workflow.requires` computes `blockedBy` for a `pending-parent-artifact-review` status. `blockedBy` has zero hits in `packages/core/test`, and `findBlockingParent` is exercised only in `lifecycle-verdict.spec.ts`. The verify scenario "workflow.requires computes blockedBy itself" and the transition-change scenario "Transition blocked by recursive parent review" are both untested end to end.
- No test for the scenarios "workspace.readOnly and spec.overlap carry their payloads" and "Details are host-neutral" as a cross-check (no generic test that all check details are free of CLI strings).
- No test for the scenario "Plugin action kinds are namespaced" (`@audit.fix`) and nothing enforces it. Grep for `@audit` and `BuiltInCheckActionKind` in tests returned nothing.
- No test that `Check` and `CustomCheckDefinition` declare no static `action` (type-level scenario "Check and CustomCheckDefinition declare no static action").
- No test for `passMemo` / CountTasks once per pass (scenario "CountTasks memo lives on passMemo not the check instance"). `passMemo` has no hits in tests.
- Not found: "approval.spec emits approve-spec when approval is stale" at the check level (`APPROVAL_STALE` appears in `domain/checks/approval-signoff.spec.ts` and `get-status.spec.ts`, but there is no `approval-spec.spec.ts` in `test/domain/checks`). Signoff is covered; spec stale-path emission is covered only indirectly.

### Summary counts (transition-checks)

- Requirements checked: 25. OK: 20, PARTIAL: 5, MISSING: 0. Discrepancies: 6 (0 high, 2 low-medium, 4 low or info). Missing or weak tests: 6 areas.

---

## 2. core:transition-change

---

### Requirements Summary

Delta-changed:

- Canonical pre-transition validity reconciliation item 5: committed recovery reports host-neutral `nextAction` built from evaluated forward checks.
- Shared runner errors: every failed predicate becomes `CheckPredicateFailedError` (no `command`; has `action`, `details`, `skippable`, `from`/`to`).
- Historic parked approval repair precedence: no drain-specific rules.
- Constraints: `InvalidStateTransitionError` is reserved for entity-level rejections.
  Other requirements were spot-checked.

### Implementation Status

| Requirement                                                                                                                                                  | Status          | Evidence                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input contract (no ad-hoc bypass booleans; `skipChecks` only)                                                                                                | OK              | `application/use-cases/transition-change.ts:50-86`; no `allowOutOfScope` or `allowOverlap`                                                                                                                                                                                                                    |
| Approval gates baked at construction                                                                                                                         | OK              | constructor `_approvals` (`transition-change.ts:~120`); composition passes `config.approvals`                                                                                                                                                                                                                 |
| Change must exist, tracking refresh                                                                                                                          | OK (spot-check) | existing tests                                                                                                                                                                                                                                                                                                |
| Spec and signoff approval is a check, no pending rewrite                                                                                                     | OK              | no `pending-*` rewrite in `execute` (`:233-345`); tests `test/application/use-cases/transition-change.spec.ts:519-646`                                                                                                                                                                                        |
| Pending-state requirement (Human-approval pending states)                                                                                                    | PARTIAL         | Behaviour follows the later "Historic parked approval repair" requirement. The earlier requirement text is stale (see D1).                                                                                                                                                                                    |
| Direct transition when gates inactive                                                                                                                        | OK              | `transition-change.ts:~285` `effectiveTarget = requestedTarget`                                                                                                                                                                                                                                               |
| Canonical pre-transition validity reconciliation 1-4                                                                                                         | OK              | `resolveEffectiveBindings` at `:268-278`, `validateSkipChecks` at `:288-296`, `evaluateTransitionCandidate` in `execute` mode at `:305-317`, throw at `:331+`                                                                                                                                                 |
| Item 5: committed recovery reporting (`evaluateLegalTargets` through registry, not empty `checksByTarget`)                                                   | OK              | `_committedRecoveryError` (`transition-change.ts:~610-650`) calls `evaluateLegalTargets` with `checkRegistry` and passes `checksByTarget` and `bindingsByTarget` to `evaluateLifecycle`. No CLI text in the message. Reason is `Validity reconciliation returned the change to <to>`.                         |
| Workflow requires enforcement                                                                                                                                | PARTIAL         | Behaviour is `CheckPredicateFailedError` (OK per the new shared-errors requirement). The `requires-check` event is emitted from check details in `_emitRequiresProgress` / `_emitFailureProgress`. The requirement text still says "MUST throw InvalidStateTransitionError ... incomplete-artifact" (see D1). |
| Task completion check                                                                                                                                        | PARTIAL         | Same stale-text issue; behaviour OK. `task-completion-failed` event emitted before the throw (`:~585-600`).                                                                                                                                                                                                   |
| Implementation-only retry, verification lifecycle, backward-hop invalidation, designing                                                                      | OK (spot-check) | unchanged by this delta                                                                                                                                                                                                                                                                                       |
| Archiving to archivable (recovery)                                                                                                                           | OK              | `classifyAlong` returns `recovery`; bindings exclude `recovery` for requires and taskCompletion                                                                                                                                                                                                               |
| Pre-hook and post-hook execution (by binding phase, not id)                                                                                                  | OK              | `_runEffects` iterates bindings by `phase` and `onFailure` (`:~440-465`)                                                                                                                                                                                                                                      |
| Shared runner errors (`CheckPredicateFailedError` with checkId, label, code, message, action, details, skippable, from/to; collect lists `details.failures`) | OK              | `transition-change.ts:~495-540`; `domain/errors/check-predicate-failed-error.ts:12-88` (no `command` property)                                                                                                                                                                                                |
| `skippable` from resolved binding of the failing check                                                                                                       | PARTIAL         | Read as `bindings.find(b => b.check.id === id)?.skippable`, where the first binding with the same id wins (see D3).                                                                                                                                                                                           |
| No switch on check id (scenario "use case contains no switch on the check id")                                                                               | PARTIAL         | See D2.                                                                                                                                                                                                                                                                                                       |
| Config-based factory and resolver                                                                                                                            | OK              | unchanged                                                                                                                                                                                                                                                                                                     |
| `to: 'next'`, HappyPathNextUnavailableError                                                                                                                  | OK              | `transition-change.ts:~243-252`; test `to next` block (`test/.../transition-change.spec.ts:296-343`)                                                                                                                                                                                                          |
| Bypassed step evaluation and hook suppression                                                                                                                | OK              | `transition-change.ts:~262-275`; tests `:3815-3869`                                                                                                                                                                                                                                                           |
| Historic parked approval repair (no drain list)                                                                                                              | OK              | no drain code in `TransitionChange`; tests `:646-730` (protocol.edge for `spec-approved`, approval check on `pending-spec-approval to implementing`)                                                                                                                                                          |
| Constraint "InvalidStateTransitionError reserved for entity rejections"                                                                                      | OK              | remaining `InvalidStateTransitionError` throws are at `:233` (post-reconcile movement without an automatic return) and `:385` (entity-level rejection)                                                                                                                                                        |

### Discrepancies

- **D1 (medium, spec self-contradiction after delta), unmodified requirement sections still describe the legacy error model.**
  - Spec text not updated by the delta:
    - "Workflow requires enforcement" says MUST throw `InvalidStateTransitionError` with `type:'incomplete-artifact'`, `artifactId`, `status`, `blockedBy`.
    - "Task completion check" says MUST throw `InvalidStateTransitionError` with reasons `missing-task-capability` and `incomplete-tasks`.
    - "Human-approval pending states" says "still fail automatic progression except designing (and the historic approve-forward targets used by drain)".
    - Constraint "Enter-ready and forward exit-implementing failures MUST preserve their existing typed errors".
  - These conflict with the delta-modified "Shared runner errors propagate" requirement ("SHALL NOT be produced from predicate failures"), the new Constraints bullet, and the Historic parked requirement.
  - Code and tests follow the new model (e.g. `test/.../transition-change.spec.ts:1180` expects `CheckPredicateFailedError`). Possibility A: the spec is stale and must be rewritten. Possibility B: some callers still depend on the legacy reasons (e.g. `packages/cli` mappers or `InvalidStateTransitionError.reason` consumers at `domain/errors/invalid-state-transition-error.ts:10,68` still carry `blockedBy` / `incomplete-*` shapes). Verify that CLI error-hints no longer depend on them (belongs to the cli batch).
  - The docstring on `execute` also still says `@throws {InvalidStateTransitionError} ... requires are unsatisfied, or incomplete tasks remain` (`transition-change.ts:193`), and the class doc says "Pending parking states are drain-only for in-flight changes" (`:116`). Both are stale.

- **D2 (low-medium), the check-id switch.**
  - Spec scenario "Canonical built-in failures ..." says "the use case contains no switch on the check id".
  - Code: `_emitFailureProgress` branches on `failed.id === 'workflow.requires'` and `'workflow.taskCompletion'` (`transition-change.ts:~570-600`), and `_emitRequiresProgress` finds `'workflow.requires'` by id.
  - These choose progress events only, not the error class or reason, and the same spec requires the `requires-check` and `task-completion-failed` events. The spec statement is therefore internally inconsistent: the events need check knowledge. Possibility A: relax the scenario to "no switch to choose an error class". Possibility B: move event emission into the checks via `onCheckProgress`.

- **D3 (low), `skippable` source.**
  - `_throwPredicateFailures` looks up `bindings.find(b => b.check.id === failed.id)`. When one check id has several resolved bindings (e.g. `impl.linksInScope` as transition plus step-skip rows with different policy), the first match is used, not the binding that produced the failing result. The spec requires the "resolved binding of the failing check". It is low risk if the evaluator returns only the matching binding per result, but this was not proven.
  - Tests at `transition-change.spec.ts:3072-3110` cover "policy from resolved bindings", but not the mixed-binding case.

- **D4 (low), the committed-recovery fallback.**
  - After a committed move without `automaticReturn`, the use case throws `InvalidStateTransitionError(change.state, ...)` (`:233`). It is entity-style and consistent with the constraint, but it is a context-free error. Unspecified.

### Test Coverage

- Committed recovery: `test/.../transition-change.spec.ts:136-176` (ReconciledOperationBlockedError, `intent:'archive'`); `:178-` (verifying disabled, `intent` not verify, `reason` contains "returned the change to done").
- Parked states, approval gating, designing redesign, `next` happy path: `:296-343`, `:519-730`.
- `CheckNotSkippableError`: `:3461-3477`, `:3613-3645`. Resolved-binding policy: `:3072-3110`.
- Collected failures: `:4386-4450`.
- Step-skip: `:3815-3869`.

### Missing Tests

- "Committed recovery to designing reports the design intent" (intent `design`, no action): not found at the transition-change level.
- "Committed recovery to done reports the sign-off action from the check" (`approve-signoff` taken from the check, not hardcoded): not found.
- Neither committed-recovery test asserts that the error message and guidance contain no CLI or slash command (the name mentions `/specd-verify`, but the assertions check intent only).
- "Transition blocked by recursive parent review" (`details.blockedBy`): no test (`blockedBy` has zero hits in core tests).
- "next from a parked state resolves to the delivery edge" with gates ON: only gate-off tests found (`:343-361`). The approval check deciding the hop on a parked `next` is not verified.
- Error has no `command` property: not asserted (no `'command' in` check found).
- "use case contains no switch on the check id": untestable as written and contradicted by code (see D2).

### Summary counts (transition-change)

- Requirements checked: 26. OK: 21, PARTIAL: 5, MISSING: 0. Discrepancies: 4 (0 high, 1 medium, 3 low). Missing tests: 7.

---

## 3. core:invalidate-change

---

### Requirements Summary

Delta-changed:

- Next action follows lifecycle guidance: host-neutral `intent` and optional `action`, derived through `evaluateLifecycle` with forward checks evaluated via `CheckRegistry` (no empty `checksByTarget`; verifying disabled never yields verify or `start-verification`).
- Config-based factory: resolver wires `changes`, `actor`, `schemaProvider`, `resolveChangeSchema`, `reconcile`, `approvals`, `transitionBindings`, `checkRegistry`.
  Others (input contract, policy, targets, approval guard, reconciler delegation, output contract, schema sovereignty) are unchanged.

### Implementation Status

| Requirement                                                                                                                                              | Status          | Evidence                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input contract, effective policy, target rules, normalization, approval guard, reconciler delegation, cause, artifact effects, order, drift, idempotence | OK (spot-check) | `application/use-cases/invalidate-change.ts:138-215`; existing tests `test/application/use-cases/invalidate-change.spec.ts:158-800`                                                                             |
| Output contract                                                                                                                                          | OK              | `invalidate-change.ts:~192-215` returns reason, policy, affected, projectionChanges, automaticReturn, blockers, nextAction                                                                                      |
| Next action derived from `evaluateLifecycle` with forward checks, host-neutral                                                                           | OK              | `invalidationNextAction` (`invalidate-change.ts:~237-270`): `evaluateLegalTargets(transitionBindings, ..., checkRegistry)`, then `evaluateLifecycle` with `checksByTarget` and `bindingsByTarget`. No CLI text. |
| Verifying disabled never yields `verify` or `start-verification`                                                                                         | OK              | `lifecycle-guidance.ts` (`verifyingEnabled` gates the `verify` branch); test `invalidate-change.spec.ts:479-488`                                                                                                |
| Factory and resolver                                                                                                                                     | OK              | `composition/use-cases/invalidate-change.ts:46-60` (all listed deps), `:96-131`                                                                                                                                 |
| Sovereign schema                                                                                                                                         | OK              | `invalidate-change.ts:~152-158` via `ResolveChangeSchema`                                                                                                                                                       |

### Discrepancies

- **D1 (low-medium), test vs verify-scenario drift.**
  - Spec verify scenarios: "Recovery with verifying enabled routes to verify" (verification also stale gives `intent:'verify'`), "Recovery to done with current verification asks for sign-off renewal" (`action {kind:'approve-signoff'}`, `intent:null`), "Recovery to designing reports the design intent".
  - Tests (`test/.../invalidate-change.spec.ts:420-497`) use a surgical design invalidation, so pending review wins and `intent` is `'design'` with `action` undefined. The titles say "verifying enabled ... routes to design", which is not the spec's scenario.
  - Code path for each scenario looks capable: `resolvePhaseIntent` returns `verify` first when verification is stale or absent, and `hopFailures` actions override intent. But none of the three spec scenarios is actually exercised.
  - Possibility A: the spec scenarios are the intended contract and tests are missing. Possibility B: the scenarios cannot occur through `InvalidateChange` with a surgical or global artifact policy (invalidation always reopens artifacts when policy is not `none`), so the scenarios need `policyOverride artifacts:none`. Only a test can decide this.

- **D2 (low), no-recovery fallback is undocumented.**
  - When `recovery === null`, `nextAction` is the fixed `{targetStep: change.state, actionType:'cognitive', reason:'Review the reported blockers before advancing', intent:null}` (`invalidate-change.ts:~266-272`). The spec requires lifecycle-derived guidance only "after an invalidation that triggers an automatic recovery", so this is not a violation. Spec is silent, so the behaviour is untested and unspecified. The reason string is host-neutral.

- **D3 (low), constructor default.**
  - `transitionBindings` defaults to the domain `TRANSITION_BINDINGS` (stub checks) when a caller builds `InvalidateChange` directly (`invalidate-change.ts:~112`). The spec says guidance MUST be based on forward checks from the registry supplied at construction. Composition always supplies the real bindings (`composition/use-cases/invalidate-change.ts:46-60`). `TransitionChange` has a stricter rule (it must not default to the domain stub). The spec's dependency list for `InvalidateChange` makes no such statement, so this is a gap rather than a violation.

### Test Coverage

- Recovery next action: `invalidate-change.spec.ts:420-497`.
- Resolver wiring: no direct test of `resolveInvalidateChangeDeps` was found (`grep resolveInvalidateChangeDeps test` returned nothing). Composition factories may be covered in other composition specs (not confirmed).

### Missing Tests

- Verify scenario "Recovery with verifying enabled still routes to verification" (stale verification gives `intent:'verify'`, no CLI string).
- Verify scenario "Recovery to done with current verification asks for sign-off renewal" (`approve-signoff`, `intent:null`).
- Verify scenario "Recovery to designing reports the design intent".
- Assertion that `nextAction` carries no CLI or slash string.
- `resolveInvalidateChangeDeps` resolves `approvals`, `transitionBindings`, `checkRegistry`.

### Summary counts (invalidate-change)

- Requirements checked: 17. OK: 17, PARTIAL: 0, MISSING: 0. Discrepancies: 3 (0 high, 1 low-medium, 2 low). Missing tests: 5.

---

## Cross-spec checks (project and global specs)

- No contradictions with `default:_global/architecture` were found: core output is free of CLI strings in `CheckResult.action`, `details`, `CheckPredicateFailedError` and lifecycle guidance. The only CLI-like text remaining in these three specs is descriptive (transition-checks D4).
- `core:archive-change`, `core:get-status` and `core:check-registry` (declared dependencies) were consulted only through the code paths above, not re-audited.

## Overall counts (batch C)

- Requirements: 68. OK: 58, PARTIAL: 10, MISSING: 0.
- Discrepancies: 13 (0 high, 1 medium, 4 low-medium, 8 low or info).
- Missing or weak tests: 18 distinct items.

---

# Partial batch D — core:approve-spec, core:approve-signoff, core:archive-change

Read-only audit. Impl paths under /Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core. Spec IDs for spec-preview are `core:approve-spec` etc. (not `core:core/...`). Change delta touches only a subset of requirements; the rest of each spec is pre-existing and was audited at lower depth (mostly reconciler/composition behaviour).

---

## 1. core:approve-spec

### Requirements Summary

Gate guard; change lookup; artifact hash computation; recording (state from `boundFromStates('approval.spec')`, never transitions); canonical reconciliation; persistence/return; input contract; gates baked at construction; factory/deps. Delta changes only wording (Purpose, "Approval recording...", "Persistence...") to host-neutral/no-transition language. No CLI strings in the spec.

### Implementation Status (src/application/use-cases/approve-spec.ts)

- Gate guard: OK — gate check first (:80-82), then get (:84-87), ResolveChangeSchema (:89-93), actor (:95). Schema errors propagate before actor/consent.
- Change lookup: OK (:84-87).
- Artifact hash computation: OK (delegated to `_fingerprint.specApprovalFingerprint` :104, `blockingArtifact` :147-172 excludes `hasTasks`). Cleanup/scope fingerprint lives in ValidityFingerprintService (not re-verified in depth).
- Recording / no transition: OK — `boundFromStates('approval.spec')` (:102), no hardcoded names, only `recordSpecApproval` (:112), no transition call.
- Canonical reconciliation: OK — everything through `_reconcile.mutate` (:96).
- Persistence/return: OK — returns `mutation.change` (:131); ineligible -> `InvalidStateTransitionError` (:127).
- Input contract: OK (`name`, `reason` readonly, :16-21).
- Gates baked: OK (ctor :53-70, `_approvals.spec`).
- Factory: PARTIAL — not re-read in depth; composition tests exist (test/composition/use-cases/approve-spec.spec.ts, 1.9K).

### Discrepancies

- LOW: Spec says state-ineligible/ineligible fails with `InvalidStateTransitionError`; code uses target `'ready'` hard-coded (:121,:127) rather than a binding-derived target. Spec does not mandate the target. Either spec should state the target, or code should derive it from the binding `to`. Evidence: approve-spec.ts:121.
- LOW: stale-approval-in-`implementing` flow depends on the reconciler (not in this file); not asserted in this use case's tests.

### Test Coverage (test/application/use-cases/approve-spec.spec.ts)

Gate disabled (:343), not found (:428), records consent in ready stays (:139), renewal keeps prior events (:161), drift persists review w/o consent (:192), pending-spec-approval no transition (:246-290), single decorated actor (:118), wrong state -> InvalidStateTransitionError (:373), sovereign schema + identity mismatch (:389,:409), mutate usage (:325).

### Missing Tests

- Scenario "Task artifacts excluded from fingerprint" / "Missing required artifact blocks approval" / "Approval snapshots canonical scope" (use-case level; may live in fingerprint service tests).
- "Approval renewed only in ready (implementing -> designing -> ready)" at this level.
- "Eligible states come from the check bindings" — wrong-state test uses a default state, does not prove bindings drive eligibility (no test overriding bindings).
- "Consent in a parking state never transitions" for `spec-approved` (only `pending-spec-approval` tested).
- "Factory equivalence / invalid mixed args" — verify in composition test (only 1.9K).
- "Factory passes config.approvals".

### Summary counts

Requirements 9: OK 8, PARTIAL 1, MISSING 0. Discrepancies: 2 (low). Untested scenarios: ~7.

---

## 2. core:approve-signoff

### Requirements Summary

Same structure as approve-spec plus implementation fingerprint, verification eligibility errors (NotFound / InProgress / Stale / FingerprintMismatch), disabled `verifying` bypass, and (delta) `VerificationStaleError` host-neutral message + structured `changeName`.

### Implementation Status (src/application/use-cases/approve-signoff.ts, errors/verification-stale-error.ts)

- Gate guard: OK (:96-112; schema before refresh/actor).
- Change lookup: OK.
- Artifact hash computation: OK — refresh tracking (:117), `completeFingerprint` (:134); whole-file/`text-v1` details live in the fingerprint service (not re-audited).
- Recording / no transition: OK — `boundFromStates('approval.signoff')` (:124), only `recordSignoff`, verifying-disabled branch skips evidence (:119-122, :149-158).
- Verification errors distinct: OK — NotFound/InProgress/Stale/Mismatch mapping (:167-185); stale never reported as not found.
- VerificationStaleError host-neutral: OK — message "Verification for change 'X' is stale; renew verification before sign-off" (no `specd`, `--`, `/specd-`), code `VERIFICATION_STALE`, `changeName` getter (verification-stale-error.ts:5-28).
- Canonical reconciliation / persistence: OK (`_reconcile.mutate`).
- Input contract, gates baked: OK.
- Factory: PARTIAL — not audited in depth.

### Discrepancies

- LOW: JSDoc `@throws` on `execute` omits `VerificationInProgressError` and `VerificationStaleError` (approve-signoff.ts:~100). Doc drift only.
- MEDIUM (spec vs impl wording): scenario "Signoff requires current completed verification" says "in-place verification renewal is recommended". The use case only throws `VerificationStaleError`; the recommendation must be rendered by the CLI from `changeName`. Either spec should say "the error carries the data for hosts to recommend renewal" or core should expose a structured action. Evidence: verification-stale-error.ts exposes only `changeName`; no `action`. (Consistent with change theme, but the scenario text is imprecise.)
- LOW: `InvalidStateTransitionError(state,'done')` target hard-coded (:158,:176).

### Test Coverage (test/application/use-cases/approve-signoff.spec.ts)

Verifying disabled w/o evidence (:199) and active-only (:211); NotFound (:223), InProgress (:231), Stale incl. code/changeName/no-CLI regex (:240-258), legacy-unknown stale (:260), fingerprint mismatch (:285); consent stays in done (:316); renewal append-only (:331); pending-signoff no transition (:368-415); gate disabled (:463); wrong state (:493); sovereign schema/identity mismatch (:179,:509); single actor (:159).

### Missing Tests

- Whole-file implementation fingerprint scenarios (dedupe/sort, symbol ranges, unreadable file fails, empty observed map) at use-case level.
- "Eligible states come from the check bindings" (no binding-override test); `signed-off` parking never transitions.
- "Reconciliation blocks signing a changed snapshot", "Signoff fingerprint atomically current", "Failed eligibility never signs".
- "Signoff requires current completed verification ... renewal recommended" (no recommendation asserted).
- Factory equivalence / invalid mixed args (composition test only 2.0K).

### Summary counts

Requirements 9: OK 8, PARTIAL 1, MISSING 0. Discrepancies: 3 (1 medium, 2 low). Untested scenarios: ~8.

---

## 3. core:archive-change

### Requirements Summary (delta-touched)

Typed errors (list incl. `CheckPredicateFailedError` for all archive predicates; `ArchiveDependencyMismatchError`/`SpecOverlapError` retired; no switch on check id); readOnly guard (details.specs + specific message format); overlap guard (details.entries, `skippable`, no delivery flags in message, peer invalidation via `spec-overlap-conflict` intent); archive checks share runners (mismatches in details); out-of-scope sidecar guard; canonical validity preflight (next action from `evaluateLifecycle` over committed state with forward-candidate checks, never hard-coded; disabled verifying never routes to verify).

### Implementation Status (src/application/use-cases/archive-change.ts etc.)

- Typed errors / generic check error: OK — `throwArchivePredicateFailure` (:1503-1517) builds `CheckPredicateFailedError` from check result with `skippable` from resolved binding and `{from,to:'archiving'}`; no switch on check id.
- Retired errors: OK — `ArchiveDependencyMismatchError`/`SpecOverlapError` not referenced except a stale JSDoc (see below).
- readOnly guard: PARTIAL — `details.specs` provided (domain/checks/workspace-read-only.ts:60-66), runs as binding before hooks; BUT message format differs from spec (see Discrepancy 1). Locked/non-skippable on archive: covered by validateSkipChecks (tests :4601).
- Overlap guard: OK — check emits `details.entries`/`peers` (domain/checks/spec-overlap.ts:58-62), message "Specs overlap with other active changes: peer (ids)" has no CLI flags; peers invalidated through `_reconcile.execute({intent:{type:'spec-overlap-conflict'}})` (:1256-1291), after first predicate pass and before hooks (:422-430); no `Change.invalidate` call in the use case.
- Checks share runners: OK/PARTIAL — merge-time `runDepsConsistent` re-run with `finalDependsOn` (:1303-1328) throws `CheckPredicateFailedError` with `details.mismatches`; the merge-time error carries only `{to:'archiving'}` (no `from`) and `skippable:false` — spec says `from`/`to` attempted (minor).
- Out-of-scope sidecar guard: OK — `impl.linksInScope` skippable via skipChecks; non-skippable rejection tested (:5085).
- Canonical validity preflight: OK — `_archiveRecoveryError` (:297-333) uses `evaluateLegalTargets` + `evaluateLifecycle` with `checksByTarget`/`bindingsByTarget`; only `reason` overridden; not hard-coded. Reconciler mandatory in ctor (test :198).
- verification.current action: OK in code — `startVerificationAction` (`kind:'start-verification'`) attached (domain/checks/verification-current.ts:47-82).

### Discrepancies

1. MEDIUM — readOnly message format. Spec (requirement "ReadOnly workspace guard") prescribes: `Cannot archive change "<name>" — it contains specs from readOnly workspaces:` + per-spec `- <specId>  →  workspace "<workspace>" (readOnly)` + `Archiving would write deltas into protected specs.` Implementation message is `Change contains specs from readOnly workspaces: <specId> (workspace '<ws>')...` (domain/checks/workspace-read-only.ts:50-62); the old formatted message existed at HEAD archive-change.ts:1519 and was dropped; no code or test emits/asserts the spec's format (grep for "Archiving would write" finds nothing in src/test). Possibility A: code regression — restore format (host-neutral already). Possibility B: spec is stale — relax to "message lists all affected specs and workspaces" (verify scenario already only requires that). Design.md does not mention the format.
2. LOW — stale JSDoc `@throws {ArchiveDependencyMismatchError}` on `_assertArchiveDepsConsistent` (archive-change.ts:1297); class retired. Code should say `CheckPredicateFailedError`.
3. LOW — merge-time `deps.consistent` error omits `from` and uses `skippable:false` rather than the resolved binding's skippability (:1308-1326). Spec says `skippable` taken from the resolved binding.
4. LOW — `ArchiveChange.execute` JSDoc `@throws` lists only plugin failures for `CheckPredicateFailedError` (:347), whereas spec lists all archive predicates.
5. INFO — spec "overlap scenario": `details.entries` and message include peer; verified in code, not asserted in tests.

### Test Coverage (test/application/use-cases/archive-change.spec.ts)

readOnly -> CheckPredicateFailedError/READ_ONLY_WORKSPACE (:3535); overlap throws (:3346); bypass proceeds/invalidates peers (:3387,:3433,:4152,:4235); overlap non-skippable/no-CLI-flag message & skippable (:4712-4753); other failing checks not bypassed (:4755,:4775); deps mismatch fails archive (:1232); open tracked files (:3570,:3593); out-of-scope links (:3617,:3664); plugin failure id/code/details (:4864); verification.current missing/stale (:405,:415); recovery to done projects `approve-signoff`, intent != verify (:3915); skipChecks validation (:4578-4682); ctor requires reconciler (:198).

### Missing Tests

- readOnly: no assertion of `details.specs` content, message content, "no hooks executed / no files written", nor that the change stays archivable (scenario "Archive rejected when change contains readOnly specs").
- Overlap block scenario: `details.entries` and message include `core:config`/`beta` not asserted (:3346 only checks id/code).
- Dependency mismatch scenario: `details.mismatches` with extracted + persisted deps not asserted (:1232 block checks id/code only; `typeof runDepsConsistent` is a vacuous assertion at :1317 area).
- Open implementation file: `details.files` not asserted.
- Stale verification scenario ("Stale verification fails archive through the generic error"): no assertion of `start-verification` action nor absence of `ArchiveImplementationStateError` (archive-change.spec.ts:415-460; grep `start-verification` = 0 hits).
- Built-in failures use the generic check error: no test that `verification.current`/`impl.filesResolved`/`deps.consistent` carry details per per-code contract nor "no switch on check id".
- readOnly `workspace.readOnly` locked binding via `--skip-checks` => CheckNotSkippableError (:4601 covers "locked and non-skippable built-ins" generically; not verified for this check specifically).
- Merge-time deps re-run against sidecar `finalDependsOn` reporting through same error.
- `typeof runWorkspaceReadOnly`-style assertions (:3566) are vacuous.

### Summary counts

Delta-touched requirements 6 (+ ~15 pre-existing, not individually re-audited): OK 5, PARTIAL 1 (readOnly message), MISSING 0. Discrepancies: 5 (1 medium, 3 low, 1 info). Missing/weak tests: ~8, including 2 vacuous assertions.

---

## Cross-spec check vs project/global specs

- No contradiction found with `_global/error-handling-conventions` for the three specs (errors carry structured data; core messages free of CLI/slash tokens in the audited files).
- grep of core/src for `--skip-checks|--allow-overlap|/specd-` in non-comment code returned no hits in the audited use cases/checks/errors.

## Overall

Totals: 3 specs, 0 MISSING requirements, 3 PARTIAL (factories/readOnly message), 10 discrepancies (1 medium workspace.readOnly message-format regression/spec drift, 1 medium signoff "renewal recommended" wording, 8 low/info), ~23 untested/weakly tested scenarios.

---

# Batch E compliance audit: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve

Change: decouple-core-cli-workflow-guidance. Read-only audit. Specs fetched via `changes spec-preview`.
Key implementation files: packages/cli/src/guidance-presenter.ts (new), packages/cli/src/commands/change/{status,transition,invalidate,verification,archive,approve}.ts, packages/cli/src/error-hints.ts, packages/cli/src/handle-error.ts. Tests: packages/cli/test/commands/change/\*.spec.ts, packages/cli/test/guidance-presenter.spec.ts, packages/cli/test/error-hints.spec.ts.

Cross-cutting check: `grep -rnE "--skip-checks|--force|--allow-overlap|--allow-out|/specd-(design|implement|verify|archive|new)|specd changes? <verb>" packages/core/src` returns NO matches outside comments. Core is clean of CLI/skill strings; all projection lives in guidance-presenter.ts.

Cross-cutting discrepancy (SPEC vs SPEC, affects transition + archive + status): see D-T1 below.

---

## 1. cli:change-status

### Requirements Summary

Signature; drafted read-only; output format (hasTasks, drift-aware state); task completion in DAG; display-state rendering; lifecycle projections from GetStatus (ordering, [optional], disabled omitted, DAG from sovereign schema); reconciled validity/next-action; text omits duplicated review file lists; blocker check labels; bypass hints from resolved bindings + intent/action presenter; schema version warning; not found; schema-derived fields (DAG via childrenOf, no convergent repeats); delegates refresh to GetStatus; implementation section (SDK projection); task counts in details; basic info; specs and dependencies; stable display status + drafted JSON compat.

### Implementation Status

- Command signature: OK (status.ts:84-91).
- Drafted read-only: OK. draftView branch status.ts:145-208; command forced `null` (:152), JSON `availableTransitions: []`, `availableSteps: []` (:199-200), no intent/action on nextAction (:148-153), no DAG. PARTIAL nit: drafted text blockers omit `label` form (status.ts:168 prints `! code: message` only; spec "Text blockers include check labels" applies to "a blocker ... carrying label").
- Output format (hasTasks / drift-aware state): OK (status.ts:496-500, uses displayStatus).
- Task completion in DAG / details: OK (status.ts:641-647, 400-406).
- Display-state rendering: OK (status.ts:399, 636, 508; stateSymbols maps complete-with-drift).
- Lifecycle projections from GetStatus: OK. Transitions/steps printed straight from `lifecycle` (status.ts:319-328); `[optional]` annotation :325; `optional` exposed in JSON :544; no local VALID_TRANSITIONS filter. PARTIAL: `--help` JSON schema documents `optional` on availableSteps (status.ts:108) but only for the legacy top-level shape; active JSON puts it under `lifecycle` (documented :109-112, includes optional) OK.
- DAG from sovereign schema: OK (status.ts:242-243 resolveChangeSchemaForCli + `schema.artifactDag()`); fallback to `ArchiveDag.from(schemaInfo.artifacts)` only when schema lacks methods (:71-74) - minor, schemaInfo is the change's own, not workspace default. Unresolved-schema case: DAG omitted when `lifecycle.schemaInfo === null` (:241); blocker comes from GetStatus (not independently verified in core; out of batch).
- Reconciled validity/next-action: OK/PARTIAL. validityTextLines + publicValidity (\_validity-present.ts:268-300) show states, recovery, blockers, fingerprintIssues, projectionChanges. Fingerprint issues rendered as diagnostics (not blockers) - OK.
- Text omits duplicated review lists: OK (status.ts:284-293 prints header+message, no affectedArtifacts; overlap peers :382-394; OVERLAP_CONFLICT filtered :262-265). JSON keeps full review incl. overlapDetail (:522-536). Help lists overlapDetail (:127).
- Text blockers include check labels: OK (status.ts:271-275); JSON label/checkId :466-467.
- Bypass hints from resolved bindings: OK. `resolveCliBypassFlag` (guidance-presenter.ts:95-104) requires isSkippable===true and checkId; text `    bypass: ...` (status.ts:276-279); JSON `bypassFlag` (:461,469). Overlap suffix ` Use --skip-checks <id> to archive anyway.` only for intent==='archive' and skippable OVERLAP_CONFLICT (guidance-presenter.ts:136-144).
- intent/action -> command presenter: OK. INTENT_COMMANDS and switch (guidance-presenter.ts:18-64) match spec exactly; unknown kinds / missing changeName -> null + separate guidance (:73-81). JSON exposes command, guidance, intent, action (status.ts:472-483), blocker.action (:468). Text prints `guidance:` line only when command null (:311-313).
- Schema version warning: OK (status.ts:296-303, :459).
- Change not found: OK via handleError.
- Schema-derived fields: OK (status.ts:427-447; childrenOf; topologicalOrder; roots()). Convergent nodes rendered once via `visited` set (:618-630).
- Delegates refresh to GetStatus: OK (single `status.execute({name})`, status.ts:141).
- Implementation section: OK via `enrichImplementationTracking` (status.ts:214, 337-380) - not deep-audited (sdk spec, other batch).
- Basic info / specs and deps: OK (:223-259; no `specs:` line). JSON specDependsOn :484.
- Stable display status fallback: OK (:399, 408, 497, 508, 515).

### Discrepancies

- D-S1 (LOW) `--help` JSON schema is stale vs behaviour. status.ts:104-105 documents blockers without `bypassFlag`/`action` and nextAction as `{targetStep, actionType, reason, command}` without `intent`, `action`, `guidance`. Spec requires these additive fields in output (all present in code, status.ts:468-482). Either update help text (likely: spec "Structured output exposes intent and action additively" implies they are a documented surface) or spec need not require help documentation (spec only requires help docs for `optional` and `overlapDetail`, both present). Not a spec violation; documentation gap.
- D-S2 (LOW) Drafted text omits blocker `label`; drafted JSON passes raw `statusResult.blockers` (status.ts:198), which would carry `action`/`isSkippable`/`checkId` for drafts although spec limits `blocker.action` to non-draft results. Either tighten drafted projection (spec) or relax spec (code passes core blocker through).
- D-S3 (LOW) Spec "Plugin archive check follows its resolved skippability" and "Gate action" scenarios exist in tests only at presenter/status level; OK.

### Test Coverage (status.spec.ts, guidance-presenter.spec.ts)

Covered: help overlapDetail/artifactDag (68), drafted JSON/text (77,111), missing name, labels (327, 1175), DAG children (445), hasTasks/drift state (516), schema advisories (718-744), DAG from change schema (755), unknown change (775), overlap review text (789-955), task counts (1047), omit verifying (1120), nextAction verify (1147), omit duplicated review paths (1210, 1270), validity/fingerprint diagnostics (1440, 1535), pipeline order + disabled + [optional] (1612, 1657), bypass text/JSON/TOON incl. locked + hardened (1877-1917), gate action (1949), intent beats action (1963), guidance for unknown plugin in text/json/toon (1976), no leak on draft (1990).

### Missing Tests

- Overlap-reason suffix `Use --skip-checks spec.overlap to archive anyway.` at status level (only presenter spec :112 covers it).
- Text DAG convergent-node dedup (`design` once) - no test found (grep for convergent/appears-once: none).
- "Different workspace default is not drift" scenario (no explicit test).
- Drafted JSON when Core leaks `availableSteps`/`availableTransitions`: test 77 does leak transitions+steps, covered.
- Missing displayStatus in JSON (text covered at 249; JSON not).
- `--implementation` shared SDK projection parity scenario (reexport/hierarchy/ambiguity) - only generic render test 560.
- Plugin archive check `@security.code-scan` skippable true/false status scenario (not explicit).
- `[hasTasks]` fallback vs `[hasTasks - N/M done]` DAG tag (renders test 994 may cover; not confirmed).

### Summary counts

Requirements 21: OK 19, PARTIAL 2 (drafted blocker label/leak; help schema doc), MISSING 0. Discrepancies: 0 high, 0 medium, 3 low. Untested scenarios ~7.

---

## 2. cli:change-transition

### Requirements Summary

Signature + --skip-checks + legacy alias translation; next resolution via `to:'next'`; CLI-rendered hints; validity-aware guidance with presenter-projected bypass/next command; refresh policy; approval-gate routing; hooks; progress output (check bus, `change-transition` stream); hook observability; shared presenter; success output; post-hook failure; invalid transition error -> Repair Guide (label, code, from/to, details, action command, bypass); incomplete tasks; check progress rendering; unsatisfied requires.

### Implementation Status

- Signature/validation: OK (transition.ts:330-353, 236-252; error strings exact). Alias translation :396-401, passes `skipChecks: Array.from(...)` :428. Extra: invalid step name rejected with state list (:249-251) - beyond spec, harmless.
- Next resolution: OK (`to: 'next'`, :414-415, no local table).
- CLI-rendered hints: OK (transition.ts:138-143, 191-207; error-hints.ts `skippableCheckHint` generic, no `--allow-out-of-scope`).
- Validity-aware guidance: OK. Repair guide uses fresh GetStatus (:451-454), `projectCliNextAction` (:168-171, 473-476), `resolveCliBypassFlag` (:215-221, 478-483), validity lines :159-164. No retry/alternate transition.
- Refresh policy: OK (`refreshImplementationTracking:false` at :407 and :453).
- Approval gate routing: OK (no gate flags in execute input :423-429).
- Hook execution mapping: OK (:382-385, 427).
- Progress output / check bus / stream names: OK (makeProgressRenderer :264-321 -> createCheckProgressPresenter, streamName 'change-transition'; stdout for structured, stderr for text).
- Success output: OK (:433-448).
- Invalid transition error (Repair Guide): PARTIAL. Label+code (:174), from/to hop (:175-177), per-check details via describeCheckFailure (:178-180), bypass hint only when skippable (:191-198), no bypass otherwise (:199-208). Action rendering: command via presenter when mappable (:181-184) else `guidance:` line (:185-189) - see D-T1.
- Incomplete tasks error: OK (describeCheckFailure `workflow.taskCompletion` guidance-presenter.ts:189-203).
- Check progress rendering: OK (presenter; tests check-progress-presenter.spec.ts:39-59 for skipped markers). "Re-checking after hooks" heading not re-verified here.
- Unsatisfied requires: OK (workflow.requires details, guidance-presenter.ts:168-188).

### Discrepancies

- D-T1 (MEDIUM, SPEC vs SPEC) verify.md scenario "CheckPredicateFailedError renders Repair Guide with command and bypass" expects `displays command: pnpm audit:fix` for an action `{ kind:'@security.fix', guidance:'pnpm audit:fix' }`. This contradicts spec.md of cli:change-status (presenter MUST NOT place guidance prose in `command`; unknown kind -> `command: null` + separate `guidance`), cli:change-verification (same), and the transition spec.md own text ("command projected ... by the guidance presenter under the `command:` field" - null for unknown kinds). Code (transition.ts:185-189) and tests (transition.spec.ts:1633-1634, 1818-1819: expects `guidance: ...` and `not.toContain('command: ...')`) follow the presenter rule. Possibility A (code right): verify.md scenario is stale pre-change text; fix verify.md to expect `guidance: pnpm audit:fix`. Possibility B (spec right): code would need to print guidance under `command:`, which violates the change theme and the other three specs. Recommend A.
- D-T2 (LOW) In the CheckPredicateFailedError branch, `cpCommand = resolveCliWorkflowCommand(null, cpErr.action) ?? projectedNextAction?.command` (transition.ts:181): when the failed check's own action has only guidance (unmappable) but the status nextAction has a command, the CLI prints the next-action command under `command:` and hides the check's own guidance. Spec says the check's declared action projects under `command:`; fallback to nextAction is an unspecified addition. Either remove fallback (spec-literal) or document it (code).
- D-T3 (LOW) Non-CheckPredicate repair guide bypass line (transition.ts:215-221) computes `bypassFlag` but prints `skippableCheckHint(...)` ("Retry with ..."), so bypass is shown in hint form instead of the `bypass: --skip-checks <id>` form used by status. Spec text for transition accepts either ("project `--skip-checks <checkId>` bypass hints"). Acceptable.
- D-T4 (LOW) `--help` JSON schema (transition.ts:357-362) omits `hint`, `state`, `validity`, `verification`, and nextAction `intent/action/guidance` that the failure record carries (:494-503).

### Test Coverage (transition.spec.ts)

Covered: missing/mutually-exclusive args (46-83), --next -> 'next' (84, 110), allow flags (139-165), --skip-checks parsing/dedup (1504-1612), no approval flags (183), no pending rewrite (210-437), hook skip phases (983-1056), check bus progress and failed-hook ordering (480, 648, 708), success text/JSON (543, 562), repair guide for InvalidState/CheckPredicateFailed/mandatory/approval command/start-verification real change name (771, 1613-1790), HappyPath hint text+json (889, 1826), incomplete tasks (1094-1256), recommend verify (1303), recovery without restart flag (1460), unknown/non-skippable check ids (1681, 1708).

### Missing Tests

- Pre-transition `GetStatus` called with `refreshImplementationTracking:false` and repair-guide GetStatus likewise (assertion not found by name).
- `Re-checking after hooks` heading (only presenter-level; no transition-level test found).
- Structured failure record `nextAction.intent/action` exposure and `blockers[].bypassFlag` in the `change-transition` failure record.
- "Next flag from signed-off maps to archivable"/legacy parking states are covered (437); "enters closest enabled optional step" covered by 110.
- `--allow-out-of-scope` hint must not mention alias: covered in error-hints.spec.ts:112-124, not in transition render test.

### Summary counts

Requirements 17: OK 16, PARTIAL 1 (Repair Guide action rendering vs verify.md), MISSING 0. Discrepancies: 0 high, 1 medium (spec-internal), 3 low. Untested scenarios ~5.

---

## 3. cli:change-invalidate

### Requirements Summary

Signature; policy resolution via core; target syntax; policy-dependent target requirements; normalization/validation; approval guard naming gates and canonical recovery targets; change-level invalidation delegated; none semantics; reporting incl. reason field and presenter-projected `nextAction.command`; error handling; CLI-rendered hints (--force, --target) in text and `hint` in JSON/TOON.

### Implementation Status

- Signature: OK (invalidate.ts:34-77). Flag->input mapping: policyOverride via \_invalidation-flags, targets, force (:99-111).
- Effective policy via core: OK (`result.effectivePolicy`, describeEffectivePolicy :113).
- Target syntax/normalization/validation: OK by delegation to core (CLI only splits on `@` :101-107; no local validation). Core behaviour not audited in this batch.
- Approval guard: OK. On `InvalidateRequiresForceError` CLI prints each `recovery.gate` / `recovery.target` from error (:196-203); no hard-coded `designing`.
- Change-level / none semantics / reporting: OK. Text: reason, policy, override note, none message, projection, automatic return, blockers, next action (:128-194); JSON/TOON named `reason` (:204-205).
- nextAction presenter projection: OK (:119-127 `projectCliNextAction` + intent/action).
- Error handling / hints: OK. `handleError(err, fmt, {command:'change.invalidate'})` (:207); error-hints.ts maps INVALIDATE_REQUIRES_FORCE -> 'force.revoke-consent', INVALID_INVALIDATE_TARGET / INVALID_INPUT -> 'invalidate.target-flags'; handle-error.ts:65-71,219-236 renders hint on stderr and `hint` in JSON.
- Constraint "no artifact-drift manual cause": relies on core.

### Discrepancies

- D-I1 (LOW) Text next-action block prints `command: (none)` (invalidate.ts:191) but never prints `guidance` when the command is null, unlike status/verification (spec only requires command projection here; consistency gap). JSON carries `guidance` via projectCliNextAction spread (:121).
- D-I2 (LOW) Text blockers (:183-187) show no per-blocker remediation (command/guidance), unlike cli:change-verification; invalidate spec does not require it.
- D-I3 (LOW) `INVALID_INPUT` under `change.invalidate` always yields the `--target` hint (error-hints.ts rule), even for non-target INVALID_INPUT causes (spec says "policy-targeting validation errors"). Over-broad hint selection; code vs spec granularity.

### Test Coverage (change-invalidate.spec.ts)

Covered: minimal text (46), `reason` named in JSON/TOON (76), intent projection in json/toon/text (118), execute input mapping (160-201), grouped affected (234, 280), none messaging (340), approval-guard refusal (424), invalid targets for policy (453), policy override (515), JSON `--force` hint (563).

### Missing Tests

- `--target` hint in text and JSON for INVALID_INVALIDATE_TARGET / INVALID_INPUT (only --force hint tested).
- `--force` hint on stderr in text mode; refusal listing every gate + recovery target in text.
- Stale-evidence needs-no-force, none+redesign, and preserve-with-blockers output scenarios (core-driven; no CLI-level rendering test).
- Next action `guidance` rendering when command is null.

### Summary counts

Requirements 11: OK 11, PARTIAL 0, MISSING 0. Discrepancies: 0 high, 0 medium, 3 low. Untested scenarios ~4.

---

## 4. cli:change-verification

### Requirements Summary

start/complete/invalidate commands; delegation (thin adapter, no local next action for start/complete); idempotent output with persisted reason; presenter-projected command with real change name, guidance fallback, per-blocker remediation line; error handling incl. format validated before mutation; whitelisted safe projection; discoverability.

### Implementation Status

- Command group/signature: OK (verification.ts:91-146). `--reason` required (:130); trimmed-empty rejected (:137-139).
- Start/complete delegation: OK; thin (:99-122), start/complete results carry no nextAction (renderStart/Complete :170-229).
- InvalidateVerification delegation: OK (:140-143).
- Success/idempotent output: OK. Text headline invalidated vs already stale, evidence id, reason (core `result.reason`, persisted), signoff, return, fingerprint, blockers, next action (:244-275). JSON fields `invalidated`, `reason`, `verificationStatus`, `automaticReturn`, `blockers`, `nextAction` (:277-306).
- Presenter projection: OK. `projectNextAction` -> `projectCliNextAction`, adds `intent`, `action`, `guidance` (:318-332). Blocker remediation: command else guidance line under blocker (:254-266); JSON blocker `action`, `command`, `guidance` (:285-303). Missing changeName -> command null + guidance (guidance-presenter.ts:53-56). Never literal `<name>` (presenter only emits real name).
- Error handling: OK. Mismatch -> repair hint + `VERIFICATION_FINGERPRINT_MISMATCH` (:343-350), differences sanitized by `publicDifferences`. `parseFormat` called first in each action (:107, 121, 136) before resolveCliContext/execute, so invalid format fails pre-mutation.
- Safe projection: OK (whitelisted JSON; summarizeFingerprint).
- Discoverability: no CLI code surface (skills/status). Not audited here.

### Discrepancies

- D-V1 (LOW) JSON/TOON blocker objects add a top-level `command` (verification.ts:296) in addition to `action`/`guidance`. Spec only enumerates `nextAction.command`, `intent`, `action`, `guidance`; blocker `command` is an extra, undocumented field. Either document in spec (it mirrors text) or drop it.
- D-V2 (LOW) The CLI relies on Core to put `params.changeName` in action params; it does not inject the change name when absent (so a core omission yields guidance rather than a command). This matches spec ("when params.changeName is missing, command is null").
- D-V3 (LOW) Start/complete reconciliation blockers (readReconciliation :384-390) have no remediation/command projection; spec says only that they MAY be shown. OK.

### Test Coverage (verification.spec.ts)

Covered: start/complete single core call, no hash dump (70, 96); reason requirement/empty (136, 146); invalid format before mutation (169); structured projection/whitelisting json+toon (190, 262); presenter/real-name/guidance fallback/blocker remediation across formats (354, 414); stable error path (481, 507).

### Missing Tests

- Repeated invalidation reports original persisted reason (A vs B) - core scenario; CLI test for text/JSON/TOON parity not found by name.
- "Commands work in any lifecycle state" (CLI-level no state gating) - no test.
- Complete refuses mismatched attempt: CLI mismatch guidance text + exit code (code present :343-350; named test not seen).
- Delegated compliance does not own attempt: skills/templates, outside CLI tests.

### Summary counts

Requirements 7: OK 7, PARTIAL 0, MISSING 0. Discrepancies: 0 high, 0 medium, 3 low. Untested scenarios ~4.

---

## 5. cli:change-archive

### Requirements Summary

Signature incl. repeatable `--skip-checks`, aliases `--allow-overlap`/`--allow-out-of-scope`; prerequisites delegated; behaviour; hooks; check progress; post-archive hooks exit 2; text/JSON success output incl. invalidatedChanges; error cases (unknown/non-skippable/hook check id, overlap message with bypass sentence only if skippable, CheckPredicateFailedError rendering with details + presenter-projected action + bypass line); impl.linksInScope generic hint; canonical naming.

### Implementation Status

- Signature: OK. Repeatable accumulator (archive.ts:63-68), comma split + trim + empty ignore + dedupe via Set (:99-114), aliases (:109-114), `skipChecks` passed only when non-empty and is the only bypass field (:122-128). CLI does not validate skippability.
- Prerequisites: OK (delegated, no local state gate).
- Hooks: OK (`skipHookPhases` :122-125).
- Check progress: OK (`createCheckProgressPresenter` streamName 'change-archive' :35-47).
- Post-archive hooks exit 2: OK (:130-133).
- Success output text/JSON: OK (:135-160); JSON NDJSON terminal record with invalidatedChanges (:151-163).
- Error cases: OK/PARTIAL. Overlap special-case text with `Use --skip-checks spec.overlap to proceed despite overlap.` only when `err.skippable === true` (:171-190). Other checks: label, id, from/to hop, detail lines, command-or-guidance from action via presenter, `bypass:`/`hint:` line (:191-231). Structured mode: falls through to handleError with metadata+hints (:234).
- impl.linksInScope generic hint: OK (`resolveCliErrorHint ?? skippableCheckHint`, :208-221).
- Canonical naming: OK (alias registered via parent; test archive.spec.ts:53).

### Discrepancies

- D-A1 (LOW) The overlap bypass sentence is a hard-coded literal in archive.ts:180 rather than going through the centralized presenter/hints (error-hints.ts has no overlap rule). Spec for archive does not mandate the presenter here, but status spec does for the analogous string. Either centralize (theme-consistent) or leave.
- D-A2 (LOW) Spec "Error cases" lists structured JSON error record for CheckPredicateFailedError; guidance/command projection for the check action is only text-mode (:168-231); JSON error record (handleError) carries `metadata` incl. raw `action` but no projected `command`/`guidance`. Spec says only "emits structured error record with the check's failure code" - satisfied. Noted for host-neutral consistency.
- D-A3 (LOW, style) archive.ts:10 import line exceeds prettier width (single-line multi-name import) - will fail `prettier --check`/lint if enforced. Same in approve.ts description strings (multi-line that prettier would collapse). Not a spec matter.
- D-A4 (LOW) Verify scenarios "Dependency mismatch lists every mismatching spec" and "Read-only workspace failure lists affected specs" are implemented in describeCheckFailure (guidance-presenter.ts:205-235) and the deps hint (error-hints.ts 'checks.deps-consistent'), but no archive.spec test uses these checkIds (see Missing Tests).

### Test Coverage (archive.spec.ts)

Covered: alias both verbs (53), success/hook failure/JSON/stream (80-190), invalidated changes text+JSON (190-237), not found/missing arg/archiving retry/not archivable (238-297), all skip-hook phases (298-399), skip-checks parsing: alias translation, comma, repeat, trim, blank, dedupe, case-sensitive, singular alias, combine, no value, help (445-535), unknown/hook/non-skippable (536-578), structured error (579), overlap bypass sentence skippable/non-skippable (604-651), structured overlap (652), stale verification command from action (687), plugin skippable/non-skippable text + json (707-745), impl.linksInScope hint text+json (746), invalid state with skip flags (784), peers invalidated (799), progress bus + hook.pre streaming (827, 885).

### Missing Tests

- deps.consistent with three mismatches listing + re-run hint (archive.spec has none).
- workspace.readOnly affected specs listing and no bypass (only CheckNotSkippable case at 582).
- Alias non-skippable `--allow-out-of-scope` -> CheckNotSkippableError at CLI level (566 mentions "also through an alias"; confirm).
- `guidance:` line for an unknown-kind action in archive Repair output (presenter tested, archive-level not).

### Summary counts

Requirements 12: OK 12, PARTIAL 0, MISSING 0. Discrepancies: 0 high, 0 medium, 4 low. Untested scenarios ~3.

---

## 6. cli:change-approve

### Requirements Summary

Signatures; delegates gate state to kernel (`{name, reason}` only; `kernel.changes.*`); no local fingerprinting; approve spec/signoff valid in bound-from states incl. legacy parking states, no transition printed, help uses bound-from language; success output (gate, status valid, approver, time, fingerprint scope; signoff empty vs legacy-unknown); recovery/blocker rendering on failure with state/blockers/next action; error cases.

### Implementation Status

- Signatures: OK (approve.ts:30-37, 73-80; `requiredOption('--reason')`; unknown sub-verb rejected by commander).
- Delegates to kernel: OK (execute({name, reason}) :45-48, 108-111; `kernel.changes.approveSpec/approveSignoff`).
- No local fingerprints: OK (summarizeFingerprint is display only).
- Approve spec/signoff behaviour: PARTIAL. No transition printed; but success output (approve.ts:51-57, 113-119) never prints the resulting/unchanged state, so the verify.md scenario "Approving from a legacy parking state prints no transition ... output reports the recorded approval and the unchanged state `pending-spec-approval`" is not met: only `approved spec for <name>` + evidence lines (no state line). Help text says "(or a legacy parking state)" (:26-30, 76-80) - bound-from language is loose ("binding from state" not named) but `ready`/`done` examples present.
- Success output: OK (readGateProjection :245-290; signoff verification id or `legacy unknown` / `(none)`; fingerprint summary; no hashes).
- Failure recovery rendering: PARTIAL/OK. enrichApprovalFailure (:131-190) reloads status, attaches state/blockers/projected nextAction (command, guidance, intent, action) to the error for JSON, and prints state/blockers/next action in text. In text, only `next action: <command or (none)>` + reason is printed (:181-184); guidance for null-command actions is not printed in text (only in JSON via spread of projectCliNextAction). Blockers' remediation (action) not rendered in text.
- Error cases: OK.

### Discrepancies

- D-P1 (MEDIUM) Legacy-state success output does not report the unchanged state. Spec verify.md scenario (cli:change-approve "Approving from a legacy parking state prints no transition") requires reporting the unchanged state; code omits state entirely and the test (approve.spec.ts:110-138) mocks `approveSpec.execute` returning `state: 'spec-approved'` (which contradicts the "stays in current state" rule) and asserts only absence of "moved to pending". Possibility A (spec right): add a `state:` line to success output (text and JSON) from `change.state`, and fix the test mock to keep `pending-spec-approval`. Possibility B (code right): spec scenario overstated; relax to "does not print a transition". Core `ApproveSpec` behaviour on legacy states is outside this batch.
- D-P2 (LOW) Text failure output (approve.ts:181-184) prints `command: (none)` style for null-command actions and omits the action guidance; JSON includes it. Inconsistent with status/verification text which print a guidance line. Spec for approve requires only "next action" be rendered.
- D-P3 (LOW) `--help` JSON schemas (approve.ts:41-45, 88-92) say `{ result, gate, name }` but JSON also contains `approval` evidence block (:63) - stale documentation.
- D-P4 (LOW) Approval-failure text uses ad hoc labels (`state:`, `blocker:`, `next action:`) not the status/repair-guide format; spec does not prescribe format.

### Test Coverage (approve.spec.ts)

Covered: success spec/signoff text+JSON (51, 140, 305, 394), from ready/done (77, 331), drain/legacy (110, 364), host-neutral nextAction in structured failure incl. unknown plugin action guidance (165), missing reason (206), not found (216), wrong state (230), reload canonical state on failure (244), unknown sub-verb (279), empty vs legacy-unknown signoff evidence (419, 472), no hashes in spec approval (512).

### Missing Tests

- Legacy parking state success asserting the unchanged state is reported (see D-P1).
- Delegation call shape `{name, reason}` exactly and `kernel.specs.*` not invoked (no explicit assertion by name; may be inside success tests).
- Text-mode failure rendering of guidance for null-command action.
- Help text bound-from language.

### Summary counts

Requirements 8: OK 6, PARTIAL 2 (legacy state reporting; failure text guidance), MISSING 0. Discrepancies: 0 high, 1 medium, 3 low. Untested scenarios ~4.

---

## Batch totals

- Specs: 6. Requirements audited: 76. OK 71, PARTIAL 5, MISSING 0.
- Discrepancies: 0 high, 2 medium (D-T1 spec-vs-spec guidance-in-command contradiction in cli:change-transition verify.md; D-P1 legacy approve state not reported), 19 low.
- Untested scenarios: ~27 (largest gaps: status convergent DAG dedup and overlap-suffix at status level; archive deps.consistent/workspace.readOnly listing; invalidate --target hint; approve legacy unchanged state; transition refresh:false assertions and Re-checking heading).
- Cross-spec contradictions to resolve: verify.md of cli:change-transition (`command: pnpm audit:fix`) vs presenter rule in cli:change-status/cli:change-verification/cli:change-transition spec.md; archive Error-cases bullet says CheckPredicateFailedError reports "check-declared action projected through the CLI guidance presenter" which for unknown kinds yields `guidance:` not `command:` (consistent with code).
- No dependency/global spec contradiction found with core:get-status / core:transition-checks beyond the items above (core source verified free of CLI strings).

---

# Batch F audit: decouple-core-cli-workflow-guidance

Specs: default:\_global/error-handling-conventions, skills:skill-templates-source (+ project-wide specs check)

## 1. default:\_global/error-handling-conventions

### Requirements Summary

1. Specd Error Contract (Error, specd=true, code, message)
2. core Mandate (extend SpecdError)
3. Monorepo Package Mandate
4. Error Code Naming (UPPER_SNAKE_CASE)
5. Actionable Messaging
6. Host-Neutral Core Errors and Delivery Hints (CHANGED): no flags/`specd ...`/slash commands/use-case input names-as-bypass in core `message`; structured metadata; every code that relied on embedded recovery has a CLI hint
7. Host-Neutral Core Projections (CHANGED): NextAction/Blocker/CheckResult/validity have no delivery syntax; use intent/action/isSkippable/checkId; unknown kind falls back to `guidance`
8. Metadata Extraction, 9. JSDoc Documentation (unchanged; not the focus)

### Implementation Status

- Req 6: PARTIAL
  - OK: no `specd <group>`, `--force/--skip-checks/--next/--target/--allow-*`, `/specd-*`, `allowOutOfScope` literals anywhere in `packages/core/src` (grep over code and comments returned zero hits).
  - OK: `packages/core/src/application/errors/verification-stale-error.ts:23` message is host-neutral; CLI hint `VERIFICATION_STALE` -> `verification.renew` at `packages/cli/src/error-hints.ts:156-158`; test `packages/cli/test/error-hints.spec.ts:127-134`.
  - OK: hints for force/next/target/invalidate/deps rules at `error-hints.ts:107-169`, tests in `error-hints.spec.ts` and `handle-error.spec.ts`.
  - PARTIAL: `packages/core/src/domain/errors/depends-on-overwrite-error.ts:59` says "Pass force to overwrite curated dependencies." and `packages/core/src/application/errors/invalidate-requires-force-error.ts:31` says "Pass force to revoke the reported gate(s)". `force` is a use-case input name given as a bypass instruction (the spec's own example is `allowOutOfScope`). No `--` prefix, so it escapes every grep/test.
  - PARTIAL: `packages/core/src/domain/errors/spec-not-initialized-error.ts:10` message: `run "specs init" first` is CLI command syntax minus the `specd` prefix.
  - OK: metadata getters exposed (`existingDeps`, `incomingDeps`, `gates`, `state`, `specId`, `changeName`; tests `packages/core/test/domain/errors/host-neutral-errors.spec.ts:9-55`).
- Req 7: OK
  - `CheckAction` (`packages/core/src/domain/services/transition-checks.ts:88-97`) = kind/params/guidance, doc says guidance MUST NOT contain CLI syntax. `LifecycleActionIntent` used in `lifecycle-guidance.ts` (static test asserts no `/specd-`/`specd change(s)`).
  - CLI presenter `packages/cli/src/guidance-presenter.ts`: `INTENT_COMMANDS` (l.19), `resolveCliWorkflowCommand` (l.43-64), `resolveCliBypassFlag` (l.100+), `projectCliNextAction`; unknown kind -> command `null` + `guidance` field (l.67-81, 134-150).
  - MCP: `packages/mcp/src` has no nextAction mapping (spec only says MAY) - not a gap.
- Reqs 1-5, 8, 9: not touched by delta; not re-audited deeply. The deleted `archive-dependency-mismatch-error.ts` and `spec-overlap-error.ts` (git diff) removal is consistent with the contract (no dangling index export seen).

### Discrepancies

1. MEDIUM - `Pass force ...` in two core messages (files above). Either (a) code is wrong: reword to host-neutral text ("Overwrite requires explicit confirmation") and add CLI hints (hints already exist: `force.overwrite-deps`, `force.revoke-consent`); or (b) spec is too vague: spec lists `allowOutOfScope` as the example so "force" counts; if `force` is intended to be acceptable, spec should say bare input names that equal a generic concept are allowed. Code-side fix is the more consistent one.
2. LOW - `spec-not-initialized-error.ts:10` `run "specs init" first`. Same (a)/(b); CLI hint equivalent not verified to exist.
3. LOW - Enforcement tests too narrow: `host-neutral-projections.spec.ts:90-115` regex covers only `/specd-x`, `--skip-checks`, `--skip-hooks`, `--allow-`, `specd changes `, `specd specs `; it misses `--force`, `--next`, `--target`, `--set/--add/--remove/--clear`, `specd change ` (singular), `specd project/graph`, and input names (`force`, `allowOutOfScope`). That is why discrepancy 1 is undetected. Spec lists these tokens explicitly, so the test under-asserts the spec.
4. INFO - `reconciled-operation-blocked-error.ts:49` message embeds an intent/action token ("Follow the 'design' next action") - host-neutral, OK.

### Test Coverage

- Core message/flag absence: `host-neutral-errors.spec.ts` (5 errors), `validate-skip-checks.spec.ts:58`, `archive-change.spec.ts:4735-4751`, `get-status.spec.ts:1432,1802-1833`, `regenerate-spec-metadata.spec.ts:56`, `lifecycle-guidance.spec.ts:60-67`, `host-neutral-projections.spec.ts:59-115`.
- CLI hints: `error-hints.spec.ts` (incl. VERIFICATION_STALE), `handle-error.spec.ts`.
- Presenter: `guidance-presenter.spec.ts` (intent mapping, unknown kind -> null, guidance fallback, bypass flag, overlap suffix) covers "Unknown action kind falls back to guidance" and "Host translates structured guidance".
- Scenario map: Core error message omits flags - covered (narrow); Error with recovery has CLI hint - covered; CLI translates with command context - covered (`error-hints.spec.ts` command-scoped rules); Core projections omit syntax - covered; Host translates - covered (CLI only; MCP mapping untested, optional); Unknown kind - covered.

### Missing Tests

- No test that every core error code whose message used to embed recovery has a CLI hint (only VERIFICATION_STALE explicit). Requirement 6 sentence "Every core error code ... MUST have a matching CLI hint" is not enforced generically.
- No assertion that `Pass force`/input-name bypass text is absent from messages.
- No test for `SPEC_NOT_INITIALIZED` hint.

### Summary counts (changed reqs 6,7 + 5 scenarios audited)

OK 1 (Req 7), PARTIAL 1 (Req 6), MISSING 0; discrepancies: 1 medium, 2 low, 1 info; untested aspects: 3.

## 2. skills:skill-templates-source

### Requirements Summary

Change delta modifies only "In-place approval gates in workflow templates" (legacy parking states are drain entry states after consent; specd-new routing follows nextAction; specd-implement accepts pending-spec-approval) plus scenarios "New-skill routing table treats pending as drain only" (modified) and "Implement skill accepts pending-spec-approval after consent" (added). Other requirements unchanged (e.g., archive bypass, overlap).

### Implementation Status

- shared.md.tpl stay-in-ready/done, human `approve`, pending drain-only: OK (`packages/skills/templates/shared/shared.md.tpl` ~l.480-484; added "Approving in a drain state records consent without moving the change").
- specd-implement: OK. `SKILL.md.tpl` ~l.77-95: accepts `ready`, `pending-spec-approval`, `spec-approved`, `implementing`; without consent "stay in place", tell human `approve spec`, do not transition; with consent/gate off transitions.
  - Minor: wording "If in `ready`, `pending-spec-approval`, or `spec-approved` with spec gate off (or spec already approved)" - consistent with spec. `implementing` listed first-state check only; fine.
- specd-new routing rows: OK. `SKILL.md.tpl` ~l.150-155: `pending-signoff` / `pending-spec-approval` drain-only, approve command while consent is missing, otherwise follow `nextAction`. Spec also says "hop skill that nextAction names once consent recorded" - template says "follow `nextAction`": equivalent.
- specd-archive: OK. Archive template teaches `--skip-checks <checkId>` bypass, aliases, `bypass:` flag shown by status (`status.ts:278` renders `bypass:`), never-bypassable list (l.225-230); `SpecOverlapError` -> `OVERLAP_CONFLICT` rename (l.211) aligns with host-neutral codes.
- specd-design/verify/entry: OK, no pending-signoff / pending-spec-approval mentions (grep).
- Other requirements (metadata, frontmatter, graph terminology etc.): not touched by this change; spot-check unaffected.

### Discrepancies

1. LOW - Spec "Archive skill does not suggest bypassing a blocker without a flag" and unchanged text rely on `specd changes status` printing `bypass:`; status uses presenter `resolveCliBypassFlag` (`guidance-presenter.ts:100`), so consistent. No conflict.
2. LOW - Project spec architecture/other project-wide specs (9 listed via `project context`: architecture, conventions, error-handling-conventions, testing, docs, etc.): no contradiction found with the change; error-handling-conventions is itself changed and consistent except discrepancy 1 above.
3. INFO - specd-new row does not name "the hop skill" literally (spec wording); behaviorally same as following nextAction. Either tighten template or relax spec wording.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts`:

- l.126-141: verify stays in `done`, no pending-signoff; implement contains `stay in place`, `pending-spec-approval`, `spec-approved`, `Do **not** \`transition implementing\``; shared `**stays**` and "Approving in a\ndrain state records consent without moving the change."
- l.161-163: archive `archiving`, no pending-signoff; l.223-259 overlap/bypass scenarios.
- Archive bypass scenarios covered at l.231-259.

### Missing Tests

- "New-skill routing table treats pending as drain only": no assertion found for the new row text ("while consent is missing; otherwise follow `nextAction`"); grep of the test file for the specd-new rows did not show a check (verify manually; possible gap).
- "Implement skill accepts pending-spec-approval after consent": test only checks substring presence (`pending-spec-approval`, `stay in place`), not that consent-recorded path transitions to `implementing` or that there is no-transition-without-consent branching; spec's own rule says phrase-only assertions are weak for contract tests.

### Summary counts (changed items: 1 requirement, 2 scenarios)

OK 3, PARTIAL 0, MISSING 0; discrepancies: 0 medium, 2 low, 1 info; test gaps: 2.

## Project-wide specs

No contradictions with the change's specs found. Note warnings: project-level and several global specs (architecture, conventions, error-handling-conventions, testing) have stale LLM-optimization; the `error-handling-conventions` optimized summary will be out of date after this change.
