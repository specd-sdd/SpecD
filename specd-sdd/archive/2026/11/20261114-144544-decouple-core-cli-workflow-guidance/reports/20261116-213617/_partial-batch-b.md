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
