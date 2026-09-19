# Compliance audit — core runtime batch

**Mode:** change (`lifecycle-polish-followups`)  
**Scope:** `core:transition-change`, `core:lifecycle-engine`, `core:transition-checks`, `core:archive-change`  
**Date:** 2026-09-19  
**Graph:** current, complete coverage, no stale workspace (`graph stats --format toon`).

## Requirements summary

| Spec                     | Change requirement audited                                                                                                                                       | Result     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `core:transition-change` | Historic parked `pending-spec-approval` / `pending-signoff` transitions must return typed `approval-required` before `protocol.edge` for every non-drain target. | Conformant |
| `core:lifecycle-engine`  | A failed `workflow.requires` predicate must retain `details.artifactId` in projected `transitionBlockers[].blocking`.                                            | Conformant |
| `core:transition-checks` | Historic approval repair precedence must be preserved; production status and archive registries must inject overlap detection.                                   | Conformant |
| `core:archive-change`    | The layout-derived fallback snapshot port must create one lazy `FsArchiveBatchSnapshot` and reuse it across all port methods.                                    | Conformant |

## Implementation status and evidence

### `core:transition-change`

`TransitionChange._assertDrainAndGateTargets` runs before predicate execution. It treats only `designing` and the respective historic approval-forward target as drains, then throws `InvalidStateTransitionError` with `{ type: 'approval-required', gate: 'spec' }` or `{ type: 'approval-required', gate: 'signoff' }` for all other parked-state requests. This exactly prevents the former `protocol.edge` / `invalid-transition` precedence failure.

Evidence:

- `packages/core/src/application/use-cases/transition-change.ts:339`
- `packages/core/test/application/use-cases/transition-change.spec.ts:532` checks `pending-spec-approval -> implementing` retains the spec approval reason and state.
- `packages/core/test/application/use-cases/transition-change.spec.ts:543` checks `pending-signoff -> archivable` retains the signoff approval reason and state.

### `core:lifecycle-engine`

`blockingArtifactIds` first consumes the failed `workflow.requires` check result and returns its string `details.artifactId`; `transitionBlockers` calls that helper for failed checks. The projected blocker therefore has the exact check-supplied artifact identity, rather than an empty `blocking` list.

Evidence:

- `packages/core/src/domain/services/lifecycle-verdict.ts:209`
- `packages/core/src/domain/services/lifecycle-verdict.ts:753`
- `packages/core/test/domain/services/lifecycle-verdict.spec.ts:155` supplies a failed `workflow.requires` result for `specs` and asserts the blocker projection follows check details.

### `core:transition-checks`

The registry deliberately leaves overlap detection optional for isolated/non-production composition, as permitted by the new requirement. Both production consumers compose it explicitly: `resolveGetStatusDeps` and `resolveArchiveChangeDeps` call `resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection: true })`. The registry unit test verifies a peer overlap fails when injected and does not block when the isolated default is used.

Evidence:

- `packages/core/src/composition/use-cases/get-status.ts:42`
- `packages/core/src/composition/use-cases/archive-change.ts:133`
- `packages/core/src/composition/use-cases/workflow-check-registry.ts:23`
- `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts:61`
- `packages/core/test/composition/use-cases/get-status.spec.ts:106`

### `core:archive-change`

The fallback adapter closes over a single `Promise<FsArchiveBatchSnapshot>` and all five port methods use `resolveSnapshot()`. It consequently preserves the snapshot manifest from `snapshot`, through `recordCreatedFile`, to `restoreBatch`, while deferring workspace lookup until the fallback is actually used.

Evidence:

- `packages/core/src/composition/use-cases/archive-change.ts:63`
- `packages/core/test/composition/archive-batch-snapshot-port.spec.ts:63` creates a file after the fallback snapshot, records it, restores, and asserts that the file no longer exists.

Implementation tracking is consistent with the audit: all four runtime files and their focused tests are linked and resolved; no open tracked files or out-of-scope sidecars remain.

## Consistency with direct and global dependencies

- `core:transition-change` depends on `core:transition-checks` and `core:lifecycle-engine`; the pre-predicate approval guard complements the shared runner rather than duplicating predicate semantics. The change requirement explicitly establishes this precedence boundary.
- `core:lifecycle-engine` consumes check-result projections defined by `core:transition-checks`; retaining `details.artifactId` preserves, rather than reimplements, the check ABI's actionable diagnostics.
- `core:archive-change` and production `GetStatus` share `resolveWorkflowCheckRegistry`; both inject overlap detection, consistent with the registry requirement and `core:spec-overlap` dependency.
- The modified functions are in application/composition and domain-service layers respectively. No dependency direction violation was found relative to `default:_global/architecture`.

Graph evidence: `TransitionChange`, `evaluateLifecycleVerdict`, `resolveWorkflowCheckRegistry`, and `resolveArchiveBatchSnapshotPort` resolve to their intended core symbols. The graph reports `TransitionChange` as high-impact, but no unreviewed dependent implementation change is required because the public error shape and composition contracts are preserved.

## Test coverage

Focused verification executed successfully:

```text
pnpm exec vitest run \
  packages/core/test/application/use-cases/transition-change.spec.ts \
  packages/core/test/domain/services/lifecycle-verdict.spec.ts \
  packages/core/test/composition/use-cases/workflow-check-registry.spec.ts \
  packages/core/test/composition/archive-batch-snapshot-port.spec.ts

Test Files  4 passed (4)
Tests       127 passed (127)
```

The full repository suite also completed during the enclosing verification run: 14 Turbo tasks successful.

### Missing tests

No missing test that blocks this change was identified. The newly added behaviours each have a direct regression test. A future optional strengthening would be an end-to-end CLI status/archive overlap case using real composition rather than the present composition-source assertion plus registry unit test; it is not a discrepancy because the factory paths and injected behavior are both directly covered.

## Discrepancies

None found in this batch.

| Severity | Category                     | Count |
| -------- | ---------------------------- | ----: |
| P0       | Implementation bug           |     0 |
| P1       | Contract inconsistency       |     0 |
| P2       | Test gap requiring follow-up |     0 |
| P3       | Optional test strengthening  |     1 |

## Summary

All four core runtime deltas are implemented, linked, and covered by passing focused tests. The historical parked-approval issue raised in review no longer applies: non-drain transitions now preserve the typed approval guidance before protocol validation. No remediation is required for this batch before progressing verification.
