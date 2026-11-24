# Partial compliance audit — core model, manifest, configuration, and checks

Change: `versioned-approval-invalidation`  
Mode: delegated, shared attempt `verification-attempt-3`  
Scope: `core:change`, `core:change-repository-port`, `core:config`, `core:change-manifest`, `core:schema-format`, `core:transition-checks`, `core:create-change`, their direct dependencies (depth 1), and applicable global constraints.

## Requirements summary

| Spec                          | Main contract audited                                                                                                                   | Status                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `core:change`                 | Materialized approval/verification projections, structured invalidation, fingerprint semantics, lifecycle recovery, append-only history | Partially compliant: lifecycle contract is internally inconsistent                                       |
| `core:change-repository-port` | Atomic mutation, read-only hydration, v1 compatibility, v2 persistence, projection/history preservation                                 | Partially compliant through the manifest parser defect                                                   |
| `core:config`                 | Structured artifact/workflow policy, preserve defaults, conservative legacy adaptation, ambiguity rejection                             | Implemented                                                                                              |
| `core:change-manifest`        | Versioned v1/v2 parsing, strict v2 events, scope-aware fingerprints, stable serialization and audit history                             | Partially compliant: strict event schema rejects valid scope differences                                 |
| `core:schema-format`          | `hasTasks` controls fingerprint/drift exclusion while preserving structural/task checks                                                 | Implemented                                                                                              |
| `core:transition-checks`      | Shared verdict/recovery semantics, fail-closed verification, deduplicated implementation boundary checks                                | Implemented in this model/check layer; use-case diagnostics are covered in the separate use-case partial |
| `core:create-change`          | Structured policy input, configured/default resolution, v2 persistence without legacy scalar                                            | Implemented                                                                                              |

## Implementation status and positive evidence

- The domain owns structured invalidation policy and validity projections without I/O. Configuration and repository adapters perform boundary validation, preserving the global hexagonal dependency rule.
- New changes resolve configured policy or the default `{ artifacts: 'downstream', workflow: 'preserve' }`; legacy scalar manifests adapt conservatively to `workflow: 'redesign'`. Unsupported future manifest versions fail with the typed version error and reads do not eagerly rewrite v1.
- Spec approval fingerprints contain sorted/deduplicated `specIds`; equality ignores ordering and emits `spec-added` / `spec-removed` for true set differences. Artifact and implementation maps are deterministic, include algorithms and full key sets, and preserve observed-empty implementation evidence.
- `hasTasks`, rather than an artifact filename, excludes task-bearing artifacts from validity fingerprints and automatic drift propagation while leaving structural validation and live completion checks applicable.
- The transition registry runs both implementation readiness checks at implementing-exit and verifying-entry boundaries, deduplicates overlapping IDs, and treats only an explicit `not-required` verification verdict as skippable.
- Core's complete suite passed: **221 files, 2,712 tests**. Graph state was current and complete. Those passing suites do not exercise the invalid v2 round trip identified below.

## Discrepancies

### MODEL-01 — HIGH — Strict v2 history schema rejects valid scope-aware approval invalidation

**Affected specs:** `core:change-manifest`, `core:change-repository-port`, `core:change`, with direct impact on `core:edit-change`.

The domain fingerprint contract deliberately emits scope differences as:

- `{ scope: 'spec', kind: 'spec-added' }`
- `{ scope: 'spec', kind: 'spec-removed' }`

The domain event type and repository serializer accept the general `FingerprintDifference[]`, and scope-edit tests prove that `EditChange` can append such an `approval-invalidated` event. The standalone `fingerprintDifferenceSchema` is also correct. However, the strict `rawChangeEventV2Schema` duplicates a narrower inline schema at `packages/core/src/infrastructure/fs/manifest.ts:531-551`: it permits only scopes `artifact | implementation` and kinds `added | removed | changed | algorithm-changed | unreadable`.

**Failure mode.** A real scope change can atomically persist a v2 manifest containing the intended `scope: spec` audit difference. A later repository read validates the same history against the strict event union and rejects it. This violates native-v2 round-trip preservation and can make an otherwise successfully edited change unloadable.

**Why tests missed it.** Fingerprint tests cover `spec-added` / `spec-removed`; entity/edit tests cover event creation; manifest tests cover v2 projections. No test round-trips a v2 `approval-invalidated` history event carrying a scope difference through serializer, parser, and loader.

**Possible interpretations and resolution.**

1. **Implementation bug (recommended):** make the event field reuse `fingerprintDifferenceSchema` instead of duplicating a narrower object. Prefer `.strict()` consistently if strict nested objects are intended. Add repository and loader round-trip tests for added and removed specs, plus a negative unknown-kind case.
2. **Spec bug:** remove scope differences from audit events. This would contradict the approved design goal that historical approval scope remain explicit and would discard the exact reason consent became stale.

### MODEL-02 — HIGH — `archiving → done` is simultaneously required and forbidden

**Affected spec:** `core:change`; related proposal/design recovery invariant and transition-check behaviour.

The merged `core:change` lifecycle and “Archiving escape transitions” requirements state that `archiving` may target only `archivable` or `designing`, and explicitly forbid `archiving → done`. Yet the same change's proposal says required stale sign-off returns **any change beyond `done`** immediately to `done`; the design records this as an invariant. The policy-aware invalidation delta likewise says the central reconciler returns a later state to `done`.

The implementation follows proposal/design: `VALID_TRANSITIONS.archiving` is `['archivable', 'designing', 'done']`, with explicit tests asserting it. Therefore the code cannot conform to the merged lifecycle requirement and the gate-recovery invariant at the same time.

**Operational consequence.** If sign-off becomes stale while archive work is still active, central reconciliation needs a legal atomic recovery target. Removing the edge would either leave stale consent beyond its required boundary or require a special mutation that bypasses the entity transition table. Keeping the edge violates the current spec text.

**Possible interpretations and resolution.**

1. **Spec bug (recommended, consistent with the user's approved proposal/design):** update the lifecycle table, archiving escape requirement, constraints, and verification scenarios to allow `archiving → done` exclusively for central mandatory sign-off recovery. Keep manual transition semantics narrow if needed by distinguishing recovery-owned transitions from user-requested escape transitions.
2. **Implementation/design bug:** prohibit the edge and redefine sign-off recovery while `archiving` (for example, restore to `archivable` first and then recover). This adds a two-step non-atomic path and contradicts the central “detect and return together” decision.

**Missing tests.** Add a reconciler-level test for stale sign-off detected in `archiving`, proving exact state/event ordering and idempotence, plus a transition/API test showing whether a user may request the same edge or only the reconciler may apply it.

## Per-spec implementation status

### `core:change`

Materialized projections, append-only audit history, policy-aware focused invalidation, task exclusion, scope-aware fingerprints, explicit verification attempt/completion/invalidation, and preservation of unchanged evidence are implemented and broadly tested. MODEL-02 leaves lifecycle topology contradictory; MODEL-01 can make a valid domain history unreadable after persistence.

### `core:change-repository-port`

Repository mutation remains serialized/atomic and hydration is read-only. V1/transitional adaptation and v2-only-on-real-mutation behaviour are present. The port implementation inherits MODEL-01 because its accepted write shape is broader than its subsequent read validation.

### `core:config`

Structured policy loading, independent dimensions, preserve defaults, legacy scalar mapping, and ambiguous dual-shape rejection are implemented. No functional discrepancy was found.

### `core:change-manifest`

Version discrimination, future-version failure, projection serialization, canonical fingerprint maps, legacy unknown evidence, and explicit verification events are present. MODEL-01 is a critical round-trip hole in the strict event union.

### `core:schema-format`

Operational task semantics are marker-driven through `hasTasks`; arbitrary artifact IDs work. Task content is excluded from fingerprints/drift propagation without disabling structure or completion requirements. No functional discrepancy was found.

### `core:transition-checks`

Shared registry bindings, fail-closed verification, explicit `not-required`, duplicated-boundary deduplication, and operation-context checks for verification start are implemented. No additional model-layer discrepancy was found; missing recovery payloads in use cases are reported in the core-use-cases partial.

### `core:create-change`

Creation accepts one complete structured policy, uses configured/default values when omitted, rejects partial schema override, and persists v2 policy without rewriting later creation history. No functional discrepancy was found.

## Test coverage and edge cases to add

1. Serialize, parse, load, and reserialize a native-v2 `approval-invalidated` event for both `spec-added` and `spec-removed`.
2. Repository integration: approve scope A, edit to scope B, save, reload, and assert stale approval plus exact historical differences.
3. Negative strict-schema test for an unknown difference scope/kind.
4. Reconcile stale sign-off from `archiving`, with exact transition and invalidation event ordering and repeat idempotence.
5. Decide and test whether `archiving → done` is recovery-only or also a normal explicit edge; align `VALID_TRANSITIONS`, status availability, and merged spec wording.
6. Add symmetric config tests for partial structured overrides across project defaults and transitional manifests if not already covered at the repository boundary.

## Dependency and global-spec consistency

- Domain/application/infrastructure direction is respected in this batch; no domain I/O or adapter-owned business rule was found.
- The manifest defect is a boundary-schema inconsistency: domain and serializer agree, but strict input validation disagrees.
- The lifecycle defect is a contradiction between the merged capability spec and its proposal/design invariant, not merely code drift. Based on the approved design discussion, the spec text is the likely stale side.
- Error and testing conventions are otherwise followed: typed errors, Vitest mirrored tests, no snapshots, strict ESM/named exports.

## Summary counts

- Specs audited: **7**, plus project-wide constraints and direct dependencies.
- Fully compliant in this batch: **4** (`config`, `schema-format`, `transition-checks`, `create-change`).
- Partially compliant: **3** (`change`, `change-repository-port`, `change-manifest`).
- Findings: **2 high**, **0 medium**, **0 low**.
- Core suite evidence: **2,712 passing tests**; both findings require new cross-boundary/contract tests.
