# Final compliance audit — core runtime

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:transition-change`, `core:lifecycle-engine`, `core:transition-checks`, `core:archive-change`  
**Date:** 2026-09-19

## Audit basis

- Merged `changes spec-preview` output was reviewed for all four affected specs.
- The code graph is current, complete, content-fresh, and non-stale.
- Graph discovery resolved the implementation symbols: `TransitionChange` (`application/use-cases/transition-change.ts:108`), `evaluateLifecycleVerdict` (`domain/services/lifecycle-verdict.ts:139`), `resolveWorkflowCheckRegistry` (`composition/use-cases/workflow-check-registry.ts:23`), and `resolveArchiveBatchSnapshotPort` (`composition/use-cases/archive-change.ts:63`).
- Direct-dependency consistency was checked against `core:transition-checks`, `core:spec-overlap`, and `default:_global/architecture`.
- Focused regression suite passed: **4 test files, 127 tests**.

## Requirements and results

| Spec                     | Effective requirement                                                                                                                                      | Implementation/test evidence                                                                                                                                                                                                            | Result |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `core:transition-change` | A historic parked approval state must produce typed `approval-required` before `protocol.edge` for a non-drain target.                                     | The guard executes at `transition-change.ts:190`, before schema/predicate work, and its implementation at `:338` maps the correct gate. Tests cover parked spec -> implementing and parked signoff -> archivable.                       | Pass   |
| `core:lifecycle-engine`  | Failed `workflow.requires` must retain its actionable artifact ID in `transitionBlockers[].blocking`.                                                      | The projection calls `blockingArtifactIds` at `lifecycle-verdict.ts:225`; the helper consumes `details.artifactId` at `:753`. The lifecycle-verdict regression test supplies a failed check detail and verifies the projected artifact. | Pass   |
| `core:transition-checks` | Production registry composition injects overlap detection; the isolated default may omit it. Approval repair keeps precedence over generic edge rejection. | `get-status.ts:42` and `archive-change.ts:133` pass `includeOverlapDetection: true`; the registry remains dependency-injected and isolated-safe. Registry and composition tests cover both injected and omitted behavior.               | Pass   |
| `core:archive-change`    | One lazy fallback `FsArchiveBatchSnapshot` must survive the complete composed operation.                                                                   | `archive-change.ts:71` memoizes one snapshot promise; all proxy methods use `resolveSnapshot`. The regression test snapshots, records a new file, restores, and confirms removal.                                                       | Pass   |

## Direct/global dependency consistency

- The new approval guard is a narrow historical-repair precedence rule. It does not duplicate the normal shared predicate runner defined by `core:transition-checks`; ordinary evaluation remains registry-driven.
- Lifecycle verdict consumes a supplied check result rather than independently rerunning `workflow.requires`, which preserves the check ABI and actionable diagnostics required by `core:transition-checks`.
- Registry overlap composition obeys `core:spec-overlap`: composition performs I/O and delegates overlap interpretation to the pure domain service.
- Layer placement remains conformant with `default:_global/architecture`: the state-transition use case is application-layer/port-based; verdict is a stateless domain function; `FsArchiveBatchSnapshot` construction is confined to composition.

## Test coverage

```text
pnpm exec vitest run \
  packages/core/test/application/use-cases/transition-change.spec.ts \
  packages/core/test/domain/services/lifecycle-verdict.spec.ts \
  packages/core/test/composition/use-cases/workflow-check-registry.spec.ts \
  packages/core/test/composition/archive-batch-snapshot-port.spec.ts

Test Files  4 passed (4)
Tests       127 passed (127)
```

Each new runtime behavior has direct regression coverage. No required missing test was found. A real CLI-level overlap composition E2E would be optional hardening only, because the registry behavior and each production factory wiring are already covered.

## Discrepancies

None.

| Severity/category           | Count |
| --------------------------- | ----: |
| P0 implementation defects   |     0 |
| P1 contract inconsistencies |     0 |
| P2 required coverage gaps   |     0 |
| P3 optional hardening       |     1 |

## Final conclusion

No regression was found in the core-runtime batch. In particular, the reported historic parked-approval failure no longer applies: a non-drain attempt receives the documented typed approval guidance instead of `invalid-transition`. This batch is compliant and does not require remediation before the change proceeds.
