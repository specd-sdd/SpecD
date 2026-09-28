# Simple verification follow-up — 2026-09-25

Attempt: `verification-attempt-6`.

Result: **BLOCKED — artifact review required; verification not completed**.

## Confirmed checks

- CLI verification start succeeded from `archivable`, persisted attempt 6, and superseded attempt 5 without a lifecycle transition. Subsequent status loaded attempt 6 successfully.
- Executed `pnpm --filter @specd/core exec vitest run test/domain/entities/change.spec.ts test/application/use-cases/edit-change.spec.ts test/infrastructure/fs/manifest-change-loader.spec.ts`: 3 files, 149 tests passed.
- Tasks artifact validated; status reports 172/172 complete.

These checks are focused evidence, not a complete verification of all 25 specs. Exit hooks and verification completion have not been executed in this follow-up.

## Contract discrepancies in merged core:change verification

Source: `changes spec-preview versioned-approval-invalidation core:change --artifact verify --format text`.

### 1. Unconditional scope rollback

The retained scenario `Spec added after creation` requires both an `invalidated` event with cause `spec-change` and a transition back to `designing` whenever a spec is added. The retained `Scope change invalidation records spec-change cause` also requires the broad invalidation event for scope edits.

Current implementation separates scope mutation from validity reconciliation: `EditChange` calls `replaceSpecIds` then `reconcileAfter({ type: 'scope-change', ... })` (packages/core/src/application/use-cases/edit-change.ts:269). Recovery is conditional, and approval invalidity uses precise projection events. The legacy entity helper `updateSpecIds` still appends artifact invalidation, but `Change.invalidate` explicitly does not perform lifecycle recovery (packages/core/src/domain/entities/change.ts:957). Thus neither path supports the scenario's unconditional rollback contract.

Design section describing central reconciliation (design.md:647) assigns recovery to the coordinator; scope-aware consent and preserve semantics do not require unconditional rollback for every scope edit. Existing tests cover required-gate recovery and scope reorder without consent invalidation.

Recommendation: replace the broad scenarios with conditional cases for required spec consent, no-gate preserve behavior, canonical-set reordering, and precise retained audit events. Do not restore unconditional invalidation to satisfy an obsolete scenario. If a scenario specifically targets the legacy entity helper, name that API and distinguish its artifact event from application-level reconciliation.

### 2. Unconditional artifact reopening on design return

The retained scenario `Returning to designing downgrades files to pending-review` requires every non-drifted file to become pending-review, without specifying artifact policy or task exclusions.

The new model separates lifecycle transitions from focused artifact invalidation. `Change.transition` appends lifecycle evidence without rewriting artifacts (packages/core/src/domain/entities/change.ts:913); `Change.invalidate` applies the selected policy and receives task artifact exclusions. The merged verification also contains policy-aware preservation and task-exclusion scenarios. The unrestricted older scenario is not a valid universal expectation under this model.

Recommendation: describe the explicit review intent and policy in GIVEN/WHEN, assert only the affected/propagated non-task files reopen, preserve unrelated files according to policy, and keep hasTasks artifacts excluded. Separately cover a lifecycle move with unchanged inputs preserving evidence.

## Remaining work

Review and correct the contradictory merged contract before continuing scenario verification. Revalidate changed artifacts, start a fresh attempt if fingerprinted inputs changed, rerun the required verification work and exit hooks, then complete only on success. Attempt 6 remains active; completed evidence 4 remains stale. No archive or lifecycle transition was performed in this follow-up.
