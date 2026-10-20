# Partial Compliance Report C: Transition and Lifecycle

Change: `schema-workflow-skippable-states`
Specs audited: `core:transition-change`, `core:lifecycle-engine`, `core:get-status`
Method: read the merged spec previews (`changes spec-preview`), then read the code and tests directly. Nothing was mutated.

Key source files (paths relative to `packages/core/src`):

- `application/use-cases/transition-change.ts` (TC)
- `application/use-cases/get-status.ts` (GS)
- `application/services/evaluate-transition-candidate.ts` (ETC)
- `application/services/execute-matching-predicates.ts` (EMP)
- `domain/services/workflow-topology.ts` (WT)
- `domain/services/lifecycle-verdict.ts` (LV)
- `application/services/lifecycle-guidance.ts` (LG)
- `application/services/lifecycle-evaluation.ts` (LE)
- `application/checks/protocol-edge.ts`, `domain/checks/protocol-edge.ts`
- `domain/services/transition-checks.ts` (`resolveEffectiveBindings`)

Test files (paths relative to `packages/core/test`):

- `application/use-cases/transition-change.spec.ts` (TCT)
- `application/use-cases/get-status.spec.ts` (GST)
- `application/services/evaluate-transition-candidate.spec.ts` (ETCT)
- `domain/services/lifecycle-verdict.spec.ts` (LVT)
- `domain/services/lifecycle-engine.spec.ts` (LET)
- `domain/services/workflow-topology.spec.ts` (WTT)

---

## 1. core:transition-change

### Requirements Summary

Spec preview: 25 requirements. The change touches these:

- **Input contract**: uses `skipChecks` and accepts no ad-hoc boolean bypass flags.
- **Canonical pre-transition validity reconciliation**: omits disabled checks, validates bypasses, fails fast on `protocol.edge`.
- **to next**: resolves the target through `ResolveChangeSchema` and `nextWorkflowStep`, skips disabled steps, and throws `HappyPathNextUnavailableError` when no next hop exists.
- **Bypassed step evaluation and hook suppression**: uses the sovereign schema, requires every crossed step to be optional (enforced by `protocol.edge`), runs one shared candidate evaluator, rebuilds the candidate from fresh state, and runs no hooks on bypassed steps.
- **Shared runner errors propagate on transition**: maps built-in checks to canonical reasons; every other failure becomes `CheckPredicateFailedError` (including `skippable`).
- **Optional refresh, Verification attempt lifecycle, Post/Pre hooks, Persistence**: pre-existing requirements, re-checked against the new flow.

### Implementation Status

| Requirement                                       | Status                   | Evidence                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input contract                                    | Implemented              | TC:55-84 (no `allowOutOfScope` or `allowOverlap`)                                                                                                                                                                                                                              |
| Approval gates baked at construction              | Implemented              | TC:147-181                                                                                                                                                                                                                                                                     |
| Change must exist                                 | Implemented              | TC:204-207                                                                                                                                                                                                                                                                     |
| Optional pre-transition refresh                   | **Partial / deviates**   | TC:211-214 honours the opt-out; TC:379-382 always passes `refreshImplementationTracking: true` (see D-TC1)                                                                                                                                                                     |
| Spec approval / signoff as checks                 | Implemented              | approval predicates are mapped at TC:642-649                                                                                                                                                                                                                                   |
| Pending states / historic parked precedence       | Implemented              | TC:255 and TC:485-528 run before the candidate is evaluated                                                                                                                                                                                                                    |
| Direct transition when gates inactive             | Implemented              | TC:328 (`effectiveTarget = requestedTarget`)                                                                                                                                                                                                                                   |
| Canonical pre-transition reconciliation           | Implemented with caveats | disabled checks omitted at EMP:213-216 and in `resolveEffectiveBindings`; bypass validation at TC:287-307; synthetic skip result at EMP:218-233; `protocol.edge` fail-fast at ETC:109-120 (see D-TC3)                                                                          |
| Workflow requires enforcement                     | Implemented              | TC:612-625, plus `requires-check` progress at TC:674-693                                                                                                                                                                                                                       |
| Task completion check                             | Implemented              | TC:626-641, TC:701-724                                                                                                                                                                                                                                                         |
| Implementation-only retry                         | Implemented              | no clearing inside the mutate callback (TC:423-433)                                                                                                                                                                                                                            |
| Verification attempt lifecycle                    | Implemented              | after hooks: reconcile again, then evaluate the candidate again (TC:378-421)                                                                                                                                                                                                   |
| Skill-aligned backward hop                        | Implemented              | TC:424-426 (`invalidateSignoff`), using hardcoded `SKILL_HOP_*` sets (TC:108-109)                                                                                                                                                                                              |
| Transition to designing                           | Implemented              | TC:249-251 (designing to designing is a no-op)                                                                                                                                                                                                                                 |
| archiving to archivable                           | Implemented              | the `along=recovery` path                                                                                                                                                                                                                                                      |
| Pre/Post hook execution                           | Implemented              | TC:366-376 via `matchingEffects`                                                                                                                                                                                                                                               |
| Transition delegation / Persistence               | Implemented              | TC:423-433 `mutate`                                                                                                                                                                                                                                                            |
| Result type / Progress / Dependencies / Factory   | Implemented              | TC:103-106, TC:87-100                                                                                                                                                                                                                                                          |
| **to next is the happy-path next state**          | Implemented              | TC:233-247; WT:269-293                                                                                                                                                                                                                                                         |
| **Bypassed step evaluation and hook suppression** | Implemented with caveats | TC:265-279, TC:314-327; ETC:76-150; crossing a mandatory step is illegal because of WT:129 (`forwardTargets` stops at the first non-optional step); bypassed-step hooks never match because effects are selected from the `from` to `to` attempt (TC:366). See D-TC2 and D-TC4 |
| **Shared runner errors propagate**                | **Partial**              | the default branch at TC:650-662 computes `skippable` from base bindings only (D-TC2)                                                                                                                                                                                          |

### Discrepancies

- **D-TC1 (MEDIUM): `refreshImplementationTrackingBefore: false` still triggers a refresh.**
  - Evidence: TC:379-382 always calls `_reconcile.execute({ refreshImplementationTracking: true })` after effects. `reconcile-change-validity.ts:175` refreshes when the flag is `true`. TCT:359 locks this in ("skips only the initial refresh ... keeps the post-hook refresh").
  - Spec: "When `refreshImplementationTrackingBefore` is `false`, `TransitionChange` MUST NOT invoke `RefreshImplementationTracking`."
  - Possibility A (spec drift): the "Verification attempt lifecycle" requirement does say "fresh tracking ... SHALL run again before persistence". The refresh requirement should then be reworded to say the flag controls only the pre-evaluation refresh.
  - Possibility B (implementation bug): the post-hook pass should respect the flag. It also runs even when no effect matched.

- **D-TC2 (MEDIUM): `CheckPredicateFailedError.skippable` can be wrong for schema-declared and step-skip checks.**
  - Evidence: `_mapFailedPredicate`'s default branch (TC:651) looks up `this._transitionBindings`, the base bindings. A check added by `resolveEffectiveBindings` from schema `checks:` or `skipChecks:`, or a base binding whose skippable flag the schema changed, therefore reports `skippable: false`.
  - The collect path (TC:567) uses the effective bindings, so the two paths disagree. Bypass validation (TC:295-306) also uses effective bindings, so a check that `--skip-checks` would accept can be reported as not skippable.
  - Possibility A (bug): `_throwPredicateFailures` should pass the `effectiveBindings` it already has into the mapper.
  - Possibility B (spec drift): none credible. The spec says "whether the failed binding permits `--skip-checks`".

- **D-TC3 (LOW): "aborted immediately" is not literal for non-protocol predicates.**
  - Evidence: in execute mode, ETC runs every remaining predicate and every step-skip predicate before TC throws (EMP:248-253 stops early only with `failFast`/`failFastOn`). Only `protocol.edge` stops evaluation.
  - Possibility A (spec drift): reword the requirement to "aborted after evaluation". This matches the `onFailure: collect` aggregation design and the test at TCT:4109.
  - Possibility B (bug): stop at the first `abort`-policy failure.

- **D-TC4 (LOW): the after-hook candidate reuses a stale `effectiveStatusByArtifact`.**
  - Evidence: TC:404 passes the map computed before the hooks (TC:256-257) into the after-hook evaluation, even though `change` was just reloaded at TC:383.
  - Spec: the candidate "MUST be recalculated from fresh persisted state".
  - Possibility A (bug): drop the argument so ETC:72-74 recomputes it.
  - Possibility B: accept it, on the grounds that hooks cannot change artifact DAG state. That assumption is unverified.

- **D-TC5 (MEDIUM): the committed-recovery command routes to `/specd-verify` even when `verifying` is disabled.**
  - Evidence: `committedRecoveryError` (TC:746) returns `'/specd-verify'` for any recovery whose target is not `designing`, for example a stale-signoff return to `done`.
  - This conflicts with lifecycle-engine's "Verification-renewal commands MUST only be recommended when `verifying` is enabled". It also places command routing outside `lifecycle-guidance.ts`, while the spec requires the command matrix to live there.
  - Possibility A (bug): resolve the command through `resolveLifecycleCommand` with `isWorkflowStepEnabled('verifying', schema)`.
  - Possibility B (spec drift): none credible.

- **D-TC6 (LOW): `bypassedSteps` is lost when `protocol.edge` fails fast.** In execute mode, a failed `protocol.edge` returns `bypassedSteps: []` (ETC:116). This is diagnostic only.

- **D-TC7 (LOW): hardcoded lifecycle state sets.** `SKILL_HOP_SOURCES` and `SKILL_HOP_TARGETS` (TC:108-109) are fixed lists. They are not inside lifecycle-verdict code, but they cut against the topology-derived principle.

### Test Coverage

- to next: implementing to verifying (TCT:246). Disabled verifying resolves to done, using the sovereign schema (TCT:3661). Rejections from archivable, pending states and archiving (TCT:276-343).
- Step-skip evaluated and failure gives `CheckPredicateFailedError`: TCT:3547. Hook suppression: TCT:3600 and TCT:3842.
- Sovereign schema: TCT:3661 and TCT:3933. Schema `skipChecks`: TCT:3842. Schema `checks`: TCT:3766.
- Freshness and effects ownership: TCT:4135 and TCT:4193.
- `skipChecks` validation: TCT:3179, 3195, 3211, 3308, 3344, 3376.
- Collect aggregation: TCT:4109 and TCT:4123.
- Parked precedence: TCT:621 and TCT:631.
- ETC unit tests: empty step-skip set (ETCT:213), no effects (ETCT:270), execute-mode fail-fast (ETCT:367-402).

### Missing Tests

1. "Target step executes schema-declared checks" with `config: { severity: 'critical' }` received in `ctx.config`. No test asserts config delivery through TransitionChange (the test file has no `config` assertions).
2. "Target step omits schema-disabled check" (`impl.linksInScope: { disabled: true }`) at the TransitionChange level.
3. "Failed step-skip and plugin checks use CheckPredicateFailedError" with the `skippable` flag asserted. No test asserts `.skippable`, which is why D-TC2 goes unnoticed.
4. "Canonical built-in failures map to InvalidStateTransitionError reasons". The test file never asserts `invalid-transition` (TCT:429 checks only the error class).
5. Crossing a mandatory step (for example ready to verifying with a mandatory `implementing`) should be rejected by `protocol.edge`. This is not tested at the use-case level.
6. "Empty effective skip-check set permits bypass" at the use-case level. It is covered only in ETCT:213.
7. "Status projection cannot authorize a stale transition": TCT:4135 does not first project via GetStatus and then mutate facts. It tests a failing state directly.
8. "Disabled step check is omitted from execution" (Canonical reconciliation scenario).
9. The refresh opt-out scenario: TCT:359 asserts behaviour that contradicts the spec (D-TC1).

### Spec Dependency Chain consistency

- `core:workflow-topology`: TC uses `listBypassedWorkflowSteps` and `nextWorkflowStep` (WT:246, WT:269). Consistent.
- `core:resolve-change-schema`: TC:233-237 is used for every attempt, not only `next`. Consistent.
- `core:transition-checks` and `core:check-registry`: the step-skip scope is built in ETC:127-132. Consistent.
- `default:_global/architecture`: TC sits in the application layer, imports pure domain functions, and has no I/O in the domain. Consistent.

---

## 2. core:lifecycle-engine

### Requirements Summary

The domain verdict is a set of plain functions. `availableSteps` comes from `resolveWorkflowPipeline`, without disabled steps. All position and boundary logic must be topology-derived. `checksByTarget` holds complete candidates. `nextHop` uses the optional-step recommendation policy (furthest passing shortcut, fallback to entering the optional step). Guidance resolves the command from the selected `targetStep` and must never route to `/specd-verify` when `verifying` is disabled.

### Implementation Status

| Requirement                                                       | Status                         | Evidence                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless domain verdict                                          | Implemented                    | LV:169 is a plain function; `lifecycle-engine.ts` only re-exports                                                                                  |
| Centralized validation                                            | Implemented                    | LV:186-199 projects only the supplied results                                                                                                      |
| Effective status / canonical-only / blockers                      | Implemented (not changed here) | LV:365-470                                                                                                                                         |
| Available steps: pipeline order, disabled excluded                | Implemented                    | LV:201-245                                                                                                                                         |
| Topology-derived comparisons, no hardcoded lists                  | **Partial**                    | `isForward` and `pipelinePosition` are topology-derived (LV:887-914); `verificationBoundary` (LV:974-986) uses a hardcoded state list (D-LE1)      |
| `checksByTarget` complete / available only when allowed           | Implemented                    | LV:190-199, fed by ETC through `executeChecksByLegalTargets` (EMP:351-384)                                                                         |
| Optional-step recommendation                                      | Implemented                    | `recommendedForwardTarget` (LV:1009-1038), used for drafting/designing, ready, spec-approved, implementing, verifying, done                        |
| Hop matrix (disabled verifying gives done; done gives archivable) | Implemented                    | LV:1139-1196                                                                                                                                       |
| Archiving guidance / escape transitions                           | Implemented                    | LV:249-251, LV:1213-1234                                                                                                                           |
| Application guidance: command from the selected target            | Implemented                    | LG:98-184; `nextWorkflowStep` is never called                                                                                                      |
| Never `/specd-verify` when verifying disabled                     | **Partial**                    | LG:46-61 and LG:147-149 respect it; TC:746 does not (D-TC5); a blocked `done` falls back to `/specd-archive` instead of the actual blocker (D-LE2) |
| `evaluateLifecycle` attaches `nextAction`                         | Implemented                    | LE:26-46                                                                                                                                           |
| Next artifact topological order / predicate blocker identity      | Implemented                    | LV:816, LV:262-267                                                                                                                                 |

### Discrepancies

- **D-LE1 (MEDIUM): `verificationBoundary` uses a hardcoded state list.**
  - Evidence: LV:978-985 enumerates `verifying`, `done`, `pending-signoff`, `signed-off`, `archivable`, `archiving`. LG:50-55 repeats the same list.
  - Spec: "Every forward/backward or position comparison inside lifecycle verdict code (including verification boundaries ...) SHALL derive from `resolveWorkflowPipeline` ... hardcoded lifecycle state lists MUST NOT be used."
  - Behaviour is guarded by the `isWorkflowStepEnabled('verifying')` check, so the practical impact is small.
  - Possibility A (bug): derive the boundary with `isForward('verifying', state) || state === 'verifying'`, the pipeline-position helper.
  - Possibility B (spec drift): exempt drain states.

- **D-LE2 (LOW-MEDIUM): a blocked `done` with verifying disabled resolves to `/specd-archive` rather than the real blocker.**
  - Evidence: LG:147-149 returns `/specd-archive` when `nextHop.targetStep` is `done` (stay) and verifying is disabled.
  - Spec: the command "MUST resolve its command from the actual blocker (for example sign-off, artifact review, or tasks)". The signoff and review cases are handled earlier (LG:63-85). Other blockers, such as unresolved tasks or a custom check, fall back to the archive skill. GS:714-724 adds a failing-check command only when the command is `null`, which is never the case here.
  - Possibility A (bug): map from blockers.
  - Possibility B (spec drift): accept `/specd-archive` as the owner of `done`.

- **D-LE3 (LOW): spec text still names the legacy bypass flags.**
  - Evidence: the spec mentions `--allow-overlap` and `--allow-out-of-scope` (blocker example, `isPermitted` bullet, scenario "Skip bypass allows transition despite blocker"). The implementation advertises `--skip-checks <id>` (GS:975, GS:998). The TransitionChange spec retired the ad-hoc flags.
  - Likely spec drift.

### Test Coverage

- Shortcut recommended with optional entry retained: LVT:70. Fallback to entering the step: LVT:81. Empty skip set: LVT:87. Consecutive optional steps, furthest target: LVT:98. Failed step-skip evidence kept in `checksByTarget`: LVT:1151.
- Disabled verifying: excluded from `availableSteps` (LET:90); legal skip to done (LET:100); `nextHop` done (LET:109); `/specd-archive` (LET:135); archivable from done (LET:166); never verify (LET:201).
- Archiving escape: LVT:630 and LVT:660. Verifying gives done: LVT:784. Archivable: LVT:798 and LVT:813.
- Canonical row order: covered at the topology level (WTT:86, WTT:112).

### Missing Tests

1. "Blocked done with verifying disabled never routes to verify", run with the **real** validity verdict and the signoff gate on with sign-off missing. LET:201 uses an injected `verification: 'absent'` fixture with gates off, which is exactly what the scenario forbids.
2. "availableSteps follow canonical order regardless of row order", asserted at the verdict level (only topology tests cover it).
3. Two consecutive optional steps where the second skip fails, to confirm the middle-step recommendation is intended.

### Spec Dependency Chain consistency

- `core:workflow-topology`: consistent. `listWorkflowTransitions` (LV:176), `resolveWorkflowPipeline`, and `isWorkflowStepEnabled` are all used.
- `core:transition-checks`: consistent. LV only projects supplied `CheckResult`s and does no I/O.
- `default:_global/architecture`: the domain stays pure and command strings live in the application layer, except TC:746 (D-TC5).

---

## 3. core:get-status

### Requirements Summary

New requirement: **Shared transition candidate evaluation**. Each legal target is evaluated through the same ETC as TransitionChange (bypassed steps plus step-skip predicates). Projection is effect-free. Also covered: resolving the sovereign schema through `ResolveChangeSchema` with identity-mismatch and advisory handling, and the existing reconciliation and blocker requirements.

### Implementation Status

| Requirement                                                  | Status                          | Evidence                                                                                                    |
| ------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Input / result / not-found / drafted                         | Implemented                     | GS:481-489, GS:822-926                                                                                      |
| Revision evaluation (`ifModifiedSince`)                      | Implemented (MAY not exercised) | `ifModifiedSince` is accepted (GS:73) and never used; `_buildUnchangedResult` (GS:773) is dead code (D-GS3) |
| Refresh / reconciliation ordering                            | Implemented                     | the schema resolves before reconcile (GS:491-513)                                                           |
| Execute matching predicates then project                     | Implemented                     | GS:637-667                                                                                                  |
| **Shared transition candidate evaluation**                   | Implemented                     | GS:637, through `executeChecksByLegalTargets` and then ETC in `projection` mode (EMP:367-381)               |
| Projection-only, no effects                                  | Implemented                     | ETC runs predicates only; GS never calls `mutate` or hooks after reconcile                                  |
| Identifies blockers / bypass flags                           | **Deviates from spec text**     | GS:968-976 advertises `--skip-checks <id>` and uses static base or registry skippability (D-GS1, D-GS2)     |
| Graceful schema degradation / identity mismatch / advisories | Implemented                     | GS:383-399, GS:565-625, GS:500                                                                              |
| Constructor deps / reconciler mandatory                      | Implemented                     | GS:462-465                                                                                                  |

### Discrepancies

- **D-GS1 (LOW-MEDIUM): bypass flag text differs from the spec.**
  - Evidence: the spec says that for `impl.linksInScope` the bypass is `--allow-out-of-scope`, and `OVERLAP_CONFLICT` uses `--allow-overlap`. The code emits `--skip-checks impl.linksInScope` (GS:975). The test is named "...bypassFlag is --allow-out-of-scope" but asserts `--skip-checks impl.linksInScope` (GST:779-833).
  - Likely spec drift left over from retiring the legacy flags, together with a misleading test name.

- **D-GS2 (MEDIUM): blocker skippability ignores effective bindings.**
  - Evidence: `_mergeBlockers` (GS:954-969) reads skippability from `registry.bindings()` or the base bindings. Schema-synthesized or schema-overridden bindings (step `checks:` or `skipChecks:` with `skippable`) therefore get the wrong `bypassFlag`. Same root cause as D-TC2.
  - Possibility A (bug): carry `skippable` on the candidate's `CheckResult`s, or resolve it per target.

- **D-GS3 (LOW): `ifModifiedSince` is never used.** The input field exists but never short-circuits, and `_buildUnchangedResult` is dead code. The spec allows this (MAY), but the dead code should be removed or wired in. GST:1178-1238 only assert that full evaluation happens.

- **D-GS4 (LOW): shortcut step-skip failures show up as public blockers and can supply `nextAction.command`.**
  - Evidence: failed step-skip predicates for a shortcut target are flattened into public `blockers` (GS:958-976) even when the default path, entering the optional step, is available. When the command is `null`, the first failing check's command is adopted (GS:714-724), which may come from that shortcut.
  - Possibility A (spec intended): the spec says failed candidate predicates MUST appear.
  - Possibility B: filter blockers to the recommended or requested path.

### Test Coverage

- Shortcut available with complete `checksByTarget`: GST:429. Failing skip suppresses the shortcut and keeps the failed check visible: GST:456. Empty skip set allowed: GST:503.
- Sovereign schema: GST:119. Identity mismatch and degradation: GST:348, GST:393, GST:1110, GST:1130. Advisory warnings: GST:1151.
- Archive overlap: GST:1327-1401. Validity projection: GST:1403-1557.

### Missing Tests

1. "Status evaluation has no transition effects" at the GetStatus level: no assertion that RunStepHooks and `mutate` are not called after reconcile. Only ETCT:270 covers the evaluator.
2. A GetStatus `nextAction` test for an optional step with passing and failing skips. It is covered only in LVT.
3. Schema-declared skippable step-skip check: is the blocker's `bypassFlag` correct (D-GS2)?
4. Note on GST:503: the "empty set" claim depends on the default `workflow.tasksEmpty` binding being scoped to `implementing` only (`check-bindings.ts:60`). The test is valid, but implicitly so.

### Spec Dependency Chain consistency

- `core:transition-change`: shares ETC. Consistent, apart from the shared skippable mismatch (D-TC2 and D-GS2).
- `core:lifecycle-engine`: GS consumes `evaluateLifecycle` (GS:663) and never reads `nextHop` commands. Consistent.
- `core:resolve-change-schema`: GS:494 and GS:835. Consistent.
- `default:_global/error-handling-conventions`: degradation returns typed blockers instead of throwing. Consistent.

---

## Summary

| Severity   | Count | IDs                                                                                       |
| ---------- | ----- | ----------------------------------------------------------------------------------------- |
| HIGH       | 0     | none                                                                                      |
| MEDIUM     | 5     | D-TC1, D-TC2, D-TC5, D-LE1, D-GS2                                                         |
| LOW-MEDIUM | 2     | D-LE2, D-GS1                                                                              |
| LOW        | 6     | D-TC3, D-TC4, D-TC6, D-TC7, D-LE3, D-GS3, D-GS4 (D-GS4 can be read as intended behaviour) |

The table lists 13 IDs in total, but only 12 are distinct issues: D-LE3 and D-GS1 are the same legacy-flag spec drift.

Checked focus points:

- `to: 'next'`: OK.
- Step-skip evaluation for bypassed optional steps: OK.
- Effects only after the complete candidate passes: OK.
- Status projection purity: OK.
- TransitionChange recomputing the candidate from fresh state: mostly OK; see D-TC4.
- `CheckPredicateFailedError` mapping: the class is right, but the `skippable` flag can be wrong (D-TC2).
- Disabled-verifying routing: mostly OK; TC:746 is the exception (D-TC5).
- Furthest passing shortcut: OK.

Missing tests: 9 for transition-change, 3 for lifecycle-engine, 4 for get-status.
