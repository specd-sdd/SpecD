# Delegated use-case audit — verification-attempt-8

Read-only audit; no lifecycle or verification commands executed by this delegate. Scope was narrowed by the parent on resumption to confirmed discrepancies. This is **not an exhaustive scenario pass**: merged content for the ten assigned specs was inspected, but not every legacy scenario was independently traced through tests. Package test execution belongs to the parent. Do not count unreviewed scenarios as passing.

## Findings

### U1 — GetStatus retains contradictory read-only and unconditional-design contracts

Merged `core:get-status` contains the new Operational status reconciliation requirement and the old Constraints statement from `specs/core/get-status/spec.md:251`: “The use case does not modify the change — it is a read-only query.” Active status explicitly reconciles at `packages/core/src/application/use-cases/get-status.ts:448`; the authoritative design at `design.md:912` requires that behavior. The adjacent old constraint also excludes artifact reads outside checks, whereas reconciliation fingerprints files.

The merged scenario `review.required becomes true when any file is pending review` (`specs/core/get-status/verify.md:21`) requires `review.route=designing` without specifying workflow policy, task capability, or gate recovery. New merged requirements explicitly permit review in the active phase under ungated preserve and exclude task-only automatic review. This scenario is under-specified and cannot be universally satisfied alongside the new contract.

Disposition: artifact contradiction, not evidence that operational reconciliation is incorrect. Amend Constraints and qualify the scenario with non-task artifacts plus redesign policy or required gate recovery; add a separate preserve case. Also align the old constraint that only SchemaNotFoundError is caught with the new design requiring degradation for schema-provider failures generally.

### U2 — ValidateArtifacts retains forbidden independent invalidation in Constraints

Merged `core:validate-artifacts` retains `specs/core/validate-artifacts/spec.md:329`, requiring the use case to call `change.invalidate('artifact-drift', actor, ...)`, while its new requirement explicitly forbids broad independent `Change.invalidate` and mandates the single reconciler. The implementation uses `_reconcile.mutate` at `packages/core/src/application/use-cases/validate-artifacts.ts:732` and requires that dependency at lines 156–162.

The adjacent constraint at `specs/core/validate-artifacts/spec.md:328` attributes drift to repository load; the new Policy-aware drift materialization requirement attributes decision/application to the shared evaluator/reconciler. Distinguish read-only physical facts from persisted validity effects instead of requiring two owners. The constructor sketch also omits the now-required reconciler.

Disposition: amend residual contract text; reintroducing independent invalidation would violate design. Scenario “Validation cannot erase detected drift” is consistent with the new path; old missing-file scenario explicitly referring to `Change.invalidate` should describe observable policy-aware effects instead.

### U3 — Archive overlap scenarios still prescribe unconditional redesign and direct invalidation

Merged `core:archive-change` retains scenarios from `specs/core/archive-change/verify.md:155` and `:156` requiring both overlapping peers to return to designing regardless of their policy/gates. Line 167 requires the callback to call `change.invalidate(...)` directly. Actual `_invalidateOverlappingChanges` delegates a `spec-overlap-conflict` intent to the reconciler (`packages/core/src/application/use-cases/archive-change.ts:1195`). Canonical recovery is policy/gate-aware.

Disposition: qualify redesign expectations and add ungated-preserve coverage; assert atomic reconciler effects rather than the obsolete method call. This is a scenario/design contradiction, not a reason to restore unconditional rollback.

### U4 — Archive factory scenario names a dependency prohibited by its merged requirement

Merged scenario “resolveArchiveChangeDeps does not resolve GenerateSpecMetadata or SaveSpecMetadata directly” still requires `regenerateMetadata: RegenerateSpecMetadata` (`specs/core/archive-change/verify.md:843`). The merged factory requirement explicitly says not to resolve `regenerateMetadata`; it requires MaterializeSpecMetadata. Current factory agrees with the requirement: `packages/core/src/composition/use-cases/archive-change.ts:143` resolves `materializeMetadata`.

Disposition: update the scenario and its title/assertions to MaterializeSpecMetadata. This discrepancy predates the validity logic but remains in the merged acceptance contract.

### U5 — EditChange constructor scenario still requires a repository map

`specs/core/edit-change/spec.md:115` and `specs/core/edit-change/verify.md:221` remain in the merged artifacts and require `ReadonlyMap<string, SpecRepository>` in the constructor. Actual constructor takes ListWorkspaces (`packages/core/src/application/use-cases/edit-change.ts:95`), consistent with its merged config-factory requirement. Update dependency requirement/scenario to the workspace orchestrator and explain how repositories are obtained. The nearby implementation-tracking requirement also still equates scope change to `invalidated: true`, contradicting the new output contract in which that field means actual validity change.

Disposition: contract cleanup; preserve the new scopeChanged/validityChanged distinction.

### U6 — TransitionChange residual clearing text conflicts with implementation-only retry

The merged Input contract and Constraints retain statements that artifact validation clearing on verifying→implementing reads implementing.requires (`specs/core/transition-change/spec.md:21`, `:261`), while the replaced requirement says unchanged validated artifacts MUST NOT be cleared on implementation-only retry. The persistence scenario likewise mentions “validation clearing.”

Disposition: remove or qualify obsolete clearing references. No evidence here justifies restoring clearing on ordinary retry.

### U7 — InvalidateVerification omits verification guidance in archivable

`packages/core/src/application/use-cases/invalidate-verification.ts:127` emits `/specd-verify` only for verifying or done. With completed evidence in archivable and no required sign-off recovery, invalidation correctly stays in archivable but returns `nextAction.command: null`. The merged Canonical reconciliation and recovery requirement explicitly says a verification-requiring boundary recommends a new start/checks/complete cycle in the current state; archivable is such a boundary. The same omission applies to archiving when no higher-priority recovery occurs.

Disposition: implementation guidance gap. Derive the command from canonical boundary/next-action information rather than enumerating only two states. Add an ungated archivable invalidation case and assert state is preserved, verification stale, blockers present, and `/specd-verify` guidance returned. Existing `invalidate-verification.spec.ts:81` covers drafting/idempotence and `:98` active-only rejection; neither exercises this boundary.

### U8 — Config-based CreateChange does not receive project policy defaults

Merged `core:create-change` says omitted input uses resolved project defaults before native downstream/preserve. `CreateChange.execute` uses only `input.invalidation ?? DEFAULT_INVALIDATION_POLICY` (`packages/core/src/application/use-cases/create-change.ts:149`). Its config factory's resolver (`packages/core/src/composition/use-cases/create-change.ts:43`) injects no default policy, and kernel creation uses that resolver (`packages/core/src/composition/kernel.ts:368`). Thus callers of the config-based Core factory/kernel that omit invalidation get native defaults even with different project defaults. A CLI may overlay config on its input, but that does not satisfy the Core factory contract.

Disposition: either inject resolved defaults into Core composition (preferred for the stated public contract) or explicitly narrow the specification to require host-provided defaults and acknowledge different Core semantics. Add config-factory/kernel tests using a nondefault policy with omitted input, plus explicit-input precedence. Existing use-case tests at `create-change.spec.ts:114` and `:132` cover explicit policy and native default, not project-default injection.

## Reviewed positive evidence and limitations

- ApproveSpec resolves one actor and supplies it to reconciler mutation; spec approval recording stays ready and historic pending drains remain supported. Tests at approve-spec.spec.ts:111, :132, :154, :165 exercise identity, ready-state recording, append-only renewal, and drift rejection.
- ApproveSignoff distinguishes missing, active-only, stale, and fresh mismatch evidence. Tests at approve-signoff.spec.ts:170, :178, :187, :202 exercise the typed errors; :149 covers single decorated identity, :233 done-state consent.
- EditChange's scope mutation uses canonical reconciliation, separates scopeChanged from validityChanged, and refreshes after actual scope changes; tests at edit-change.spec.ts:345 and :389 cover gate recovery and reordering without consent invalidation.
- InvalidateChange validates target shape/accumulates target errors and delegates accepted mutation. Tests cover required/forbidden targets, force guard, stale historical evidence, sign-off done recovery, downstream ordering, unchanged hasDrift, and repeated reopening. This pass did not fully resolve whether force eligibility based on the pre-reconciliation snapshot matches the strongest wording of the new canonical-verdict requirement; it is not counted as a confirmed finding here.
- Global project context was read. Graph-first lookup/impact was used before implementation navigation. Full dependency audit and exhaustive per-scenario certification were not completed in this narrowed pass.

## Counts

- Assigned specs: 10; merged artifacts inspected for all 10.
- Confirmed discrepancy groups: 8 (6 artifact/contract consistency groups; 2 implementation/API behavior gaps).
- Exhaustive scenario pass count: **not established**; no all-pass claim.
- Tests executed by this delegate: 0 (parent owns package execution).
- Source/spec/manifest edits by this delegate: 0.
