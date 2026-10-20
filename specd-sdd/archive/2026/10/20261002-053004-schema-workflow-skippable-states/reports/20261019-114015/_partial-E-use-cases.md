# Batch E - use cases (audit 20261019-114015)

Specs read through `changes spec-preview ... core:<name>` (merged deltas). Tests run: approve-spec/approve-signoff app+composition specs, 44 pass / 0 fail.

## core:approve-spec

### Requirements Summary

Gate guard order (gate -> load -> ResolveChangeSchema (identity mismatch propagates) -> actor); reconcile-then-approve in one serialized mutation; ready-only consent with drain from pending-spec-approval; single decorated actor reused; two factory forms via resolveApproveSpecDeps.

### Implementation Status

- Gate guard order: OK `use-cases/approve-spec.ts:79-94` (gate, get, resolveChangeSchema at 88, actor.identity at 94 - after schema).
- Single actor into reconcile.mutate and recordSpecApproval: OK `approve-spec.ts:94-110`.
- Fingerprint via ValidityFingerprintService.specApprovalFingerprint, blocking artifact check, task artifacts skipped (`hasTasks`): OK `approve-spec.ts:100-104,139-165`.
- Ineligible/state/fingerprint outcomes throw after mutation (reconciliation persisted by `mutate`): OK `approve-spec.ts:115-127`.
- Factory both forms + resolver deps (no kernel): OK `composition/use-cases/approve-spec.ts:45-60,95-130`; passes resolveChangeSchema.

### Discrepancies

- LOW: verify.md scenario "Enabled gate allows execute... pending-spec-approval -> spec-approved" and code agree (drain). No drift.
- None HIGH/MEDIUM.

### Test Coverage (test/application/use-cases/approve-spec.spec.ts)

- Gate disabled: covered :344-372. Change not found: covered :429. Single decorated actor: covered :118 (asserts identity called once, same object).
- Sovereign schema resolution: covered :391 (keyed provider mock `ref === 'schema-a'`, asserts get called with 'schema-a'). Identity mismatch propagates: covered :411 (keyed mock). Weak: does not assert actor.identity not called on mismatch (spec says "before the actor is resolved") - LOW.
- Ready consent / renewal keeps history: covered :139,:161. Drift prevents approval: covered :192. Drain: covered :245-340.
- Task artifacts excluded / missing required / canonical scope fingerprint: covered at service level test/application/services/validity-fingerprint-service.spec.ts:190,215 (indirect, acceptable).
- Approval renewed only in ready from implementing: no dedicated use-case test here (reconciler tests cover) - LOW/weak.
- Factory scenarios: covered test/composition/use-cases/approve-spec.spec.ts (config, deps, deps+options rejects). "Does not bootstrap a kernel": weak (structural).

### Summary

Requirements 9/9 compliant. Scenarios: 17 covered/indirect, 3 weak, 0 missing. No HIGH/MEDIUM.

## core:approve-signoff

### Requirements Summary

Same gate guard order as approve-spec; refresh implementation tracking then reconciler mutation; verification eligibility only when `verifying` enabled; distinct verification error types; whole-file implementation fingerprint; factories.

### Implementation Status

- Guard order: OK `use-cases/approve-signoff.ts` (gate, get, ResolveChangeSchema, `isWorkflowStepEnabled('verifying', schema)`, refresh, actor.identity).
- Verifying disabled skips verification evidence/eligibility/fingerprint compare; recordSignoff without verification id: OK (branches on `verifyingEnabled`).
- Distinct outcomes: missing/active/stale/mismatch mapped to separate outcomes: OK.
- Factory: OK, passes refreshImplementationTracking + resolveChangeSchema (`composition/use-cases/approve-signoff.ts:45-60,108-130`).

### Discrepancies

- None HIGH/MEDIUM. LOW: same "actor not resolved on mismatch" assertion absent.

### Test Coverage (test/application/use-cases/approve-signoff.spec.ts)

- Gate disabled :459; not found :527; single actor :159; identity mismatch :179 (keyed mock); sovereign resolution :505.
- Verifying disabled: no evidence :199; active-only ignored :211 (covered).
- Verification errors distinct: not found :223, in progress :231, stale :240, legacy-unknown :255, mismatch :280 (all covered).
- Done consent/renewal :311,:326; drain :362+; wrong state :489.
- Whole-file fingerprint / empty map / unreadable: service-level validity-fingerprint-service.spec.ts:130,220 (empty map observed valid: weak - not located).
- Reconciliation blocks changed snapshot / atomic: weak at use-case level (reconciler specs cover).
- Factories: composition/use-cases/approve-signoff.spec.ts covered.

### Summary

Requirements 9/9 compliant. No HIGH/MEDIUM.

## core:validate-artifacts

### Implementation Status

- Sovereign schema via ResolveChangeSchema before any mutation: OK `use-cases/validate-artifacts.ts:181-185` (get -> resolve -> then validation); SchemaProviderIdentityMismatchError propagates before state change.
- Reconciler integration, hasTasks exclusion, ctor with ListWorkspaces and resolveChangeSchema (:138,:166): OK.
- Spec has no verifying-disabled scenario for this use case (previous audit note on verifying not applicable to this spec text).

### Discrepancies

- None HIGH/MEDIUM. Orphan JSDoc check (regex for adjacent `*/ /**` blocks) in all 5 use-case files: none found. eslint on the 5 files: clean.

### Test Coverage

- Sovereign resolution with differing default: covered `validate-artifacts.spec.ts:~170-182` (keyed mock, asserts get('schema-a')).
- Identity mismatch: covered :190-207 (keyed mock `ref === 'schema-a'`).
- Change not found, reconciliation around validation (real ReconcileChangeValidity :4174), other scenarios: existing, suite passes (whole batch run 314/314 passed, 40 files).

### Summary

Compliant, no HIGH/MEDIUM.

## core:archive-change

### Implementation Status

- Resolves sovereign schema before reconcile (`archive-change.ts:288-293`); MaterializeSpecMetadata called with `{specId, policy:'force', schemaName: schema.name()}` (:605-609). schema.name() equals change.schemaName because ResolveChangeSchema validates provider identity. OK. Previous failure (materialize with workspace default) is resolved in code.
- Verifying disabled / stale evidence under real reconciler: no code special-casing; handled via reconciler verdict and `postHookValidityBlocksArchive` (:1417) and ArchiveImplementationStateError. OK.
- Post-hook failure semantics unchanged.

### Discrepancies

- MEDIUM (test evidence, not code): verify scenario "Post-archive metadata is materialized with the change schema" (change schema `custom-workflow` differing from workspace default) is only weakly covered. Test `archive-change.spec.ts:~1505-1535` asserts `schemaName: schema.name()` but uses `makeSchemaProvider(schema)` returning the same schema for any ref and a change with default schemaName, so it passes even if the workspace default were used. The keyed `custom-workflow` test (:334-357) uses `makeMaterializeMetadata()` and never asserts the materialize call arguments. Code interpretation: implementation correct. Spec interpretation: scenario requires discriminating evidence. Fix: in the :334 test use a mock materialize and assert `toHaveBeenCalledWith(objectContaining({schemaName:'custom-workflow'}))` with a modified spec.

### Test Coverage

- Verifying disabled with real reconciler: covered `archive-change.spec.ts:387-391` (describe at :360 'verification with the real validity reconciler').
- Verifying enabled, no evidence: covered :393-401 (ArchiveImplementationStateError "Completed verification is required").
- Verifying enabled, stale evidence, nothing published: covered :403-445 (archiveSpy not called).
- Sovereign schema/mismatch: covered :314-357 (keyed mock).
- Remaining 100+ tests pass (archive-change + batch-restore specs pass).

### Summary

Code compliant; 1 MEDIUM test-evidence gap (materialize schemaName discrimination). Previous HIGH test gaps for real-reconciler verification are resolved.

## core:edit-change

### Implementation Status

- Sovereign schema resolved once before mutation when specs change (`edit-change.ts` execute: resolveChangeSchema only inside `hasSpecChanges`); compat guardrail uses change schema, uninitialized spec adopts change schema: OK.
- Scope mutation via `reconcile.mutate` + `replaceSpecIds` + `ctx.reconcileAfter` (no updateSpecIds): OK. unscaffold after persist, refresh on scopeChanged independent of invalidated: OK. Output contract fields: OK.
- Dead branch: description/policy-only path returns `invalidated:false` constant, so its later `if (persisted.invalidated ...)` block is unreachable - LOW cleanup.

### Discrepancies

- MEDIUM: Spec "Dependencies": "the same decorated identity is used by the edit and reconciliation audit events." EditChange resolves `actor = await this._actor.identity()` but calls `this._reconcile.mutate({ name: input.name }, ...)` without `actor` (edit-change.ts `_executeScopeEdit`). `ReconcileChangeValidity` falls back to `input.actor ?? deps.actor.identity()` (reconcile-change-validity.ts:128,147), so a second identity resolution happens and may diverge (privacy-decorated resolvers with randomized/fallback identity). Implementation-bug interpretation: pass `actor` into `mutate`, matching approve-spec/approve-signoff. Spec-drift interpretation unlikely: approve-\* specs impose the same single-identity rule. No test asserts identity call count for edit-change (grep 'identity' in edit-change.spec.ts: 0 matches).

### Test Coverage (edit-change.spec.ts)

- Not found :46, no-op :58, add/dedupe :71-87, seeding :101,:132, remove/absent :167,:183, description :198, policy :214, combined :235, invalidation/refresh :260,:278, reconciled scope (return to designing, reorder, atomic reject) :325-480, schema compat incl. sovereign/fail/uninitialized :485-660: covered.
- Missing: single-identity-for-edit-and-reconcile assertion.

### Summary

1 MEDIUM implementation finding (double actor resolution); 1 LOW.

## Cross-cutting

Project specs (architecture/conventions/error-handling/logging): no violations seen in the 5 use cases; Logger.debug used in archive; typed errors thrown. Focused items: archive passes change schema name (yes); real-reconciler verifying tests exist; identity mismatch propagation tested for approve-spec, approve-signoff, validate-artifacts, archive; keyed provider mocks present; orphan JSDoc none.

BATCH VERDICT: FAIL
