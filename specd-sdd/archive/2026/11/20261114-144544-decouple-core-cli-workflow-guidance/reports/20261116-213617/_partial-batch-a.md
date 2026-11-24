# Batch A audit (round 2): lifecycle-engine, workflow-topology, workflow-model, get-status, change

Scope: merged specs (spec-preview) vs packages/core/src, packages/cli/src, tests. Read-only; no code/spec changes.

## Round-1 fix verification

- Core free of CLI/slash strings and `bypassFlag`: PASS. Greps over packages/core/src for `bypassFlag`, `specd <cmd>`, `--flag` literals, `/specd` found only: VCS adapter args (git/svn/hg), a doc-comment mention of "CLI flags" (use-cases/archive-change.ts:90), `validateSkipChecks` import name (application/services/validate-skip-checks.ts, takes check ids). CLI-layer `bypassFlag` lives only in packages/cli/src/commands/change/status.ts:42 (presentation, correct side of the boundary).
- Stale wording from round 1 (LifecycleEngine class, command/bypassFlag on blockers/nextHop, `details.command`): fixed in specs and code. lifecycle-verdict.ts has no command/bypassFlag/warnings; `skippedCheckIds` is the option (lifecycle-verdict.ts:66,179); flag syntax is not interpreted (test lifecycle-verdict.spec.ts "omits skippable OVERLAP_CONFLICT when the canonical spec.overlap id is supplied and ignores flag syntax").
- lifecycle-guidance.ts contains none of the forbidden tokens (grep for approval.spec/approval.signoff/verification.current/boundFromStates/activeSpecApproval/activeSignoff/validity.specApproval/validity.signoff/pending-\*/reason: zero hits); a test enforces it ("contains no hardcoded check ids, boundFromStates, or CLI/slash strings in lifecycle-guidance.ts").
- Topology: all 8 named exports present, internals (`buildActivePipeline`, `forwardTargets`) unexported; drain handling, VALID_TRANSITIONS exits (pending-spec-approval -> implementing,designing; pending-signoff -> archivable,designing,done; forward exit first) match spec and are tested (change-state-audit.spec.ts, workflow-topology.spec.ts).
- `isAtOrAfterVerificationBoundary` single derivation: used by reconcile-change-validity.ts:293, invalidate-verification.ts:147, lifecycle-guidance.ts:95.
- `gatherPredicateSnapshots`: absent from src; test asserts (transition-checks.spec.ts:391). ValidateArtifacts/GetArtifactInstruction call verdict with `checksByTarget: {}` (validate-artifacts.ts:263, get-artifact-instruction.ts:101) with spy tests.
- Draft GetStatus does not call evaluateLifecycle (get-status.ts:866 uses projectArtifacts); intent null, no action (get-status.ts:937-941), tested.
- SCHEMA_IDENTITY_MISMATCH details `requestedName/returnedName` (get-status.ts:402-406) match spec.
- Approval-anchor enforcement at resolve/validate time (resolve-schema.ts:124, validate-schema.ts:83) matches workflow-model spec.

## Discrepancies / findings

Severity: HIGH = behavior contradicts spec in a reachable way; MEDIUM = real mismatch, narrow impact; LOW = wording/edge/cosmetic.

No HIGH findings.

### M1 (MEDIUM, spec wrong or ambiguous vs code) Guidance reads `validity.verification`

- Spec core:lifecycle-engine, "Application lifecycle guidance": "Gate, stale-consent, and verification remediation come exclusively from check-declared CheckActions (and from review / recovery signals for 'design')".
- Code packages/core/src/application/services/lifecycle-guidance.ts:91-101 returns `'verify'` directly from `validity.verification` (stale/absent/attempt-active) at/after the verification boundary, and :103-109 reads `validity.artifactReviewRequired` / `validity.recovery`. The forbidden-token list in the spec (specSpecApproval/signoff) is respected, so tests pass, but the "exclusively" sentence is not literally true. Observable effect: at `archivable` with stale verification the code returns `verify` where the table (OWN_PHASE) would give `archive`.
- Recommended fix: amend spec sentence to say verification phase routing MAY use the reconciled `validity.verification` for the phase intent (remediation action still comes from the check), and add a scenario for archivable+stale verification. (Alternative, code wrong: drop the validity branch; behavior-changing.)

### M2 (MEDIUM, spec wrong) get-status "checkId only when skippable" contradicts code and lifecycle-engine

- Spec core:get-status, "Identifies blockers": "A blocker projected from a failed predicate SHALL carry `isSkippable` and `checkId` only when the resolved binding ... is skippable".
- Code get-status.ts:1030-1036 and lifecycle-verdict.ts:837 always set `checkId` (and `isSkippable`, possibly false) for failed-check blockers; lifecycle-engine spec says `checkId` is set whenever projected from a predicate. Scenarios (isSkippable: false for hardened overlap) are consistent with the code. Fix the get-status sentence: "carry `isSkippable` true only when the resolved binding is skippable; `checkId` is always carried for predicate blockers".

### L1 (LOW, code vs spec edge) Legacy `pending-*` state with exit disabled yields `intent: null`

- Spec: "A blocked change in a legacy pending-\* state whose hop declares no action MUST still resolve the phase intent of its pipeline position, never null".
- lifecycle-guidance.ts:185-188: `exit === null ? null : ...`. For `pending-spec-approval`/`spec-approved` with `implementing` disabled, `nextWorkflowStep` is null so intent is null. Reachable only for in-flight legacy manifests under such a schema. Fix in code (fall back to the anchor phase via `drainAnchorOf`) or narrow the spec ("when an exit exists"). No test covers this combination.

### L2 (LOW, spec gap) `ready` blocked with no check action returns `intent: null`

- lifecycle-guidance.ts:181-190: state `ready`, hop stays in place, not a drain state -> `null`. Spec only defines the approve-spec case (null with action). Hosts get neither intent nor action when `ready` is blocked by another check without an action (e.g. a custom check). Spec should state the expected intent (probably `implement`/`design`), or document null.

### L3 (LOW, spec wording) "message does not depend on the target name"

- Scenario "Illegal target reports a generic invalid transition": the message is `Transition from '<from>' to '<to>' is not permitted` (lifecycle-verdict.ts:~870 `requestedTargetBlockers`), so it does depend on the target name textually. The test compares messages after substituting the name. Spec intent is "no per-target special messages"; reword to "same template for every illegal target".

### L4 (LOW, spec vs structure) findBlockingParent location

- Spec says plain functions in `domain/services/lifecycle-verdict.ts`; `findBlockingParent` lives in find-blocking-parent.ts and is re-exported (lifecycle-verdict.ts:18, lifecycle-engine.ts barrel). Harmless; adjust wording to "exported via".

### L5 (LOW, doc) lifecycle-engine.ts barrel comment says "Compatibility barrel"

- Spec forbids compatibility aliases for the class; the barrel only re-exports functions/types, so compliant. Comment wording could confuse (lifecycle-engine.ts:1).

## Remaining untested (or weakly tested) scenarios

- core:lifecycle-engine
  - "No LifecycleEngine class": no test asserts absence of `LifecycleEngineOptions`/class (only code grep). LOW.
  - "Detailed affected artifacts for drift": no verdict-level test asserting `affectedArtifacts` exactly the drifted file + spec ID (lifecycle-verdict.spec.ts only asserts zero ARTIFACT_DRIFT for complete-with-drift; get-status.spec.ts:1056 asserts presence only). MEDIUM-LOW.
  - "Recursive block through dependency chain": effective status asserted, "blockers identify Spec A as the cause" not asserted. LOW.
  - "CompileContext is not an evaluate consumer": compile-context.spec.ts asserts result omits availability fields (1499) but no spy that `evaluateLifecycleVerdict` is not called. LOW.
  - "TransitionChange does not re-walk requires after green evaluate": CheckPredicateFailedError tests exist; no assertion of no second effective-status walk. LOW.
  - "Historical overlap intent comes from guidance": covered only indirectly via get-status ("given invalidation overlap"). LOW.
- core:workflow-topology
  - All scenarios have a matching test. "Disabled verifying never requires verification evidence end to end" is covered in two pieces (get-status.spec.ts:1665 real reconciler; archive-change.spec.ts:366) rather than one implementing->done->archivable->archive flow. LOW.
- core:workflow-model
  - "Active approval anchors cannot be disabled ... including schema validate": resolve-schema.spec.ts:1670 covers resolve; validate-schema.spec.ts has no approvals/anchor test although validate-schema.ts:83 implements it. MEDIUM-LOW.
  - Remaining scenarios are pre-existing behavior; spot-checked, no gaps found beyond the above.
- core:get-status
  - "Result includes tracked files and links" (implementation tracking projection): no assertion in get-status\*.spec.ts for `implementationTracking`. LOW.
  - "Draft status may retain read-only timestamp shortcut": no test. LOW.
  - "Composition resolves one reconciliation path" / "Draft composition remains read only": only partially via composition/use-cases/get-status.spec.ts and workflow-check-registry.spec.ts. LOW.
- core:change
  - Delta sections (Lifecycle, Artifacts, History, Interpretation authority) match code: VALID_TRANSITIONS table (change-state.ts:32-45), RECOVERY_ONLY_TRANSITIONS signoff `archiving -> done`, pending-parent-artifact-review sanitization (change-repository.spec.ts:676). No CLI strings in domain/entities/change.ts. No gaps found in the delta scope.

## Counts

- Requirements/scenarios audited: lifecycle-engine (10 req, ~85 scenarios), workflow-topology (6 req, 40 scenarios), workflow-model (14 req, ~75 scenarios, delta-relevant ones in depth), get-status (17 req, ~80 scenarios), change (delta sections + VALID_TRANSITIONS).
- Findings: 0 HIGH, 2 MEDIUM (M1 spec/code, M2 spec wrong), 5 LOW (L1-L5).
- Untested scenarios still open: 15 (all LOW/MEDIUM-LOW; none MEDIUM+).
- Core clean of CLI/slash strings and bypassFlag: yes.
