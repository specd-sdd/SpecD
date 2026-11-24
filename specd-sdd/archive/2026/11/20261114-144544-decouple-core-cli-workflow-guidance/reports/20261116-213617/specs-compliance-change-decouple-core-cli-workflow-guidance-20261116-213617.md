# Specs compliance — change decouple-core-cli-workflow-guidance (round 2)

Mode: delegated (attempt verification-attempt-4). Static audit after remediation of round 1.

| Batch | Specs                                                                                                  | Round-1 fixes | New/remaining           |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------- | ----------------------- |
| A     | lifecycle-engine, workflow-topology, workflow-model, get-status, change                                | hold          | 0 high, 2 medium, 5 low |
| B     | transition-checks, transition-change, invalidate-change, approve-spec, approve-signoff, archive-change | 4/4 hold      | 0 high, 4 medium, 8 low |
| C     | 6 cli:change-\* specs, error-handling-conventions, skill-templates-source                              | hold          | 0 high, 3 medium, 9 low |

# Detailed findings

---

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

---

# Compliance audit round 2 - batch B

Change: decouple-core-cli-workflow-guidance
Specs: core:transition-checks, core:transition-change, core:invalidate-change, core:approve-spec, core:approve-signoff, core:archive-change
Method: merged spec-preview read in full for each spec, then code (packages/core/src, packages/cli/src) and tests (packages/core/test) read per requirement.

## Round 1 fixes: verification

All remediated items hold.

- workspace.readOnly message: `packages/core/src/domain/checks/workspace-read-only.ts:46-57` emits `Change "<name>" contains specs from readOnly workspaces:\n\n  - <id>  ->  workspace "<ws>" (readOnly)\n\nWriting deltas into protected specs is not allowed.` and `details.specs` / `details.specIds`. This matches the merged spec text exactly. The application check passes `changeName` (`application/checks/workspace-read-only.ts`). Tests: `test/domain/services/transition-checks.spec.ts:345` and `test/application/use-cases/archive-change-audit.spec.ts:295`.
- Merge-time deps.consistent: `archive-change.ts` `_assertArchiveDepsConsistent` (about line 1300-1325) now calls `throwArchivePredicateFailure(depsCheck, change, bindings)`. That helper (about line 1503) sets `skippable` from the resolved binding and `from: change.state` / `to: 'archiving'`. The spec text matches. Test: `archive-change-audit.spec.ts:195`.
- Rewritten invalidate scenario (approve-signoff wins, intent null): `lifecycle-guidance.ts` `resolveLifecycleIntent` takes the first failing predicate that has an action, in binding order. `approval.signoff` precedes `verification.current` in `TRANSITION_BINDING_SPECS`, so the result is `{action: approve-signoff, intent: null}`. A `verification.current` action only gets the phase intent because of `supersedesIntent:false`. Test: `invalidate-change-next-action.spec.ts:135`. Code and spec agree.
- Core source is free of CLI strings (no `specd <cmd>`, `--force`, `--next`, `/specd-*` outside comments). The CLI renders `bypassFlag` only at the presentation boundary (`guidance-presenter.ts`, `change/status.ts`, `change/transition.ts`).

## Remaining discrepancies

Legend: CODE = the code looks wrong against the spec. SPEC = the spec text is wrong or stale against sound code.

### MEDIUM

M1 [CODE or SPEC, archive-change] Post-hook validity block throws a generic error that preempts the check error.

- `packages/core/src/application/use-cases/archive-change.ts:483` (`postHookValidityBlocksArchive`, defined at about line 1458) throws `InvalidStateTransitionError(change.state,'archiving')` when, after pre-archive hooks, `verification` is stale/absent/active, or spec approval/sign-off or artifact review is unresolved and no automatic return was committed.
- This runs BEFORE the predicate rerun (line 486+). The rerun would have produced `CheckPredicateFailedError` for `verification.current` with the `start-verification` action.
- The spec (Typed errors; "Archive SHALL fail when..."; Canonical validity archive preflight) says every archive-bound predicate failure, including `verification.current`, is `CheckPredicateFailedError` carrying the action, and that committed recovery MUST NOT collapse into a generic invalid-state error.
- Effect: a verification that went stale because a hook changed inputs loses its structured remediation. The existing test `archive-change.spec.ts:3955` ("does not transition to archiving when post-hook verification blocks") encodes the generic behavior.
- Fix (code): run the predicate rerun first and keep `postHookValidityBlocksArchive` only for the non-predicate residue, or map it to `CheckPredicateFailedError` for `verification.current`. Alternatively relax the spec to allow the generic error for post-hook residue.

M2 [CODE vs SPEC conflict, transition-change] "Transition to designing from any state" requires that explicit redesign revokes required spec consent and applies sign-off recovery through the reconciler (scenario "Explicit redesign applies focused policy").

- `transition-change.ts` just calls `freshChange.transition(...)`; no revocation or recovery is requested.
- The existing test `transition-change.spec.ts:2527` ("preserves approvals when lifecycle movement alone returns to designing") asserts the opposite: consent is preserved.
- The spec's own "Skill-aligned backward hop" paragraph says lifecycle movement alone does not invalidate spec approval unless the fingerprint or explicit consent is affected.
- The spec contradicts itself and the code follows the preserve reading. Decide which is intended and fix the spec paragraph (likely SPEC).
- Possibly pre-existing, not part of this change's delta.

M3 [CODE, transition-change] `transition-change.ts:420` calls `freshChange.invalidateSignoff(actor)` directly inside the `mutate` callback for hops from `done`/`signed-off`/`archivable` to `implementing`/`verifying`.

- The spec says all projection updates for backward hops are applied by the central reconciler, and that the reconciler is the sole owner ("Single validity reconciliation owner").
- `done` is also in `SKILL_HOP_SOURCES`, while the spec says "post-signoff phase".
- Test `transition-change.spec.ts:2902` codifies the direct call.
- Either move it into a reconciler intent or amend the spec to allow this single aggregate-level call.

M4 [CODE or SPEC, invalidate-change] The approval guard (`consentToRevoke`, `invalidate-change.ts`) reads persisted projections (`change.specApproval?.status === 'valid'`, `change.signoff?.status === 'valid'`).

- The spec says the guard is determined "from the canonical verdict". A projection that is `valid` on disk but stale against fresh files would demand `force` (or the reverse for unreconciled drift).
- Low blast radius because approvals are normally reconciled on read, but it is not what the spec says.
- No test pins the guard against a fresh verdict. The "already stale historical evidence does not trigger" test (`invalidate-change.spec.ts:390`) only covers persisted status.

### LOW

L1 [SPEC, transition-change] The Input contract is out of date.

- It lists `skipHookPhases` as an array of `HookPhase`; the code and the spec's own scenarios use `ReadonlySet<HookPhaseSelector>`.
- It lists `onProgress` as an input field; the code takes it as the second `execute` parameter (the Progress callback requirement does say second parameter).
- It omits `refreshImplementationTrackingBefore`, which the "Optional pre-transition implementation tracking refresh" requirement relies on.

L2 [SPEC, transition-change] The Dependencies requirement and `resolveTransitionChangeDeps` list omit things that are mandatory in code (`transition-change.ts` ctor; `composition/use-cases/transition-change.ts`).

- Omitted: `ReconcileChangeValidity` (ctor throws `InvalidCompositionFactoryArgumentsError` without it), `checkRegistry`, `resolveChangeSchema`.
- The transition-checks spec does say the reconciler is mandatory for every mutating use case.

L3 [SPEC, archive-change] The constructor signature and the `resolveArchiveChangeDeps` list omit `transitionBindings` and `approvals` (used by `_archiveRecoveryError` for forward-check guidance) and, in the resolver list, `reconcile` and `resolveChangeSchema`.

- The Constraints bullet "Hook execution is delegated to `RunStepHooks`" contradicts the requirement "MUST NOT take RunStepHooks".
- The spec text "`--skip-checks impl.filesResolved` MUST fail" embeds a CLI flag in a core spec; it should read "skipChecks naming impl.filesResolved".

L4 [CODE, archive-change] `ArchiveChange` ctor defaults `transitionBindings = []` (line about 244).

- `InvalidateChange` defaults to the domain `TRANSITION_BINDINGS` stubs, and its spec documents that default.
- A directly constructed `ArchiveChange` therefore evaluates no forward checks in committed-recovery guidance, which is effectively the "empty checksByTarget" the spec forbids.
- Composition always supplies real bindings, so this only affects direct construction. The spec is silent; align the default or document it.

L5 [CODE, archive-change] `_materializeImplementationLinks` (about lines 1340-1365) throws `CheckPredicateFailedError('impl.linksInScope', ..., 'IMPLEMENTATION_STATE', ..., skippable=false)`.

- It uses a hardcoded `skippable=false` and does not read the resolved binding. The spec says `skippable` comes from the resolved binding of that check, and the archive `impl.linksInScope` binding is skippable.
- Probably intentional, since a link outside `codeRoot` cannot be bypassed meaningfully, but it is not spec'd. Document it in the spec.

L6 [CODE, transition-checks] Built-in hook bindings (`hook.pre`, `hook.post`, transition and archive rows in `check-bindings.ts`) omit an explicit `skippable: false`.

- Category A says every Category A binding MUST explicitly declare `skippable: false`.
- `applyBindingSpecs` defaults it to false, so behavior is correct and only the literal "explicitly" is unmet.
- The test "Built-in binding specs declare governance explicitly" checks only `allowBindingOverride` / `allowDisable`.

L7 [SPEC, invalidate-change] Three stale wording points.

- (a) "use case MUST obtain `schema.artifactDag()` and pass it to `Change.invalidate()`" is now the reconciler's job (`reconcile-change-validity.ts:247-257`).
- (b) "Affected-set traversal order ... using `topologicalOrder()`" is implemented through `dag.descendantsOf` inside the reconciler (`expandAffected`, lines 354-364), not in the use case. Behavior is covered by `invalidate-change.spec.ts:561`.
- (c) The factory scenario lists 3 resolved deps; the requirement lists 7 (`resolveChangeSchema`, `reconcile`, `approvals`, `transitionBindings`, `checkRegistry` are missing from the scenario).

L8 [SPEC or CODE, approve-spec / approve-signoff] "If reconciliation changes the state so approval is inapplicable, persist and stop with the reconciled blocker."

- Code (`approve-spec.ts`, `approve-signoff.ts`) returns the `state` outcome and throws `InvalidStateTransitionError(newState,'ready'|'done')`. It does not throw a typed reconciled blocker (`ReconciledOperationBlockedError`, which TransitionChange and ArchiveChange use).
- Recovery is persisted, so semantics hold. The "typed blocker" wording is only loosely met; either amend the spec or switch to `ReconciledOperationBlockedError`.

L9 [INFO] `executeMatchingPredicates` emits only `check-done` (no `check-start`) for user-bypassed checks. The spec's "emit check-start before execute" arguably does not apply because `execute` is not called. Confirm intent.

## Verified OK (spot list)

- transition-checks, requirement by requirement:
  - Check identity/result/label/action: `domain/services/transition-checks.ts`.
  - CustomCheckDefinition has no kind/action.
  - Applicability, `classifyAlong` via `resolveWorkflowPipeline`, step-skip matcher.
  - `resolveEffectiveBindings`: single-pass cascade, coordinate isolation, concrete step-skip narrowing, one shared overlay for checks/skipChecks/archiveChecks, archive synthesis defaults non-skippable, declaration order, no registry drops, `InvalidInputError` on archive+target.
  - Binding table categories A/B/C and the archive lock exception match `check-bindings.ts`.
  - Approval parking rows and `verification.current` rows match.
  - Details contracts match: protocol.edge, requires (+ blockedBy), taskCompletion, approval gate, impl.\*, deps (mismatches), overlap (entries), readOnly (specs), nameMatch.
  - Actions: approve-spec / approve-signoff for APPROVAL*\*; signoff VERIFICATION*\* carry none; start-verification / refresh-status with `supersedesIntent:false`.
  - Host-neutral impl.linksInScope message (`detect-impl-links-in-scope.ts`).
  - Fail-fast protocol.edge in execute mode, projection collects all (`evaluate-transition-candidate.ts`).
- transition-change: skip validation against resolved bindings (`validate-skip-checks.ts`), effect/hook ordering (`hook.post` then `hook.pre` from binding order), collect `details.failures`, committed recovery error via `evaluateLegalTargets` + `evaluateLifecycle`, second fresh evaluation after hooks, `next` resolution and `HappyPathNextUnavailableError`.
- approve-spec / approve-signoff: eligible states from `boundFromStates`, one decorated actor, no transitions, stale-verification error carries only `changeName`, disabled-verifying path.
- archive-change: schema resolved before reconcile, `resolveEffectiveBindings(operation:'archive')` per execute, skip validation after the state guard and before predicates, `after-persist` / `before-persist` effects selected by phase, `throwArchivePredicateFailure` for every predicate failure.

## Untested scenarios

All are LOW unless noted. "Not found" means no direct test located by title or assertion search; indirect coverage may exist in reconciler specs.

transition-checks:

- "Disabled steps are excluded from progress axis" with verifying disabled and `implementing -> done` forward. Only the implementing-disabled variant exists (`transition-checks.spec.ts:68`).
- "Direction delegates to the authoritative topology axis" (noncanonical order plus explicit approvals).
- "Omitted implementing keeps retry backward". The existing test covers `disabled: true`, which yields `any`.
- "Executing custom check receives isolated config" and "Status allowed ignores effects" (GetStatus ignoring hook effects): not found.
- "Parked approval is reported before protocol edge failure" at the check level: only the guidance-level test (`lifecycle-guidance.spec.ts:286`).

transition-change:

- "Exit rejects evidence changed by hooks" (`verifying -> done`, hook mutates a fingerprinted input, `verification.current` re-evaluated before persist): not found. The analogous cases for impl.filesResolved (`transition-change.spec.ts:3021`) and CountTasks (`:2757`) exist.
- "Missing verification verdict blocks exit" at TransitionChange level (only at check level, `verification-current.spec.ts`).
- "Implementing to verifying deduplicates readiness checks": no explicit once-only assertion.
- "Missing reconciler never selects a legacy path" for TransitionChange / InvalidateChange / ApproveSpec at use-case level. Archive has it (`archive-change.spec.ts:192`); composition specs cover factory misuse only.
- "Backward movement preserves matching verification" is covered; "Changed inputs stale evidence independently" is not found at the transition level.

invalidate-change (MEDIUM for the first):

- "Gate priority wins over preserve" with both spec and sign-off valid and forced, including repeat idempotence: not found.
- "Override dimensions remain independent" (workflow-only override), "Invalid policy value is rejected before mutation", "Execution override is not persisted", "Output reflects idempotent repetition": not found.
- "Forced revocation commits evidence and recovery together" (atomicity): only partially covered (`invalidate-change.spec.ts:339-420`).

approve-spec / approve-signoff:

- ApproveSpec "Approval is renewed only in ready" (stale in implementing routes via designing and ready). Reconciler-level only.
- ApproveSpec "Missing required artifact blocks approval" (the `ineligible` outcome); only the drift case is tested (`approve-spec.spec.ts:192`).
- "Both factories are behaviorally equivalent" / "Factory does not bootstrap a kernel": composition specs cover mixed-arg errors (`composition/use-cases/approve-*.spec.ts`) but not equivalence.
- ApproveSignoff "Reconciliation blocks signing a changed snapshot": not found at use-case level.

archive-change:

- Coverage is broad. Not found as explicit tests: "Case-sensitive ids" (only a single hit) and "Mixed valid and invalid ids reject the whole request" (only via `UnknownCheckError` cases at `archive-change.spec.ts:4576-4646`).

## Counts

- Round 1 items re-verified: 4 of 4 hold.
- Discrepancies open: MEDIUM 4 (M1-M4), LOW 8 (L1-L8), INFO 1 (L9).
- Split: CODE-leaning 5 (M1, M3, L4, L5, L6), SPEC-leaning 5 (L1, L2, L3, L7, L8), conflict or either 3 (M2, M4, L9).
- Untested scenarios: about 22, none individually HIGH.

---

# Batch C compliance audit, round 2 (decouple-core-cli-workflow-guidance)

Scope: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source. Merged specs read via `changes spec-preview`. Read-only audit. CLI change/error/presenter test suites: 628/628 passing (vitest). ESLint not run (tool call blocked by hook).

## Round 1 fixes verified as holding

- Core messages: no CLI flags, `specd ...` commands, `/specd-*`, `Pass force`, `specs init`, `allowOutOfScope`, `skipChecks` remain in core/src non-comment code. Hints exist for VERIFICATION_STALE, SPEC_NOT_INITIALIZED, DEPENDS_ON_OVERWRITE (generate-metadata, validate), INVALIDATE_REQUIRES_FORCE, IMPLEMENTATION_DETECTED (draft, discard), HAPPY_PATH_NEXT_UNAVAILABLE, deps.consistent, hook CHECK_NOT_SKIPPABLE (cli/src/error-hints.ts:110-182).
- approve: `state:` line and `state` JSON field present (approve.ts:57,66,110,119); failure path projects `guidance:` (approve.ts:197-203).
- Drafted status blockers use `blockerTextLines` and `projectCliBlocker` (status.ts:199, 229); tests at status.spec.ts:2086-2160.
- Status/transition/approve help schemas now list intent/action/guidance/bypassFlag (status.ts:132-139; transition.ts:357-364; approve.ts:35-41).
- Skills templates: archive skill teaches `--skip-checks <checkId>`, aliases only as aliases, never-bypassable list, "no `bypass:` flag means cannot skip"; design/implement/verify/new only mention OVERLAP_CONFLICT as archive-only. Template tests present (template-workflow.spec.ts:235-263, template-lifecycle-consent.spec.ts:117-124).
- No raw core nextAction.command consumption anywhere in cli/src; every command goes through `projectCliNextAction`.

## Remaining / NEW discrepancies

### MEDIUM

M1. cli:change-archive "Error cases" (overlap bullet) vs implementation. Spec says archive overlap block "ends with `Use --skip-checks spec.overlap to proceed despite overlap.`", produced via presenter/hint helper. Implementation prints the generic `Retry with --skip-checks spec.overlap if an exception is granted` (packages/cli/src/commands/change/archive.ts:186-189, via `skippableCheckHint`); test locks that wording (packages/cli/test/commands/change/archive.spec.ts:626). The spec sentence is never produced anywhere (grep for "proceed despite" in cli/src finds nothing). Either fix code+test or amend spec to the generic hint (the spec's own generic bypass bullet uses the "Retry with..." form, so the two bullets contradict each other). Note: this overlap path bypasses `describeCheckFailure`/check-label lines; acceptable.

M2. cli:change-transition "Invalid transition error", bullet 3 + scenario "Guidance-only check action falls back to the next-action command". Scenario requires printing BOTH `guidance: pnpm audit:fix` (check action) AND `command: /specd-verify` (next action). Implementation (transition.ts:181-190) computes `cpCommand = action command ?? nextAction command`; if a next-action command exists, the check's guidance line is dropped (else-branch only). The test at transition.spec.ts:2024 only covers the nextAction-has-no-command case, and 2049 covers no-action; the dual-output scenario is untested. Fix: print guidance whenever the check action has guidance and no command mapping, then print fallback command separately.

M3. cli:change-verification "Success and idempotent output": spec says each JSON/TOON blocker mirrors text remediation with `action`, a presenter-projected `command` (`null` when the action has no mapping) and `guidance`. Implementation OMITS `command` when null/absent (verification.ts:285-296: `command !== undefined && command !== null ? { command } : {}`), and tests assert that omission (verification.spec.ts:471 `toBeUndefined`, :566 `'command' in ... false`). Direct spec/impl/test conflict; resolve by changing code+tests to emit `command: null` for actions without mapping, or amend spec to "omitted".

### LOW

L1. transition.ts:476-482 structured failure blockers spread raw core blocker (`...b`) plus `bypassFlag`, leaking raw `isSkippable` and not using `projectCliBlocker` as status/approve do. Inconsistent shape across commands (status drops `isSkippable`).
L2. transition.ts:172-190 text repair guide never prints the failed check's diagnostic `checkCode`; spec says render "failure message, diagnostic code, label". Code only appears if the same blocker is still in the fresh `GetStatus.blockers` (`! CODE — label`). Not covered by test. (test 1620 also passes message/code swapped in CheckPredicateFailedError ctor args.)
L3. status.ts:229 drafted JSON blockers use `projectCliBlocker`, which emits `action` when present; spec says `blocker.action` remains limited to non-draft results. Untested. Also status.ts:234 drafted JSON `artifacts: artifactStatuses` passes raw rows (no displayStatus -> effectiveStatus -> state fallback), unlike the active path (status.ts:518-534); "MUST NOT render undefined" is only guaranteed for active status.
L4. status.ts help schema: `schema.artifactDag` entry (line 132) lacks `optional`, `hasTasks`, `output` that the code emits; `lifecycle` block (140-143) omits `validTransitions`, `blockers`, `approvals`, `nextArtifact`, `changePath`, `schemaInfo`, `blockingArtifacts` on steps; blocker `isSkippable` not applicable. Spec requires "every field the structured output carries" (for the listed items it is satisfied; broader claim is not).
L5. approve.ts:38-41 and 91-93 help says "error payload additions: state, blockers, nextAction"; actual payload nests them under `metadata` (handle-error `extractErrorMetadata`; approve-failure.spec.ts:102 asserts `metadata.state`). Help blocker shape lists `{code,message,action?,bypassFlag?}` but `projectCliBlocker` also emits `label`, `checkId`, `details`; nextAction schema omits `actionType`.
L6. invalidate.ts:204/226 blockers rendered/serialized raw: no gerund `label` in text, no `bypassFlag`/`projectCliBlocker` projection (raw `isSkippable` leaks into JSON). Not required by cli:change-invalidate, but inconsistent with status/approve. invalidate.ts:237-240 prints a hard-coded `... Re-run with --force.` warning AND handleError then prints the resolved `force.revoke-consent` hint, so `--force` guidance is duplicated and the first copy is a literal in the command instead of the hint helper.
L7. core/src/domain/errors/historical-implementation-guard-error.ts:41 message contains "without force" (descriptive, not imperative; hint exists for draft/discard). Borderline against the "bare input name" rule; consider rewording to "without explicit confirmation".
L8. DEPENDS_ON_OVERWRITE hint rules exist only for `specs.generate-metadata` and `specs.validate` (error-hints.ts:111-120); any other CLI surface that propagates `DependsOnOverwriteError` (generate-metadata use case is also reachable from other flows) would show the confirmation-required message with no recovery hint. Spec says every such code MUST have a matching CLI hint; not verified exhaustively.
L9. skills shared.md.tpl:146-153 documents `nextAction` fields (`command` "exact CLI or skill command") but not `intent`, `action`, or `guidance`/`command: null` fallback; no spec requirement, but agents will meet `command: null` + `guidance` now. Optional doc improvement.

## Untested scenarios (no matching test found)

- transition: guidance-only check action WITH a next-action command (both lines) (see M2); mandatory-check text repair guide `hint:` branch for non-hint checks; diagnostic code rendering (L2).
- status: drafted `blocker.action` not leaked (L3); drafted artifacts display-status fallback; `--help` documenting `availableSteps[].optional` is not asserted by name (help test 2197 asserts intent/action/guidance/bypassFlag only); "Discarded name not found" (core-level, not in CLI test).
- archive: spec's overlap sentence `Use --skip-checks spec.overlap to proceed despite overlap.` (M1; test asserts different wording).
- verification: blocker `command: null` in JSON (M3; tests assert the opposite).
- approve: help text asserting bound-`from` language (`ready` / `done` example); only description strings, no test.
- invalidate: nextAction `action`/`intent` exposure for non-null `action` in JSON; guidance-only blocker remediation.

## Project-wide specs (project context)

Global specs: architecture, conventions, cross-platform, docs, eslint, logging, testing, error-handling-conventions. No contradictions found with the change beyond the item above; docs/ were updated (docs/cli/cli-reference.md etc. are modified). Project context warnings are only stale LLM-optimization notices, unrelated.

## Counts

MEDIUM 3 (M1-M3), LOW 9 (L1-L9), HIGH 0. Round 1 findings: all verified fixed except wording of the archive overlap sentence now conflicting with spec text (M1).
