# Partial audit — Core application use cases and reconciliation

## Requirements summary

Scope: `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:invalidate-change`, `core:edit-change`, `core:transition-change`, `core:get-status`, `core:archive-change`, `core:create-change`, and `core:invalidate-verification`.

The merged contracts require one serialized reconciliation authority; decorators for approval actor name/email resolution; scope-aware spec approval and implementation-aware sign-off; precise policy-controlled artifact review; mandatory gate recovery precedence; operational status reconciliation; explicit verification start/complete/invalidate use cases independent of lifecycle movement; registered implementation readiness checks before start and on the implementing exit; fingerprint equality at completion; and phase-aware stale-verification guidance.

## Implementation status

**PASS.** The use cases and composition factories conform to the merged behavior:

- `ReconcileChangeValidity` is the central mutation boundary for automatic drift, projection changes, and mandatory recovery. Factories reject dependency sets that omit it where it is required.
- approval use cases use the shared privacy-decorated actor resolver; full names/emails are not bypassed by new composition paths.
- spec approval is available only in `ready`, after validated artifact inputs, and records the canonical scope fingerprint.
- sign-off records the completed verification identity and the implementation fingerprint; stale verification invalidates dependent sign-off without invalidating unrelated spec consent.
- `ValidateArtifacts`, `EditChange`, `TransitionChange`, `GetStatus`, archive peer invalidation, and explicit invalidation delegate validity decisions to the reconciler rather than calling aggregate invalidation ad hoc.
- ungated `workflow: preserve` can retain `implementing` while non-task review blocks forward progress; a required stale spec approval returns to `designing`; a required stale sign-off returns later phases to `done`.
- `EditChange` uses `ListWorkspaces`, separates `scopeChanged` from actual validity changes, refreshes implementation tracking for effective scope edits, and returns canonical blockers/guidance.
- `CreateChange` receives resolved project policy defaults through composition; explicit input overrides the configured default, and the native fallback remains downstream/preserve.
- `StartVerification` refreshes tracking, executes the registered `impl.filesResolved` and `impl.linksInScope` operation checks, then captures a complete baseline without moving lifecycle state.
- `CompleteVerification` requires an active attempt and an equal fresh fingerprint; mismatch or unreadable inputs record no successful evidence.
- `InvalidateVerification` requires completed evidence, is idempotent, retains the original invalidation reason, preserves the fingerprint/history, and returns `/specd-verify` in `verifying`, `done`, `archivable`, and `archiving` unless higher-priority gate recovery applies.
- archive overlap invalidation applies each peer's policy inside serialized reconciliation. Preserve may retain a peer in place; redesign or mandatory gates control recovery. Metadata regeneration uses `MaterializeSpecMetadata`.

## Discrepancies

None found in this batch.

The prior attempt-8 findings U1-U8 are resolved in the merged contracts and implementation: operational status reads are distinguished from immutable snapshots; direct invalidation prescriptions were removed; archive peers obey policy/gates; metadata ownership is consistent; EditChange uses `ListWorkspaces`; implementation-only retry preserves unchanged validation; late verification invalidation has canonical guidance; and config factories inject project defaults.

## Test coverage

Representative scenario coverage includes:

- `packages/core/test/application/use-cases/reconcile-change-validity.spec.ts`: one-time reopening, idempotency, no-op observation, and late-state recovery.
- `packages/core/test/application/use-cases/approve-spec.spec.ts` and `approve-signoff.spec.ts`: state/gate constraints, fingerprint capture, stale evidence, and append-only renewal.
- `packages/core/test/composition/privacy-decorated-identity.spec.ts`: shared decorated identity across approval and verification factories/events.
- `packages/core/test/application/use-cases/edit-change.spec.ts`: canonical scope changes, set-equivalent no-ops, tracking refresh, policy-only edits, projection changes, and `ListWorkspaces`.
- `packages/core/test/application/use-cases/transition-change.spec.ts` and `reconciled-transition-status.spec.ts`: reconciliation before transition, committed recovery, registered checks, task completion, and retry preservation.
- `packages/core/test/application/use-cases/get-status.spec.ts`: materialized validity, blockers, next action, active attempt versus completed evidence, verification-in-place guidance, and archive overlap preflight.
- `packages/core/test/application/use-cases/archive-change.spec.ts`: live preflight, peer policy, serialized invalidation, gate recovery, metadata materialization, and archive rollback paths.
- `packages/core/test/application/use-cases/start-verification.spec.ts`, `complete-verification.spec.ts`, and `invalidate-verification.spec.ts`: attempt lifecycle, readiness failure before baseline, mismatch handling, attempt-only rejection, repeated invalidation, late-state guidance, and gate precedence.
- `packages/core/test/composition/use-cases/verification-factories.spec.ts` and `mandatory-validity-reconciler.spec.ts`: canonical dependency wiring and invalid dependency forms.

All of this coverage is included in the passing Core total of **2,758 tests**.

## Missing tests

No material missing test was identified. The explicit `archivable` and `archiving` invalidation cases, repeated-reason behavior, mismatch/no-success behavior, and configured-default composition paths cover the gaps called out by the previous audit.

## Spec dependency chain

The direct dependencies on change, repository port, schema format, composition/resolver, workflow/lifecycle, transition checks, tracking, materialization, storage, and global architecture/error conventions were checked. Ownership stays within the declared package boundaries and no circular dependency was introduced.

## Summary counts

- Specs audited: 10
- Merged scenarios inventoried: 460
- Confirmed discrepancies: 0
- Material missing tests: 0
- Result: PASS
