# Specs compliance — versioned-approval-invalidation (verification-attempt-9)

## Result

**PASS — no material spec/implementation discrepancy found.**

This is the delegated compliance phase of full verification for `verification-attempt-9`. It audited all 25 change specs against their merged change previews, implementation, tests, direct dependencies at depth one, and the loaded project-wide architecture/conventions/testing/documentation directives. It did not start, complete, invalidate, approve, or transition the change.

The three required delegated workers were launched, but the external agent service rejected all three for usage exhaustion before any partial could be produced. To preserve the active baseline, the primary verifier completed the same three batches inline and wrote the partial reports retained beside this file.

## Verification baseline and current state

- Change state: `verifying`
- Active attempt: `verification-attempt-9`
- Baseline: 52 artifact files and 79 implementation files
- Artifact fingerprint algorithm: `artifact-pre-hash-v1`
- Implementation algorithm: SHA-256 with `text-v1` and `bytes-v1` normalization
- Artifacts: all complete, no drift
- Tasks: 194 complete, 0 incomplete
- Approval gates: spec disabled, sign-off disabled
- Expected pre-completion blocker: `VERIFICATION_STALE`
- Canonical next action while the attempt remains incomplete: `/specd-verify`

## Scope and scenario inventory

| Batch                                |  Specs | Merged scenarios | Result   |
| ------------------------------------ | -----: | ---------------: | -------- |
| Core model/persistence/config/checks |      6 |              496 | PASS     |
| Core use cases/reconciliation        |     10 |              460 | PASS     |
| CLI/skills/public protocol           |      9 |              256 | PASS     |
| **Total**                            | **25** |        **1,212** | **PASS** |

The scenario inventory was obtained from the merged `verify` previews, so inherited base scenarios and change deltas were considered together. The new specs `core:invalidate-verification` and `cli:change-verification` were audited from their change-local source because they are not yet archived workspace specs.

## Executed suites

| Area                    | Result                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Core                    | 221 files, 2,758 tests passed                                         |
| CLI                     | 82 files, 955 tests passed                                            |
| skills                  | 9 files, 61 tests passed                                              |
| SDK                     | 9 files, 73 tests passed                                              |
| agent plugins           | 23 tests passed: Claude 5, Codex 4, Copilot 4, OpenCode 5, Standard 5 |
| repository diff hygiene | `git diff --check` passed                                             |

Post-verifying hooks were evaluated immediately after the scenario suites; no hooks or additional instructions were configured.

## Regression against attempt 8 findings

All previously reported discrepancies are resolved:

1. Designing self-entry is a neutral application no-op, while entity self-transition remains invalid.
2. Config no longer claims that phase skipping is already part of this change.
3. Schema-format approval language is optional-gate and whole-scope aware.
4. Repository hydration is non-writing; reconciliation owns materialization.
5. GetStatus distinguishes operational reconciliation from immutable snapshot access and routes by policy/gates.
6. ValidateArtifacts delegates invalidation to the central reconciler.
7. Archive overlap recovery obeys each peer policy and mandatory gates.
8. Archive metadata regeneration consistently uses `MaterializeSpecMetadata`.
9. EditChange uses `ListWorkspaces` and separates scope change from validity change.
10. Verification retry preserves unchanged validated artifacts.
11. Late stale verification in `archivable`/`archiving` recommends `/specd-verify` in place unless gate recovery wins.
12. Config-based CreateChange and kernel composition inject the resolved project policy default.
13. Edit text output renders Core blockers and next action.
14. Verification commands validate format before resolving or mutating.
15. Start/complete intentionally do not invent next action; invalidate renders Core-owned guidance.
16. Verification docs describe stable safe projections, not raw internal serialization.

## Findings

No confirmed product, contract, documentation, or material test-coverage finding remains.

The active `VERIFICATION_STALE` status is not a defect: completion has deliberately not been recorded yet. Under the full verification protocol, `verification-attempt-9` must remain active until the user explicitly chooses to proceed after reviewing this report.

## Detailed findings

The complete batch reports follow verbatim.

---

# Partial audit — Core domain, persistence, configuration, and checks

## Requirements summary

Scope: `core:change`, `core:change-repository-port`, `core:config`, `core:change-manifest`, `core:schema-format`, and `core:transition-checks`.

The merged contracts require a versioned v2 manifest with v1 read compatibility; append-only approval and verification history; materialized current projections; scope-aware approval fingerprints; artifact and normalized implementation fingerprints; task-artifact exclusion through `hasTasks`; structured invalidation policy with `{ artifacts: downstream, workflow: preserve }` as the native default; configured defaults at composition boundaries; central registered checks; and neutral application-level `designing -> designing` handling without making entity self-transitions legal.

## Implementation status

**PASS.** See `_partial-core-model.md` for the complete retained batch evidence. The full partial is authoritative and is incorporated by reference here without altering its conclusions.

## Discrepancies

None found.

## Test Coverage

Core suite: 221 files, 2,758 tests passed.

## Missing Tests

None material identified.

## Spec Dependency Chain

Depth-one dependencies and global directives are consistent.

## Summary counts

- Specs: 6
- Scenarios: 496
- Findings: 0

---

# Partial audit — Core application use cases and reconciliation

## Requirements summary

Scope: ten Core application/use-case specs covering approvals, validation, invalidation, edit, transition, status, archive, create, and verification invalidation.

## Implementation Status

**PASS.** See `_partial-core-usecases.md` for the complete retained batch evidence. The full partial is authoritative and is incorporated by reference here without altering its conclusions.

## Discrepancies

None found.

## Test Coverage

Included in the 2,758 passing Core tests.

## Missing Tests

None material identified.

## Spec Dependency Chain

Depth-one dependencies and global directives are consistent.

## Summary counts

- Specs: 10
- Scenarios: 460
- Findings: 0

---

# Partial audit — CLI, skills, and public protocol

## Requirements summary

Scope: seven CLI specs and two skills specs covering status, mutation adapters, verification commands, workflow automation, and source-template parity.

## Implementation Status

**PASS.** See `_partial-cli-skills.md` for the complete retained batch evidence. The full partial is authoritative and is incorporated by reference here without altering its conclusions.

## Discrepancies

None found.

## Test Coverage

CLI 955, skills 61, SDK 73, and agent plugins 23 tests passed.

## Missing Tests

None material identified.

## Spec Dependency Chain

Depth-one dependencies and global directives are consistent.

## Summary counts

- Specs: 9
- Scenarios: 256
- Findings: 0

## Disposition

The implementation is eligible to complete `verification-attempt-9`. Completion and transition to `done` are intentionally deferred until the user explicitly chooses **Proceed** under the full verification protocol.

## Complete retained partials (verbatim)

The following three blocks are the complete contents of the retained `_partial-*.md` files.

---

# Partial audit — Core domain, persistence, configuration, and checks

## Requirements summary

Scope: `core:change`, `core:change-repository-port`, `core:config`, `core:change-manifest`, `core:schema-format`, and `core:transition-checks`.

The merged contracts require a versioned v2 manifest with v1 read compatibility; append-only approval and verification history; materialized current projections; scope-aware approval fingerprints; artifact and normalized implementation fingerprints; task-artifact exclusion through `hasTasks`; structured invalidation policy with `{ artifacts: downstream, workflow: preserve }` as the native default; configured defaults at composition boundaries; central registered checks; and neutral application-level `designing -> designing` handling without making entity self-transitions legal.

## Implementation status

**PASS.** The implementation is distributed through the `Change` aggregate and validity value objects, manifest parser/serializer and loader, filesystem repository, configuration loader, transition/check registry, and composition exports. The contracts and implementation agree on these important boundaries:

- v1 is adapted on read and is not rewritten by hydration; the first real mutation persists v2.
- v2 stores structured invalidation policy and explicit current approval/verification projections without erasing historical events.
- unsupported future manifest versions fail explicitly.
- spec approval fingerprints include canonical scope; set-equivalent reorderings remain valid, additions/removals become stale with precise differences.
- implementation input hashes use SHA-256, normalize text whitespace without language parsers, retain byte hashing for binary content, and reject missing inputs.
- task artifacts are excluded by schema metadata (`hasTasks`), not by filename.
- repository reads hydrate physical facts without independently deciding or persisting lifecycle recovery.
- central reconciliation owns materialized invalidation and recovery; registered transition/operation checks remain the shared protocol.
- `designing` self-entry is intercepted as a no-op at the application boundary; a real entity self-transition and `verifying -> verifying` remain invalid.

## Discrepancies

None found in this batch.

The four model/contract findings from attempt 8 are resolved: neutral self-entry is now one coherent no-event contract; current config no longer promises phase skipping; schema-format approval language is gate-aware and scope-wide; and repository hydration is explicitly non-writing while reconciliation owns persistence.

## Test coverage

Representative coverage includes:

- `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts`: immutable hydration, v1 legacy adaptation, transitional and native v2 scope-aware approvals, scope additions/removals, and future-version rejection.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts`: v1 read compatibility, v2 writes, and manifest round trips.
- `packages/core/test/application/services/validity-fingerprint-service.spec.ts`: artifact/task selection, link deduplication, text/binary fingerprint inputs, and missing files.
- `packages/core/test/domain/value-objects/validity-fingerprint.spec.ts`: deterministic comparison and difference reporting.
- `packages/core/test/domain/entities/change.spec.ts`: append-only projections, approval/verification attempt history, invalidation idempotency, lifecycle/recovery edges, and retained evidence.
- `packages/core/test/domain/services/change-validity.spec.ts`: preserve/redesign behavior and approval/sign-off/verification recovery precedence.
- `packages/core/test/application/services/execute-matching-predicates.spec.ts` and `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts`: stable check registration and de-duplication across overlapping bindings.
- `packages/core/test/application/use-cases/transition-change.spec.ts`: neutral designing self-entry and rejection of verifying self-entry.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `packages/core/test/application/use-cases/create-change.spec.ts`, and composition tests: structured/legacy configuration, defaults, and explicit override precedence.

The complete Core suite passed: **221 files, 2,758 tests**.

## Missing tests

No material missing scenario was identified. The merged verification artifacts contain extensive inherited coverage; this audit treats exact presentation or internal implementation choices as non-contractual unless required by the merged spec.

## Spec dependency chain

Direct dependencies were checked at depth one against the loaded project directives, especially architecture, storage, workflow model, lifecycle engine, composition, spec metadata, and transition checks. No contradiction with the global architecture, conventions, testing, documentation, or error-handling directives was found.

## Summary counts

- Specs audited: 6
- Merged scenarios inventoried: 496
- Confirmed discrepancies: 0
- Material missing tests: 0
- Result: PASS

---

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

---

# Partial audit — CLI, skills, and public protocol

## Requirements summary

Scope: `cli:change-status`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-create`, `cli:change-edit`, `cli:change-verification`, `skills:workflow-automation`, and `skills:skill-templates-source`.

The merged contracts require the CLI to remain a thin adapter over Core-owned decisions; expose reconciled validity, blockers, recovery, and next action consistently; validate inputs before mutation; provide safe whitelisted JSON/TOON projections; keep text output semantically aligned; and teach generated lifecycle skills to use explicit verification attempts, delegated compliance ownership, and canonical status guidance.

## Implementation status

**PASS.** CLI commands and source templates conform:

- `changes status` exposes reconciled state, materialized validity, checks, blockers, active/completed verification, transitions, and Core-owned next action.
- create/edit/approve/invalidate/transition commands present projection changes and recovery without implementing validity policy locally.
- edit text output includes returned blocker codes and the exact Core-owned next action; JSON and TOON retain equivalent typed meaning.
- verification `start`, `complete`, and `invalidate` validate `--format` before context resolution/use-case invocation. Invalidate also requires a non-empty reason before mutation.
- structured verification output is explicitly whitelisted: it contains safe identifiers, status, algorithms/counts, persisted reason and applicable recovery, while excluding raw hashes, source content, and internal fields.
- start/complete do not invent a lifecycle next action; invalidate renders the action supplied by Core. Documentation states the same rule.
- repeated invalidation reports the retained original reason in text, JSON, and TOON.
- source and installed skill copies agree on attempt ownership: verify starts/completes the outer attempt, delegated compliance never does, and findings route back without falsely completing verification.
- lifecycle skills begin from fresh status, respect committed automatic recovery, do not hand-roll invalidation, preserve ungated workflow state when allowed, and retain archive live-preflight rules.

## Discrepancies

None found in this batch.

The prior CLI-1, CLI-2, CLI-3, and DOC-1 findings are resolved: edit renders blockers/guidance; format validation precedes mutations; the contract now deliberately limits next-action output for start/complete while retaining Core-owned guidance for invalidate; and documentation describes safe projections rather than raw use-case serialization.

## Test coverage

- `packages/cli/test/commands/change/verification.spec.ts`: delegation, reason validation, pre-mutation format validation for all three commands, safe JSON/TOON projections, semantic parity, persisted reasons, and structured errors.
- `packages/cli/test/commands/change-edit.spec.ts`: preserved-state blockers and Core-owned next action in text.
- `packages/cli/test/commands/change/status.spec.ts`: validity and verification projections plus renew-in-place guidance.
- change create/approve/invalidate/transition suites cover flags, safe errors, gate consequences, and presentation.
- `packages/skills/test/template-workflow.spec.ts`: canonical reconciliation language, attempt ownership, complete delegated decision matrix, preserve routing, live archive preflight, and implementation-link draining.
- `packages/skills/test/generated-skill-protocol.spec.ts`: installed/source-template protocol parity.

Passing suites: CLI **82 files / 955 tests**; skills **9 files / 61 tests**; SDK **9 files / 73 tests**; agent plugins **23 tests** total (Claude 5, Codex 4, Copilot 4, OpenCode 5, Standard 5).

## Missing tests

No material missing scenario was identified. Documentation and templates are asserted where protocol drift would be consequential, while command behavior is covered at presenter and adapter boundaries.

## Spec dependency chain

The CLI entrypoint, Core use-case, GetStatus, spec-ID, configuration, docs, SDK review, command resource naming, agent, context, metadata, and transition-check dependencies were checked at depth one. The templates remain the source of truth and installed copies are synchronized by tests.

## Summary counts

- Specs audited: 9
- Merged scenarios inventoried: 256
- Confirmed discrepancies: 0
- Material missing tests: 0
- Result: PASS
