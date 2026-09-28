# Delegated verification/compliance: core model

Change: `versioned-approval-invalidation`. Outer attempt: `verification-attempt-8`. This read-only audit did not start, complete, invalidate, or transition the change. Scope: `core:change`, `core:change-manifest`, `core:change-repository-port`, `core:config`, `core:schema-format`, `core:transition-checks`.

## Result and evidence limits

**Not clean: four confirmed contract discrepancies.** Three are inherited artifact inconsistencies; one also exposes inconsistent entity/application behavior. The parent requested a narrower finish concentrating on confirmed discrepancies. This report therefore does **not** certify every inherited scenario as individually verified. Some large initial previews were truncated; filtered artifact previews and targeted follow-up reads were used for the findings below. No missing portion is counted as a pass.

Parent reported fresh successful suites for this attempt: Core 2742/2742, CLI 945/945, skills 61/61. These were not rerun here. Passing suites establish regression evidence, not satisfaction of conflicting prose.

## M1 — Designing self-entry has three different meanings

Severity: medium. Classification: contract inconsistency and entity/application divergence.

Merged `core:change`, Lifecycle requirement, explicitly permits `designing → designing` without invalidation. Its scenario **Designing to designing does not downgrade artifacts or approvals** additionally requires an appended `transitioned` event from designing to designing.

Actual behavior:

- `packages/core/src/domain/value-objects/change-state.ts:33` lists designing among designing's legal targets, so `isValidTransition` accepts it.
- `packages/core/src/domain/entities/change.ts:914` rejects all self-transitions before consulting that table (lines 916–918).
- `packages/core/src/application/use-cases/transition-change.ts:344` skips the entity transition when the target is already current. Application execution is a no-op; it does not append the event required by the scenario.
- `packages/core/test/domain/entities/change.spec.ts:1541` explicitly tests rejection of self-transitions. The design's acceptance inventory at `design.md:1364` calls for designing self-entry neutrality, but does not resolve whether it should append an event.

Disposition: the scenario's full THEN sequence fails; approval/artifact neutrality does not prove its event assertion. The discrepancy exists even if CLI returns success.

Recommended resolution: decide and document one meaning. A neutral application no-op is consistent with the current behavior and the absence of new work; adjust the scenario to require no new history and explicitly document why the application allows the no-op while the entity refuses a real self-transition. Alternatively retain the written eventful re-entry contract and implement a designing-only entity exception. Do not broaden this to verifying self-transitions, which remain explicitly forbidden. Add a test that checks the exact history length/event payload, not merely successful return.

## M2 — Config still promises phase skipping that this design defers

Severity: medium. Classification: inherited artifact drift.

Merged `core:config`, Approvals requirement, says that a forward leave of ready includes `ready → verifying` when implementing is omitted from `workflow[]`.

`packages/core/src/domain/value-objects/change-state.ts:34` permits only implementing and designing from ready. The merged `core:transition-checks` explicitly says omitted workflow rows do not remove lifecycle states; phase skipping remains deferred. Classification tests can classify a hypothetical ready-to-verifying attempt as forward, but that does not make `protocol.edge` pass. `packages/core/test/domain/services/transition-checks.spec.ts:70` and `:233` test classification/applicability, not a legal successful hop.

Disposition: this requirement contradicts both the fixed protocol and the change's intended scope.

Recommended resolution: remove the current-behavior claim from config; retain the general forward-boundary approval binding. If useful, label the skipped edge as a future example contingent on compiled crossed-boundary guards. Implementing phase skipping to satisfy this sentence would expand the change and contradict the explicit deferral.

## M3 — Schema format still mandates unconditional per-spec approval

Severity: high for contract consistency; no new runtime bug demonstrated. Classification: inherited artifact drift.

Merged `core:schema-format`, **Per-spec approval**, says every delta-touched spec requires approval before archive, that approval is tracked per spec rather than per change, and advertises `specd approve <spec-path>`. Its four scenarios are **New spec requires approval**, **Modified spec requires approval**, **All specs approved**, and **Partially approved**.

This conflicts with merged `core:change` Spec approval gate/Signoff gate and `core:config` Approvals, which define optional, default-off change-level gates. Native v2 consent snapshots the complete canonical scope as one decision. The current registry composes one `approval.spec` and one `approval.signoff` check (`packages/core/src/application/checks/workflow-check-registry.ts:84` and `:101`); no per-spec consent collection is modeled by the v2 manifest. `design.md:185`, `:284`, and `:933` define scope-aware change approval rather than independent per-ID decisions.

Disposition: the four scenarios cannot be accepted literally under the current contract. A full audit must not silently interpret them as the new scope snapshot feature.

Recommended resolution: replace this obsolete requirement/scenario group with a reference to configurable change-level consent, whole-scope fingerprinting, and canonical approval commands. Keeping unconditional per-spec consent would require an additional product feature and a different manifest, UI, and lifecycle design; there is no evidence that it is intended here.

## M4 — Repository post-save scenario still requires persistence owned by reconciliation

Severity: medium. Classification: inherited contract contradiction; implementation follows the new ownership model.

Merged `core:change-repository-port`, `mutate serializes persisted change updates`, step 5 says the repository must persist drift discovered on its post-save reload. Scenario **Post-save reconcile detects disk drift from saveArtifact inside callback** requires both returned drift classification and a persisted manifest matching it. Earlier `get` text also still permits locked auto-invalidation and references the removed auto-invalidation requirement.

The newly merged **Hydration reports fresh file facts without deciding validity** and `design.md:18` instead reserve materialized invalidity and recovery for the application reconciler.

Implementation:

- `packages/core/src/infrastructure/fs/change-repository.ts:363` obtains the per-change lock, hydrates, and persists only if callback aggregate mutation changes the stamp (`:375`).
- `_reconcileChangeUnderLock` at `:455` explicitly reloads without writing.
- `get` at `:425` is a non-writing snapshot read.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts:988` tests returned drift without saveArtifact mutating the callback aggregate; its `:1065` assertion compares the returned result to another read, not persisted drift materialization.

Disposition: returned fresh classification is supported; automatic persisted post-save drift is not, and should not be inferred from that test.

Recommended resolution: retain no-write hydration and rewrite the old port paragraphs/scenario to distinguish fresh file facts from persisted validity. Test the repository's no-write behavior and separately test that `ReconcileChangeValidity` commits the materialized states/events/recovery atomically. If persisted drift on every repository mutation is intentionally retained, it must call the single application-owned reconciliation boundary rather than restore a second policy engine in infrastructure.

## Positive targeted checks

| Spec                        | Requirements inspected                                                                                | Evidence and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core:change                 | Append-only projections; attempt start/complete; selective policy; explicit tracking; lifecycle edges | Entity tests enumerate creation, tracking, policy, retained approval/verification evidence, recovery-only transitions, attempt lifecycle. `change.spec.ts:1547`, `:1574`, `:1603`, `:1636`, `:1658`; entity lifecycle has M1. Source inspection confirms normal transition only appends lifecycle evidence, and retry signoff invalidation remains separately performed by TransitionChange `:340`.                                                               |
| core:change-manifest        | Version discrimination; legacy unknown scope; strict scope difference serialization                   | `manifest.ts:840` dispatches missing version to v1, exact 2 to strict v2, rejects other versions before hydration. `manifest-change-loader.ts:57` hydrates v2; `:140` adapts v1 without current-file baselines. Tests `manifest-change-loader.spec.ts:40`, `:92`, `:132`, `:175`, `:208`, `:237` cover legacy/transitional/native consent, valid spec-added/removed differences and invalid enum tokens. No new discrepancy confirmed in these inspected changes. |
| core:change-repository-port | Serialized mutation; non-writing reads; migration                                                     | `change-repository.ts:363`, `:425`, `:455`; test `change-repository.spec.ts:2899` explicitly verifies create v2 and no v1 rewrite on get. M4 affects the older post-save contract.                                                                                                                                                                                                                                                                                |
| core:config                 | Structured policy; defaults; legacy alias; ambiguous input rejection                                  | `config-loader.spec.ts:2277` maps all legacy artifact policies to redesign; `:2288` checks downstream/preserve default; `:2293` structured policy; `:2302` ambiguous shape; `:2312` invalid enum. M2 affects the older approval prose.                                                                                                                                                                                                                            |
| core:schema-format          | Task marker exclusion; workflow extras; approval contract                                             | M3 conflicts with current gates. Merged task validity semantics correctly use hasTasks rather than filenames; task marker semantics are consistent with the new fingerprint contract. The broader parser/selector/metadata scenarios are not independently certified by this narrowed report.                                                                                                                                                                     |
| core:transition-checks      | Explicit not-required skip; missing verdict fail-closed; registry composition; post-hook recheck      | `domain/checks/verification-current.ts:26` returns VERIFICATION_VALIDITY_UNAVAILABLE for absent verdict; only explicit not-required skips (`:36`); active/absent evidence fails. Registry composes the shared check (`workflow-check-registry.ts:88`, `:107`). `transition-change.ts:297` reconciles after effects and `:314` reruns predicates before mutation. No new discrepancy confirmed in these inspected changes.                                         |

## Dependencies, coverage, and completion

Project context was loaded through the CLI and checked for domain purity, application ports, structured errors, typed composition, and testing conventions. M2 and M3 are direct contradictions between assigned merged specs; M4 is an internal old/new requirement contradiction. Full depth-one dependency content and every inherited scenario have not been independently exhaustively re-audited in this narrowed finish. Parent should not count this as an exhaustive clean pass.

Counts: six assigned specs; four confirmed findings; six affected scenario instances (M1: one, M3: four, M4: one with a partially satisfied THEN sequence), one contradictory config requirement without a dedicated success scenario. No source/spec/manifest changes made. No additional tests run. Report-only write.
