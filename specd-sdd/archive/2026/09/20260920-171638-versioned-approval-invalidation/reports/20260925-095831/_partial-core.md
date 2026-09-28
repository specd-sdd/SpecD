# Core compliance audit — versioned-approval-invalidation

## Requirements Summary

Audited the merged `verify.md` scenarios and corresponding requirements for:

- `core:change`, `core:change-repository-port`, `core:config`, `core:approve-spec`, `core:approve-signoff`, `core:validate-artifacts`, `core:invalidate-change`, `core:edit-change`, `core:transition-change`, `core:get-status`, `core:archive-change`.
- `core:change-manifest`, `core:schema-format`, `core:transition-checks`, `core:create-change`, and `core:invalidate-verification`.

The change introduces v2 persisted manifests; materialized, scope-aware approval and verification fingerprints; explicit attempt start/complete/invalidate operations; centralized validity reconciliation; policy-aware artifact invalidation; and the lifecycle/implementation-readiness gates that consume those facts.

## Implementation Status

Implemented and structurally aligned:

- The `Change` aggregate models append-only history, independently materialized approval/verification projections, per-file artifact state, policy-aware invalidation, tracking state, and recovery-only transitions (`packages/core/src/domain/entities/change.ts`). Manual topology and evaluator-owned recovery topology are deliberately separate in `change-state.ts`.
- `ChangeRepository`, `parseChangeManifest`, v1/v2 Zod schemas, and `changeToManifest` preserve the new state while accepting legacy manifests (`packages/core/src/infrastructure/fs/change-repository.ts`, `manifest.ts`).
- The use-case layer supplies dedicated `ApproveSpec`, `ApproveSignoff`, `ValidateArtifacts`, `InvalidateChange`, `EditChange`, `TransitionChange`, `GetStatus`, `ArchiveChange`, `CreateChange`, `StartVerification`, `CompleteVerification`, and `InvalidateVerification` classes. Factories are wired through kernel/composition rather than leaking infrastructure into domain code.
- `ReconcileChangeValidity` and the transition-check registry centralize freshness, gate, drift, overlap, task, implementation-link, and verification-current decisions. `StartVerification` explicitly checks readiness and records a baseline without inventing a lifecycle transition; completion is separately fingerprint-checked.

Graph-first inspection located the public implementation symbols, including `StartVerification` (start-verification.ts:53), `CompleteVerification` (complete-verification.ts:40), `InvalidateVerification` (invalidate-verification.ts:45), manifest parsing (manifest.ts:836), v2 schema (manifest.ts:793), serialization (change-repository.ts:1636), and kernel bindings (kernel.ts:394-398). Graph health is current, complete, and schema-compatible.

## Discrepancies

No current Core code/spec discrepancy was found in this audit.

The two formerly material concerns are explicitly covered in current code and tests:

1. Scope-aware approval events load through the native v2 manifest schema (`manifest-change-loader.spec.ts:102`).
2. `archiving → done` is excluded from manual transitions but supported by the separate canonical recovery topology (`change-state.spec.ts:69,159`; `Change.recover`, change.ts:937).

Residual audit limitation: the change carries a large scenario matrix across sixteen Core specs. This audit sampled every requirement family against the owning aggregate/use-case/adapter and its mirrored test suite rather than independently executing one test process per individual scenario. That is a coverage-depth limitation, not evidence of a functional discrepancy.

## Test Coverage

Relevant mirrored suites exist for all audited capability families:

- Aggregate/state/artifact lifecycle: `test/domain/entities/change.spec.ts`, `change-artifact.spec.ts`, `artifact-file.spec.ts`, `change-state.spec.ts`, `change-validity.spec.ts`.
- Persistence/versioning: `test/infrastructure/fs/change-repository.spec.ts`, `manifest-change-loader.spec.ts`.
- Use cases: dedicated suites for create, edit, validate-artifacts, invalidate-change, transition-change, get-status, archive-change, start/complete/invalidate verification, reconciliation, and transition checks.
- Composition: dedicated factory tests for create, transition, archive, get-status, and verification factories.

`pnpm --filter @specd/core test` was run during this audit; Vitest started successfully. The implementation phase’s recorded Core verification run also reports 2,738 passing Core tests. The current suite includes explicit regression coverage for native v2 scope-aware approval hydration, recovery-only archiving edges, verification-current non-mutation, per-file drift, manifest compatibility, and repeated reconciliation idempotence.

## Missing Tests

No required behavior appears untested. Desirable hardening only:

- A single end-to-end Core integration test combining v2 load → stale approval recovery → renewed verification → signoff/archivable would exercise the already-covered components in one persisted workflow.
- A table-driven regression suite that cross-products all recovery-only source states with each stale gate would make topology changes easier to review.

These are LOW-severity test-quality suggestions; they do not block verification.

## Spec Dependency Chain

- `core:change` anchors the aggregate and depends on manifest, lifecycle, workflow, architecture, logging, and transition-check contracts.
- `core:change-repository-port` and `core:change-manifest` provide persistence boundaries and v1/v2 serialization.
- Approval, validation, invalidation, edit, transition, status, archive, and verification use cases consume `core:change` plus schema/composition/lifecycle contracts.
- `core:transition-checks` is the shared evaluation layer used by transition, status, archive, and operation-context verification readiness.
- `core:config` supplies policy/gate configuration to reconciled evaluation; `core:create-change` records initial schema/policy/dependency state.

No contradiction was found between this change’s merged Core specifications and the direct dependencies/global architecture constraints: domain remains I/O-free, application uses ports, and composition owns infrastructure wiring.

## Summary counts

| Metric                                  | Count |
| --------------------------------------- | ----: |
| Core specs audited                      |    16 |
| Critical discrepancies                  |     0 |
| High discrepancies                      |     0 |
| Medium discrepancies                    |     0 |
| Low discrepancies                       |     0 |
| Non-blocking test hardening suggestions |     2 |

**Audit result: PASS (no Core compliance blockers identified).**
