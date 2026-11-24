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
