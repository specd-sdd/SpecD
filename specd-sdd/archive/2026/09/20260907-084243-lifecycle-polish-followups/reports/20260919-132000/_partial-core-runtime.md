# Spec compliance audit — core runtime

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:transition-change`, `core:lifecycle-engine`, `core:transition-checks`, `core:archive-change`  
**Audit date:** 2026-09-19  
**Mode:** change-spec preview against current implementation, direct dependencies, and global architecture.

## Scope and method

- Read the effective change previews for all four scoped specs, rather than raw deltas.
- Confirmed the graph is current, content-fresh, complete, and non-stale.
- Used graph impact for the high-risk `TransitionChange` surface (10 direct / 126 indirect dependents; 54 affected files) and the medium-risk archive snapshot resolver (4 direct / 4 indirect dependents; 8 affected files).
- Checked `core:transition-checks`, `core:spec-overlap`, and `default:_global/architecture` as direct/global constraints.
- Ran the four focused test files: **4 passed, 127 tests passed**.

## Requirements summary

| Spec                     | Effective change requirement                                                                                                            | Result |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `core:transition-change` | Non-drain requests from historic parked approval states fail as typed `approval-required` before protocol validation.                   | Pass   |
| `core:lifecycle-engine`  | Failed `workflow.requires` predicate details preserve the blocking artifact in `transitionBlockers`.                                    | Pass   |
| `core:transition-checks` | Approval precedence is retained; production status/archive composition injects overlap detection while isolated registries may omit it. | Pass   |
| `core:archive-change`    | The fallback batch snapshot instance persists through snapshot, created-file recording, and restore.                                    | Pass   |

## Implementation and test evidence

### `core:transition-change`

`TransitionChange._assertDrainAndGateTargets` executes before predicate evaluation. For `pending-spec-approval` and `pending-signoff`, it throws `InvalidStateTransitionError` with `{ type: 'approval-required', gate: 'spec' | 'signoff' }` on every non-drain request. It therefore prevents `protocol.edge` from replacing actionable approval repair guidance with `invalid-transition`.

- Implementation: `packages/core/src/application/use-cases/transition-change.ts:339`
- Regression coverage: `packages/core/test/application/use-cases/transition-change.spec.ts:532` (`pending-spec-approval -> implementing`) and `:543` (`pending-signoff -> archivable`).

### `core:lifecycle-engine`

`transitionBlockers` delegates blocker selection to `blockingArtifactIds`. When the supplied `workflow.requires` check fails, that helper returns its `details.artifactId`, which becomes the `blocking` entry. This preserves the shared check result's actionable identity without recomputing a competing status traversal.

- Implementation: `packages/core/src/domain/services/lifecycle-verdict.ts:209`, `:753`
- Regression coverage: `packages/core/test/domain/services/lifecycle-verdict.spec.ts:155`.

### `core:transition-checks`

The registry's default `includeOverlapDetection` remains off only for isolated composition, which is explicitly allowed by the effective requirement. Production consumers both pass `includeOverlapDetection: true`: `resolveGetStatusDeps` and `resolveArchiveChangeDeps`. The registry test verifies the injected detector reports a peer overlap; its omitted-option test verifies the intended isolated behavior.

- Implementation: `packages/core/src/composition/use-cases/workflow-check-registry.ts:23`, `packages/core/src/composition/use-cases/get-status.ts:42`, `packages/core/src/composition/use-cases/archive-change.ts:133`
- Regression coverage: `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts:61`, `packages/core/test/composition/use-cases/get-status.spec.ts:106`.

### `core:archive-change`

When layouts are unavailable, `resolveArchiveBatchSnapshotPort` closes over one lazy `Promise<FsArchiveBatchSnapshot>`. Every port method calls `resolveSnapshot`, so state recorded during `snapshot` remains available to `recordCreatedFile` and `restoreBatch`.

- Implementation: `packages/core/src/composition/use-cases/archive-change.ts:63`
- Regression coverage: `packages/core/test/composition/archive-batch-snapshot-port.spec.ts:63` creates a file after snapshot, records it, restores, and confirms removal.

## Dependency and global consistency

- `core:transition-change` appropriately establishes the narrow pre-predicate exception required for historic repair guidance, while `core:transition-checks` remains the source for ordinary predicate execution. No duplicate generalized check implementation was introduced.
- `core:lifecycle-engine` projects the `core:transition-checks` result rather than reimplementing `workflow.requires`; that matches the shared-check contract.
- `core:transition-checks` production overlap wiring conforms to `core:spec-overlap`: the composition layer performs repository I/O then calls the pure overlap domain service.
- `TransitionChange` remains an application use case using ports and typed entity/domain errors; `evaluateLifecycleVerdict` remains a stateless domain function; the fallback snapshot code is in composition. These placements conform to `default:_global/architecture`.
- The graph's high impact for `TransitionChange` is acknowledged by focused regression tests. No dependent contract required a source change because the public typed-error shape is preserved and corrected.

## Discrepancies

No implementation/spec inconsistency was found.

| Category               | Severity | Count | Evidence                                                                                                           |
| ---------------------- | -------- | ----: | ------------------------------------------------------------------------------------------------------------------ |
| Implementation bug     | P0/P1/P2 |     0 | All effective requirements match code and focused tests.                                                           |
| Spec drift             | P0/P1/P2 |     0 | The previews are consistent with direct check/overlap/global contracts.                                            |
| Required test gap      | P2       |     0 | Each changed runtime behavior has direct regression coverage.                                                      |
| Optional strengthening | P3       |     1 | A real CLI composition E2E overlap case could supplement existing registry and factory-wiring tests; non-blocking. |

## Test coverage and missing tests

```text
pnpm exec vitest run \
  packages/core/test/application/use-cases/transition-change.spec.ts \
  packages/core/test/domain/services/lifecycle-verdict.spec.ts \
  packages/core/test/composition/use-cases/workflow-check-registry.spec.ts \
  packages/core/test/composition/archive-batch-snapshot-port.spec.ts

Test Files  4 passed (4)
Tests       127 passed (127)
```

No missing test blocks verification or archive. The P3 E2E suggestion is quality hardening only.

## Summary counts

- Specs audited: 4
- Effective change requirements audited: 4
- Conformant: 4
- P0: 0
- P1: 0
- P2: 0
- P3 optional follow-ups: 1

The historic parked approval review concern is resolved in the current implementation: the desired typed `approval-required` result now has precedence over the protocol-edge failure.
