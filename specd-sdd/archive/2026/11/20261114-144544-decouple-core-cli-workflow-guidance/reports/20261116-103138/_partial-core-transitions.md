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
