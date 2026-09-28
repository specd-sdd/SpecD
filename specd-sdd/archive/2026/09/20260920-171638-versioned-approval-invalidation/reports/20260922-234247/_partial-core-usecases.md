# Partial audit: core use cases — versioned-approval-invalidation

Mode: delegated. Verification start/complete were not run.
Graph: `graph stats` reported `CONTENT_KNOWN_STALE` (lastIndexedAt 2026-09-22T21:43:34.445Z). Index was not rebuilt. Symbols were located with `graph search` / `graph impact`, then confirmed by reading the cited source. Line numbers below are from those reads.

Design contract: `specd-sdd/changes/20260920-171638-versioned-approval-invalidation/design.md`.
Verify text: `changes spec-preview versioned-approval-invalidation <specId> --artifact verify --format text`.

Cross-cutting design checks (used by every spec below):

| Contract                                                                     | Result                                                                                | Evidence                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReconcileChangeValidity` is the configured mutation coordinator             | Config factories inject `resolver.getReconcileChangeValidity()`                       | `packages/core/src/composition/use-cases/{get-status,transition-change,archive-change,validate-artifacts,edit-change,invalidate-change}.ts`                                                                     |
| Residual bypass when the optional reconciler is omitted                      | Transition and validate still call `Change.invalidate`                                | `transition-change.ts` 310–326; `validate-artifacts.ts` 742–757                                                                                                                                                 |
| Recovery priority and no self-transition                                     | Matches design                                                                        | `change-validity.ts` `selectAutomaticRecovery` 180–200, `isAfter` 575–577; `change.ts` `transition` 909–913 rejects `from === to`; `persistConsequences` 618–624                                                |
| Verification start/complete/invalidate                                       | Mostly matches; see `core:invalidate-verification` and design notes                   | `start-verification.ts`, `complete-verification.ts`, `invalidate-verification.ts`                                                                                                                               |
| Status writes only when facts change; v1 read without drift does not rewrite | Repository stamp matches; status always enters `mutate` when a reconciler is injected | `change-repository.ts` `mutate` 375–378, `changeMutationStamp` 2034–2036; test `change-repository.spec.ts` 2824                                                                                                 |
| Archive does not complete verification                                       | No `completeVerification` / `startVerification` in archive                            | `archive-change.ts` depends on `ReconcileChangeValidity` only (`graph impact --file core:src/application/use-cases/archive-change.ts`); `graph impact --symbol CompleteVerification` dependents exclude archive |
| `GetStatusResult` vs `ValidityStatusProjection`                              | Shape missing                                                                         | `get-status.ts` 257–283 has `validity?: ChangeValidityVerdict`. Graph search for `ValidityStatusProjection` has no such symbol                                                                                  |

---

## core:create-change

### Requirements summary

Previewed requirements: name uniqueness, actor resolution, single `created` event, construction, `specDependsOn` seeding, input contract, active schema resolution, optional overlap check, initial invalidation policy, persistence/scaffolding, dependencies, config factory.

Delta requirements for this change: complete structured policy input; partial schema pair still invalid; explicit policy wins over `{ downstream, preserve }`; later policy edits do not rewrite creation history.

### Implementation status

`CreateChangeInput.invalidation` is an optional structured `InvalidationPolicy`. Omission persists `DEFAULT_INVALIDATION_POLICY` (`{ artifacts: 'downstream', workflow: 'preserve' }`). The use case does not parse a legacy scalar. Creation does not call the reconciler (no projections exist yet).

Evidence: `packages/core/src/application/use-cases/create-change.ts` lines 41–45 and 149.

### Discrepancies

None found in the delta requirements. Pre-existing uniqueness, seeding, overlap, and factory scenarios were not re-executed.

### Test coverage

Design names `create-change.spec.ts`. This pass did not re-read every assertion. Default policy persistence is also asserted on create in `packages/core/test/infrastructure/fs/change-repository.spec.ts` (`manifestVersion: 2`, `{ downstream, preserve }`) around line 2833.

### Summary counts

- Requirements reviewed (delta): 2
- Implementation matches delta: 2
- Discrepancies: 0
- Test gaps noted: 0 for the delta (full legacy suite not re-counted)

---

## core:edit-change

### Requirements summary

Previewed requirements include lookup, no-op edits, description vs invalidation, removal-before-addition, seeding, directory cleanup, tracking refresh, policy edits, output contract, dependencies, factory.

Delta: scope change reconciles atomically and required stale spec consent returns to design while ungated preserve retains state; unaffected evidence stays valid; policy-only edit invents no drift; repeating the same policy is a no-op; result separates edits from invalidation and reports committed recovery.

### Implementation status

Scope edits require a reconciler and run inside `ReconcileChangeValidity.mutate`, then `reconcileAfter({ type: 'scope-change' })`. Config resolution always supplies the shared reconciler. Policy resolution is structured.

Evidence: `packages/core/src/application/use-cases/edit-change.ts` 230–264; `packages/core/src/composition/use-cases/edit-change.ts`.

### Discrepancies

1. **Scope change always stales valid spec approval, even when the fingerprinted input set is unchanged.**
   - Spec scenario “Unaffected evidence remains valid”: a scope change that does not alter a projection’s fingerprinted input set leaves that projection unchanged.
   - Design compares each valid projection to its own baseline; stale is caused by a changed or unprovable reviewed input.
   - `applyIntent` treats every `scope-change` as `pushStaleGate(..., 'spec', 'scope-change')`, and `pushStaleGate` marks any `valid` spec projection stale with empty differences.
   - Evidence: `packages/core/src/application/use-cases/reconcile-change-validity.ts` 430–432 and 504–515; caller `edit-change.ts` 263.
   - Either the spec/design should say every spec-id edit withdraws spec consent, or the reconciler should stale spec approval only when the artifact fingerprint actually changes. Sign-off and verification are not blindly staled by this intent.

### Test coverage

`edit-change.spec.ts` is the named suite. No test was found in this pass that asserts a scope edit with an unchanged fingerprint leaves spec approval `valid`. Recovery and policy scenarios need that assertion to lock the scenario above.

### Summary counts

- Delta requirements: 4
- Matching: 3
- Discrepancies: 1
- Missing/insufficient tests: 1 (unaffected fingerprint)

---

## core:invalidate-change

### Requirements summary

Independent override dimensions; invalid values rejected before mutation; execution override is not persisted; workflow override does not change target rules; downstream requires a target and global forbids one; invalid targets report every problem; force only for current consent; forced revocation is atomic; gate priority over `preserve`; ungated preserve keeps state; cause `artifact-review-required`; downstream expansion; `hasDrift` unchanged; idempotent reopen; result reports canonical effects; DAG order; factory.

### Implementation status

`InvalidateChange` resolves a structured overlay, validates targets, and delegates mutation to `reconcile.execute` with `manual-invalidation`. Force passes `revoke` only for projections whose status is `valid`. Config factory requires the reconciler (not optional). Manual cause in `artifactCause` is `artifact-review-required`.

Evidence: `invalidate-change.ts` 100–151 and `consentToRevoke` 257–261; `reconcile-change-validity.ts` `artifactCause` 656–663.

### Discrepancies

1. **Force guard is any valid consent, and the failure does not report recovery targets.**
   - Spec: when the request affects valid approval and force is absent, no mutation occurs and affected gates and recovery targets are reported. Already-stale evidence does not trip the guard (implemented: only `status === 'valid'`).
   - Design affected-area line: guard only valid consent affected by the request.
   - `consentToRevoke` returns every valid spec and sign-off gate, with no comparison to targets or fingerprints. The throw happens before `reconcile.execute`, so recovery is not computed.
   - `InvalidateRequiresForceError` exposes `gates` and a fixed message that always says return to `designing` (`invalidate-requires-force-error.ts` 20–22). A sign-off-only case whose recovery is `done` is not described.
   - Evidence: `invalidate-change.ts` 113–116, 257–261.

2. **Possible spec/design split, not a second code bug:** repeating an already-open invalidation is idempotent inside the reconciler (`markApprovalInvalid` / `needsArtifactReview`). The force-absent path never reaches that idempotent success result; it throws instead. The “output reflects idempotent repetition” scenario is therefore only reachable when force is set or no valid consent remains.

### Test coverage

Named suite: `invalidate-change.spec.ts`. This pass did not find an assertion that an unaffected valid gate is left alone, or that the force error carries a recovery target other than the hardcoded designing sentence.

### Summary counts

- Delta requirements checked: 8
- Matching: 6
- Discrepancies: 2
- Test gaps: 2 (affected-only guard, recovery target on the force error)

---

## core:validate-artifacts

### Requirements summary

Large pre-existing validation surface (required artifacts, dependency order, traversal, complete/skipped bypass, per-file paths, delta eligibility, metadata, factory, DAG via `evaluateLifecycleVerdict`, `ChangeNotFoundError`).

Delta: validation cannot erase detected drift and does not renew projections; `preserve` allows in-place validation but not forward progress while review is pending; task content does not invalidate approvals or propagate review; non-task drift follows artifact policy and gate/workflow priority.

### Implementation status

When a reconciler is present, persistence goes through `reconcile.mutate`. The callback only `markComplete`s and `setSpecDependsOn`. It does not call `Change.invalidate` or record approval. Drift/recovery is the pre-pass inside `mutate`. Task exclusion is in `collectReviewTargets` (`taskArtifacts.has` skip).

Evidence: `validate-artifacts.ts` 727–741; `reconcile-change-validity.ts` 272–273.

### Discrepancies

1. **Optional reconciler still invalidates outside the coordinator.** If `reconcile` is omitted, the same persistence step calls `freshChange.invalidate` directly (`validate-artifacts.ts` 742–757). Config `resolveValidateArtifactsDeps` always injects the shared reconciler. Direct construction can still bypass the design invariant. Same pattern as transition.

No delta-logic bug found on the injected path. Pre-existing path/delta/metadata scenarios were not re-audited line by line.

### Test coverage

Named suite: `validate-artifacts.spec.ts`. Design asks for pre/post reconciliation and the task exception. This pass did not re-open that file; coverage of “validation does not renew” should be confirmed there. The legacy `invalidate` branch is still compilable, so a test that omits the reconciler would not prove the design invariant.

### Summary counts

- Delta requirements: 4
- Matching on the injected path: 4
- Discrepancies: 1 (optional bypass)
- Test gaps: 1 (bypass path vs sole-coordinator invariant)

---

## core:approve-spec

### Requirements summary

Gate disabled before repository access; missing change; task artifacts excluded from the consent fingerprint; missing/pending non-task blocks approval; renewal only in `ready` with no deleted history; pre-approval drift persists recovery and does not record consent; approval and fingerprint share one mutation; ineligible approval commits only reconciliation; input is name and reason; factory equivalence; no kernel bootstrap.

Conflicting legacy scenario still in the preview: enabled gate with the change in `pending-spec-approval` transitions to `spec-approved`. Schema mismatch is thrown before `mutate`.

### Implementation status

Disabled gate throws `ApprovalGateDisabledError` before `get`. Schema mismatch is checked after `get` and before `mutate`. Recording uses `reconcile.mutate`, `artifactFingerprint`, and `recordSpecApproval` with the same actor. `hasTasks` files are skipped in `blockingArtifact`. Drift uses `ctx.before.artifactReviewRequired` and does not record consent.

Evidence: `approve-spec.ts` 75–123 and 135–160.

### Discrepancies

1. **Design says approval only in `ready` and does not move state. Code still drains `pending-spec-approval` to `spec-approved`.**
   - Design “Approval flows”: require the committed state to be exactly `ready`; do not move state.
   - Newer scenario “Approval is renewed only in ready” routes stale implementing consent through designing and ready and says no pending state is produced.
   - Older scenario “Enabled gate allows execute…” still requires `pending-spec-approval` → `spec-approved`.
   - Code allows both states and calls `transition('spec-approved')` (`approve-spec.ts` 93–107). Comment documents the historic drain.
   - The verify artifact contradicts the design. Implementation follows the leftover scenario and violates the design sentence. Spec author should delete one of the two scenarios.

### Test coverage

`approve-spec.spec.ts` still has “given … pending-spec-approval (drain)” around line 192, so the legacy transition is tested. A test that forbids that transition would fail today. Task exclusion and drift-before-approval were not re-read in this pass.

### Summary counts

- Requirements in conflict: 2 scenarios, 1 design rule
- Implementation matches design: no
- Implementation matches both verify scenarios: yes (both behaviors exist)
- Discrepancies: 1
- Test gaps: the suite locks the behavior the design rejects

---

## core:approve-signoff

### Requirements summary

Gate guard; lookup; whole linked files once, lexical, unreadable fails; empty implementation map is valid and distinct from legacy `null`; sign-off requires current completed verification and recommends in-place renewal when stale; success stays in `done`; reconciliation blocks a changed snapshot; fingerprint is the one from the same mutation; failed eligibility adds no sign-off event; input is name and reason; factory reuses tracking and reconciler.

Legacy scenario still present: `pending-signoff` transitions to `signed-off`.

### Implementation status

Disabled gate throws before repository access. Tracking refresh runs, then `reconcile.mutate`. Eligible path records `recordSignoff` with `completed.id` and the fresh complete fingerprint. State stays `done` unless it was `pending-signoff`, which is transitioned to `signed-off`.

Evidence: `approve-signoff.ts` 85–133.

### Discrepancies

1. **Stale or legacy-null completed verification is reported as missing evidence.**
   - Spec: change is `done`, completed verification is stale → no sign-off, recommend in-place renewal.
   - Design: legacy `implementation: null` cannot authorize sign-off; current completed verification is required; do not approve a later snapshot.
   - Code treats `completed === undefined`, `status !== 'valid'`, and `implementation === null` as one outcome and throws `VerificationNotFoundError` (`approve-signoff.ts` 107–110, 140–141).
   - Stale evidence exists. The error says it was not found. No next-action / in-place renewal payload is returned. `VerificationFingerprintMismatchError` is only for a valid concrete fingerprint that differs.

2. **Design “exactly `done`, do not move state” vs historic `pending-signoff` → `signed-off`.**
   - Same split as spec approval. Code 104–133. Verify preview still contains the pending-signoff scenario. Design forbids the move.

Archive and transition do not call this use case to invent verification. Sign-off itself does not call `CompleteVerification`.

### Test coverage

`approve-signoff.spec.ts` had no matches for `stale`, `in-place`, or `VerificationNotFoundError` in this pass. The stale-recommends-renewal scenario looks untested. The pending-signoff drain is likely still tested by analogy with approve-spec; not re-opened here.

### Summary counts

- Delta requirements: 6
- Matching: 4
- Discrepancies: 2
- Test gaps: 1 confirmed (stale sign-off renewal), 1 likely (design ban on pending drain)

---

## core:transition-change

### Requirements summary

Change must exist; refresh default and opt-out; no direct detector; stale approval returns to design instead of a pending hop; valid consent allows normal edges; sign-off check needs current verification; disabled sign-off skips; parked approval failures; task completion; committed recovery survives a failed request and is not rolled back; workflow requires; verifying→implementing does not clear validated artifacts; entering verifying does not create an attempt; exit reruns `verification.current` after hooks; backward movement preserves matching verification; explicit redesign is policy-focused; hooks, persistence, input, factory, historic drain precedence. Truncated tail of the preview was not fully listed; the delta scenarios above were read.

### Implementation status

With a reconciler: refresh flag is forwarded, `reconcile.execute` runs first, a state change throws `InvalidStateTransitionError` and does not continue the requested hop. After before-persist effects, reconcile runs again and predicates are rerun. Entering verifying is an ordinary `transition` inside the final `mutate`; this file does not call `startVerification` or `completeVerification`. `graph impact` on class `CompleteVerification` does not list `transition-change.ts`.

Evidence: `transition-change.ts` 173–184, 278–307, 310–327.

Recovery selection itself is in `selectAutomaticRecovery` (see cross-cutting table). `verifying → verifying` is still a self-transition rejected by `Change.transition`.

### Discrepancies

1. **Committed recovery failure does not carry blockers or next action.**
   - Spec: “Committed recovery survives failed requested transition” — fail with the committed state, blockers, and next action, and do not undo recovery.
   - Recovery is committed by the first `execute` (not rolled back). The throw is `new InvalidStateTransitionError(change.state, requested)` with no `reason`, blockers, or next action (`transition-change.ts` 182–184 and again 282–284).
   - `InvalidStateTransitionError` (`invalid-state-transition-error.ts` 36–58) has only from, to, and an optional `TransitionFailureReason`. It cannot hold blockers or next action.
   - The committed state is the `from` argument, so the message reads as “Cannot transition from 'designing' to '<requested>'”, which is easy to misread as a protocol failure rather than a completed recovery.

2. **Post-hook reconciliation does not refresh implementation tracking.**
   - Design: reconcile again because hooks may modify files or links.
   - Second call is `execute({ name })` (`transition-change.ts` 279). `_refresh` runs only when `refreshImplementationTracking === true` (`reconcile-change-validity.ts` 166–168). Already-linked file bytes are re-read; newly discovered links are not refreshed.

3. **Optional reconciler still broad-invalidates on the way to designing.**
   - `transition-change.ts` 310–326 calls `freshChange.invalidate` for every artifact when `this._reconcile === undefined`. Design says callers must not invalidate outside the coordinator and must remove unconditional invalidate on transition to designing. Config factory always injects the reconciler (`composition/use-cases/transition-change.ts`).

### Test coverage

`transition-change.spec.ts` still covers pending-spec-approval drain (around 498). A search for “committed recovery” / “does not undo” did not show a dedicated test name. `change-validity.spec.ts` covers priority and no forward/self recovery at the pure function (lines 97–217). The use-case error payload (blockers, next action) is not covered by the error type.

### Summary counts

- Delta requirements checked: 8
- Matching: 5
- Discrepancies: 3
- Test gaps: 2 (recovery error payload, post-hook link refresh)

---

## core:get-status

### Requirements summary

Artifact/effective/file state, review summary, blockers, `specDependsOn`, revision shortcut, draft read-only, implementation projection, refresh flag, active status persists recovery once, display status, task counts, predicate rows, not-found, lifecycle routing for preserve vs redesign, schema failure stays read-only, blocker merge rules, attempt vs completed evidence, in-place verification recommendation, factory resolves one reconciler, draft composition does not reconcile.

Design status projection (authoritative for this change):

```ts
ValidityStatusProjection {
  specApproval: ApprovalStatusProjection
  signoff: ApprovalStatusProjection
  verification: VerificationStatusProjection
  automaticReturn: AutomaticRecovery | null
}
```

`ApprovalStatusProjection` includes required, status, optional decision and invalidation. `VerificationStatusProjection` includes `requiredAtCurrentBoundary`, optional `activeAttempt` and `completed`, and `freshness`.

Also: active status always reconciles, including when `ifModifiedSince` matches; may write only when facts change; v1 read without drift must not rewrite the file.

### Implementation status

`GetStatusResult` (`get-status.ts` 257–283) adds optional `validity?: ChangeValidityVerdict`. It does not add `ValidityStatusProjection`. Decision, invalidation, attempt, and completed records are only on `result.change`.

When `reconcile` is injected, `execute` always calls it and never takes the `ifModifiedSince` early return (351–356). `refreshImplementationTracking: false` is passed through; the reconciler skips refresh and still evaluates. Drafts return before that branch. Schema resolution failure after reconcile returns a result that omits `validity` (462–470).

Write suppression: `ChangeRepository.mutate` persists only when `changeMutationStamp` changes. The stamp is `JSON.stringify(changeToManifest(change))`, which is v2-shaped, but an unchanged stamp skips `_persistManifest`. A v1 `get` is tested not to rewrite (`change-repository.spec.ts` 2824–2843). A no-op reconcile sets `changed: false` (`reconcile-change-validity.spec.ts` 126–131). Together this implements “v1 read without drift must not rewrite” and “write only when facts change”, as long as the callback does not touch stamped fields.

`verificationField` (`change-validity.ts` 453–465) returns a single enum. If completed evidence is stale, the result is `'stale'` even when an active attempt also exists. The attempt is still on the aggregate and is not marked completed.

### Discrepancies

1. **`GetStatusResult` is not `ValidityStatusProjection`.**
   - Missing `required`, `decision`, `invalidation` on each gate; missing `requiredAtCurrentBoundary`, separate attempt and completed objects, and `freshness` beside them; `automaticReturn` is `verdict.recovery`, not a sibling of those projections.
   - Evidence: design.md “Status projection”; `get-status.ts` 257–283; no symbol `ValidityStatusProjection`.
   - Spec scenario “Attempt and completed evidence are distinct” can be satisfied by reading `result.change.verification` plus a stubbed verdict. The test does that with a fake reconciler (`get-status.spec.ts` 1168–1203) and does not build the designed projection. A consumer of `result.validity` alone cannot show both records.
   - `verificationField` hides an in-progress attempt whenever completed evidence is already stale (453–461). The spec asks for both records and their freshness separately.

2. **`ifModifiedSince` tests still describe the no-reconciler path.**
   - Implementation with a reconciler ignores the timestamp shortcut, which matches “Matching manifest timestamp does not hide external drift”.
   - `get-status.spec.ts` 914–975 expects an early unchanged result and those cases do not inject a reconciler (the reconciler suite starts at 1132). The new scenario is implemented and not locked by those tests.
   - Refresh-disabled test (271–279) also uses the no-reconciler branch, so it does not prove “skip refresh but still reconcile”.

3. **Schema-failure result drops `validity` after reconciliation may already have written.** The public result then has no validity projection (`get-status.ts` 415–470). Spec asks for a read-only schema-failure view and not to enable a further lifecycle mutation. The omitted field is a projection gap, not a second write.

### Test coverage

Present: stubbed attempt vs completed, stale verification in an earlier phase, committed spec recovery, draft does not reconcile (`get-status.spec.ts` 1132–1281). Present elsewhere: v1 `get` does not rewrite; fresh reconcile `changed: false`.

Missing: real (non-stub) status projection equal to `ValidityStatusProjection`; `ifModifiedSince` plus external drift with the reconciler injected; `refreshImplementationTracking: false` still calls reconcile; status observe of a v1 manifest without drift does not rewrite (only `get` and a real mutation are tested).

### Summary counts

- Delta requirements: 6
- Matching: 3 (reconcile-before-shortcut when injected, draft skip, write suppression in the repository)
- Discrepancies: 3
- Test gaps: 4

---

## core:archive-change

### Requirements summary

Preview is large (hooks, overlap, read-only, delta merge, spec-lock, restore, implementation guards, factory). Delta scenarios read in full:

- “Archive rechecks all live blockers after hooks.”
- “Archived v2 retains audit evidence.”

Design: reconcile before preflight and again after hooks; do not call `CompleteVerification`; archive does not change validity evidence; overlapping peers go through their reconciler.

### Implementation status

`execute` reconciles first and rejects when state is no longer `archivable`/`archiving` (280–286). After prepare/hooks it reconciles again and `postHookValidityBlocksArchive` can stop archive (425–434). No call to `completeVerification` or `startVerification` in this file. Peer overlap uses `this._reconcile.execute` (around 1187–1191).

### Discrepancies

1. **Post-hook reconcile does not refresh implementation tracking** (`archive-change.ts` 426), same as transition. Live file bytes of known links are re-read; new links from hooks are not.

2. **Recovery that leaves `archivable` throws `InvalidStateTransitionError` without blockers or next action** (284–286, 429–431), same payload gap as transition. The first reconciliation is already committed.

No evidence that archive completes verification. That design rule holds.

Pre-existing archive scenarios (spec-lock, batch restore, overlap allow flag) were not re-audited in this pass.

### Test coverage

Named suite: `archive-change.spec.ts` (design also cites a recovery fixture near line 3607). This pass did not re-read those assertions. Absence of `completeVerification` in the use case is the compliance evidence for “archive does not complete verification”.

### Summary counts

- Delta requirements: 2 design rules plus 2 scenarios
- Matching: archive does not complete verification; second reconcile exists
- Discrepancies: 2 (post-hook refresh, error payload)
- Test gaps: 1 (post-hook new links; error payload)

---

## core:invalidate-verification

### Requirements summary

Result exposes stale projection, `invalidated: true`, sign-off consequence, recovery, and change. Attempt-only evidence throws `VerificationNotFoundError` without mutation. Repeat is `invalidated: false`, original cause kept, no duplicate event. Boundary stays in place, sign-off becomes stale, spec approval stays. No transition, tests, validation, approval, or new baseline. Factories match and reject mixed arguments.

### Implementation status

`InvalidateVerification.execute` loads the change, throws `VerificationNotFoundError` when `completed` is absent, and returns a no-op when status is already `stale` before calling the reconciler. Otherwise it submits `intent: { type: 'verification-invalidation' }`.

The reconciler’s `applyIntent` stales valid completed verification and a valid sign-off, and does not push spec approval (`reconcile-change-validity.ts` 423–426). `selectAutomaticRecovery` ignores verification staleness. `Change.transition` rejects a self-transition. The use case does not call start, complete, or a test runner.

`StartVerification` refreshes tracking, runs injected implementation checks, and only then `startVerification` inside `mutate`. Failure to fingerprint does not call `startVerification`. `CompleteVerification` compares with `compareValidityFingerprints` and does not run tests. Mismatch throws `VerificationFingerprintMismatchError` after the reconciler callback returns, so pre-pass drift can already be committed and the baseline is not replaced (complete is not called).

Design `StartVerificationDeps` has no `schemaProvider`. Code adds it (`start-verification.ts` 37–44) so checks can build a context. Checks use `to: change.state` (a self-edge context) at lines 113–120.

### Discrepancies

1. **Already-stale invalidation skips reconciliation.**
   - Repeat scenario is satisfied (`invalidated: false`, no second event) by returning the pre-reconcile snapshot (`invalidate-verification.ts` 76–85).
   - New artifact drift discovered at the same time is not applied. Design calls the repeat a no-op for verification invalidation, not a full observe. Spec does not require a second drift pass. Recorded as a behavior limit, not a failed scenario, unless reviewers want every invalidate call to observe.

2. **`nextAction` on a real invalidation is `/specd-verify` or null, not the start/checks/complete command.**
   - Spec: progress blocked with start/checks/complete guidance in the current state.
   - `nextFrom` (`invalidate-verification.ts` 129–143) sets `command` to `/specd-verify` when state is `verifying` or `done` and recovery is null. Blockers may still contain `command: 'specd changes verification start <name>'` from `applyIntent` (437–445). The two channels differ.

3. **Start deps and check context differ from the design signature.** Extra `schemaProvider`. Readiness checks run on a self-transition attempt (`from === to`). If `impl.filesResolved` / `impl.linksInScope` are bound only to real edges, they can skip or fail differently from “the normal check execution context” in the design. This is outside `core:invalidate-verification`’s own scenarios and is part of the design verification contract the user asked to compare.

No self-transition is selected for verification invalidation alone. Dependent valid sign-off past `done` can still recover to `done` via sign-off priority. That matches design (sign-off recovery, not verification recovery) and can move state at an archive boundary even though the spec sentence says “in the current state”.

### Test coverage

`invalidate-verification.spec.ts` has two tests: stale once including sign-off (line 67) and attempt-only rejection (line 81). Design also names idempotent repeat, factory equivalence, and in-place blocking. Only two `it` blocks were found. Repeat idempotence and “no self-transition” are not named in that file.

`change-validity.spec.ts` covers “verification staleness does not move lifecycle”. `start-verification.spec.ts` and `complete-verification.spec.ts` exist per the design map; this pass did not re-read them.

### Summary counts

- Requirements: 6
- Matching: 4
- Discrepancies: 2 inside this spec, plus 1 design-contract note on start
- Test gaps: repeat idempotence and no-self-transition are not in the two-test file

---

## Design comparison (requested)

### ReconcileChangeValidity is the only mutation coordinator

Config-based factories for status, transition, archive, validate, edit, and invalidate all resolve one shared reconciler. Edit scope edits throw if it is missing. Invalidate’s constructor requires it.

Bypasses that remain:

- `TransitionChange` designing hop calls `Change.invalidate` when the reconciler argument is omitted.
- `ValidateArtifacts` calls `Change.invalidate` when the reconciler argument is omitted.

Those paths violate design invariant 2 and “Callers must not invoke `Change.invalidate` … outside this coordinator” if a host uses the deps constructor without the reconciler. Kernel composition does not omit it.

### Recovery priority and no self-transition

`selectAutomaticRecovery` order is: required spec consent after `designing` → `designing`; else required sign-off after `done` → `done`; else `workflow: redesign` with non-task review after `designing` → `designing`; else null. `isAfter` is a strict index compare, so the current state is never the target. `Change.transition` throws if `from === to`. Verification staleness is not a recovery cause. This matches the design priority table.

### Verification start / complete / invalidate

- Start: any caller with the use case; checks before baseline; new attempt via `startVerification`; no lifecycle move in that use case.
- Complete: requires an active attempt; equality records completion; no test run; mismatch does not replace the baseline.
- Invalidate: completed evidence required; attempt-only throws; valid evidence goes through `verification-invalidation`; already stale is a no-op; does not start an attempt.

Gaps: extra `schemaProvider`; self-edge check context; stale repeat skips observe; next action skill name vs start command.

### Status reconcile and v1 no-rewrite

Active `GetStatus` with a reconciler always reconciles, including when `ifModifiedSince` matches. `mutate` writes only when the manifest stamp changes. v1 `get` is tested not to rewrite. A no-op reconcile reports `changed: false`. This matches “may write only when facts change” and “v1 read without drift must not rewrite”.

The status DTO is still `ChangeValidityVerdict`, not `ValidityStatusProjection`.

### Archive does not complete verification

Confirmed. Archive reconciles and checks. It does not call `CompleteVerification`.

### GetStatusResult vs ValidityStatusProjection

Not conformant. See `core:get-status` discrepancy 1.

---

## Totals

| Spec                         | Discrepancies | Notes                                                 |
| ---------------------------- | ------------- | ----------------------------------------------------- |
| core:create-change           | 0             | Delta policy default matches                          |
| core:edit-change             | 1             | Scope intent always stales spec approval              |
| core:invalidate-change       | 2             | Force guard and error text                            |
| core:validate-artifacts      | 1             | Optional invalidate bypass                            |
| core:approve-spec            | 1             | Pending drain vs design                               |
| core:approve-signoff         | 2             | Stale reported as not found; pending drain            |
| core:transition-change       | 3             | Error payload, post-hook refresh, optional invalidate |
| core:get-status              | 3             | Projection shape, test/shortcut split, schema drop    |
| core:archive-change          | 2             | Post-hook refresh, error payload                      |
| core:invalidate-verification | 2             | Stale path skips observe; next-action channel         |

Graph limitation: index was stale. Findings above were checked against source after graph location.

ISSUES
