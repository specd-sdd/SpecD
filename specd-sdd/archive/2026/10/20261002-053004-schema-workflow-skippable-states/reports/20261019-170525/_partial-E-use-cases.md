# Batch E - use cases audit (attempt 15)

## core:approve-spec

- Impl: approve-spec.ts:84-134 gate first (:85), load (:89), ResolveChangeSchema (:94) before actor (:100), single actor passed into reconcile.mutate and record (:101,:115). blockingArtifact :149. ✅ all requirements.
- Tests: approve-spec.spec.ts: single actor :118, gate disabled :344, not found :429, sovereign :390, mismatch :411, drift :192, renewal history :161, drain :245; composition tests composition/use-cases/approve-spec.spec.ts:22,29,43. All scenarios covered.
- LOW (carry-over): mismatch test :411 doesn't assert actor.identity not called (impl order is correct, :94 before :100).

## core:approve-signoff

- Impl: approve-signoff.ts: gate :86, load :90, schema :95, verifyingEnabled via isWorkflowStepEnabled :102, refresh :104, actor :105 (once, shared with mutate). Distinct verification errors :166-:178. Verifying-disabled path skips evidence :113,:141. ✅ all.
- Tests: approve-signoff.spec.ts single actor :159, mismatch :179, disabled verifying :196/:199/:211, errors :222-:280, done :310/:326, drain :362, gate :459, sovereign :505, not found :527; composition tests :22/:29/:44. Covered.
- LOW (carry-over): mismatch test doesn't assert actor not resolved.

## core:edit-change

- Impl: edit-change.ts: no-op early return :134-136 (before actor); actor resolved once :138 and passed into `_reconcile.mutate({name, actor})` :227 and `updateDescription(..., actor)` :230; reconciler uses `input.actor ?? ...` (reconcile-change-validity.ts:128,147) so no second resolution. Sovereign schema once :143; compat check :149-160; replaceSpecIds :251 + ctx.reconcileAfter :257 (no updateSpecIds/second schema get); seed specDependsOn :252-256 (no overwrite :253); unscaffold :262-264; refresh on scopeChanged only :265-273 (independent of validityChanged); output contract :275-288; constructor requires reconcile :107. All requirements ✅.
- PRIOR MEDIUM (1) RESOLVED: double actor resolution fixed (:138 -> :227); test edit-change.spec.ts:565 'resolves the actor once...' asserts identity called 1x with real ReconcileChangeValidity.
- Discrepancies: LOW (carry-over) description/policy-only path (:172-205) has unreachable `persisted.invalidated` branches (always false) - dead code, behaviour per spec. LOW (new/nuance) actor resolved at :138 before knowing a scope edit is a canonical no-op (e.g. remove+re-add same spec); spec Constraint says actor only on persistence-worthy change. Mitigated: that path still runs reconcile.mutate which may persist; ambiguous, no fix required.
- Tests (edit-change.spec.ts): not-found :47; no-op :59; add :72/:88; seeding :102/:133; remove :168/:184; description :199; policy :215; combined :236; invalidation/refresh :261/:279; reconciled scope (spec returns to designing, reorder, atomic rollback) :356/:400/:435; compat/sovereign/uninitialized :486/:523/:542/:611/:640/:671. Factory: composition/use-cases/mandatory-validity-reconciler.spec.ts, barrel-kernel-coverage.spec.ts.
- WEAK (LOW): no use-case-level assertion that `unscaffold` is called with removed IDs / not called on add (helpers.ts:300 stub is a no-op; only infra change-repository.spec.ts tests unscaffold); no explicit remove+re-add no-op, repeated-same-policy no-op, or description-only-on-spec-approved assertions found by grep (partially covered by 'updates the invalidation policy'/'no-op edits'). These are unchanged-behaviour scenarios, pre-existing, not new to this change.

## core:archive-change

- Impl (archive-change.ts): mandatory reconcile :262 (throws InvalidCompositionFactoryArgumentsError); sovereign schema :285-290; reconcile :295 then post-hook reconcile with tracking refresh :397; postHookValidityBlocksArchive :413; predicates rerun :417+ (schema-workflow verifying-disabled handled by check registry/reconciler); recovery diagnostic archiveRecoveryError :300/:403; allowOutOfScope :320,:383,:635; readOnly runner :1478; identity mismatch :1472; post-archive materialize with `schemaName: schema.name()` :605-608 (== change.schemaName after identity validation). ✅.
- PRIOR MEDIUM (2) RESOLVED: archive-change.spec.ts:608 'materializes metadata with the change schema when the workspace default differs' uses schemaName 'custom-workflow', asserts every materialize call has {specId, policy:'force', schemaName:'custom-workflow'} and `get` never called with 'workspace-default'. Discriminating.
- Verifying-disabled scenarios (both variants): archive-change.spec.ts:360-410 'verification with the real validity reconciler' (disabled :387 passes; enabled/no evidence :393 -> ArchiveImplementationStateError; stale :402). Reconciler required: :186. Sovereign: :315/:335 (get called with 'custom-workflow' :356). ReadOnly guard :3510; open-file/out-of-scope: :3566/:3629/:3721. Remaining ~190 scenarios (publication, batch restore, spec-lock, hooks, overlap) unchanged by this change; extensive tests exist (archive-change.spec.ts 113 cases + archive-change-batch-restore.spec.ts). "Enter ready fails readOnly runner" and "Open file blocks implementing->verifying / same skippable flag" belong to transition/get-status (outside batch E use cases; same runner registry).
- Discrepancies: none HIGH/MEDIUM.

## core:validate-artifacts

- Impl (validate-artifacts.ts): ChangeNotFoundError :179; sovereign schema via ResolveChangeSchema :181-186 (before any mutation; identity mismatch propagates); evaluateLifecycleVerdict once with empty checksByTarget :231 + in-memory markVerdictComplete :237/:466/:639; topologicalOrder :252; skipped optional/dependency satisfied :318,:353,:391; hasTasks excluded from drift :313; pending-parent context message :792-796; persistence via `_reconcile.mutate` (no Change.invalidate, no raw get/save) markComplete + setSpecDependsOn :735-742; reconciler required in constructor :160-165. No gatherPredicateSnapshots in src. All requirements ✅.
- Tests (validate-artifacts.spec.ts, 94 cases): not-found :103; sovereign :162; identity mismatch :186; skipped optional :234; dep blocked :323/:388/:2212; dep complete/skipped :513/:580; bypass :1083; markComplete/mutate :1154/:1203/:1291; topological order :4083; reconciler required :4147; stale-before-hash and task exclusion :4197/:4240/:4297; dependsOn :2546/:2794/:2907. Factory: referenced in barrel-kernel-coverage.spec.ts / mandatory-validity-reconciler.spec.ts. Covered.
- Discrepancies: none HIGH/MEDIUM. LOW: `_reconcile.mutate` only invoked when drift/completions/deps exist (:731-735) - consistent with spec (nothing to persist otherwise).

## Prior-finding confirmation

- MEDIUM 1 (edit-change double actor): RESOLVED - edit-change.ts:138,:227; test edit-change.spec.ts:565.
- MEDIUM 2 (archive custom-workflow discriminating test): RESOLVED - archive-change.spec.ts:608-651.
- LOW 1 (mismatch tests don't assert actor unresolved): still open, approve-spec.spec.ts:411, approve-signoff.spec.ts:179; impl order correct (schema resolution precedes actor).
- LOW 2 (implementation-fingerprint scenarios only at service level): unchanged, accepted.
- LOW 3 (unreachable `invalidated` branch edit-change.ts:188-203): unchanged, dead code.

## Summary

Specs: 5. Requirements non-compliant: 0. HIGH 0, MEDIUM 0, LOW 4 (carry-overs + edit-change unscaffold use-case-level test weak). No new/changed-behaviour scenario lacks test evidence.

BATCH VERDICT: PASS
