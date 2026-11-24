# CLI compliance audit — delegated verification

Scope: `cli:change-status`, `cli:change-invalidate`, `cli:change-approve`, `cli:change-transition`, `cli:change-create`, `cli:change-edit`, and `cli:change-verification` from the merged `versioned-approval-invalidation` previews. Audit was read-only and delegated to outer attempt `verification-attempt-4`.

## Requirements Summary

| Spec                      | Merged requirements assessed                                                                                                                                                        | Result |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `cli:change-status`       | GetStatus-owned status/lifecycle projections; drift and review rendering; task counts; DAG/schema output; drafted safety; validity/evidence output; hash-free implementation review | Pass   |
| `cli:change-invalidate`   | Thin invalidation delegation; reason/target/policy/force parsing; command-scoped overrides; Core-owned recovery and structured/text output                                          | Pass   |
| `cli:change-approve`      | Spec/signoff gate delegation, materialized evidence presentation, state-independent canonical recovery diagnostics                                                                  | Pass   |
| `cli:change-transition`   | Target/`--next` validation; Core-owned hop/gate enforcement; hooks/progress; repair guide and validity-aware failure output                                                         | Pass   |
| `cli:change-create`       | Spec/workspace parsing, readOnly rejection, overlap warning delegation, Core schema identity, structured invalidation-policy overlay                                                | Pass   |
| `cli:change-edit`         | Atomic readOnly precheck, scope/workspace delegation, partial policy overlay, Core-owned projection/recovery output                                                                 | Pass   |
| `cli:change-verification` | State-independent start/complete/invalidate adapters; mandatory reason; fingerprints without contents; mismatch guidance; idempotent persisted reason                               | Pass   |

## Implementation Status

- `status.ts` calls `kernel.changes.status.execute` as the status authority, renders check-derived blockers/next action, uses `displayStatus` fallbacks, and obtains DAG order/children from the active schema. It exposes hash-free validity/evidence fields and does not refresh implementation tracking itself.
- `invalidate.ts`, `approve.ts`, `transition.ts`, `create.ts`, `edit.ts`, and `verification.ts` are CLI adapters over their corresponding kernel use cases. Policy parsing and readOnly rejection happen at the CLI boundary; lifecycle recovery, evidence and transition decisions remain Core-owned.
- `verification.ts` calls only `startVerification`, `completeVerification`, and `invalidateVerification`; it neither transitions a change nor calculates fingerprints. Its mismatch path directs the user to restart, repeat checks, then complete.
- Status and transition graph impact identified their dedicated command tests and `src/index.ts` registration as direct dependents. The graph is current (`stale: false`).

## Discrepancies

No implementation-to-merged-spec discrepancies found.

No HIGH or CRITICAL graph-risk finding was discovered beyond the expected high-risk CLI command entry points; their directly affected command tests are present and passed.

## Test Coverage

Focused command suite executed successfully:

```text
pnpm --filter @specd/cli exec vitest run \
  test/commands/change/status.spec.ts \
  test/commands/change/approve.spec.ts \
  test/commands/change/transition.spec.ts \
  test/commands/change/verification.spec.ts \
  test/commands/change-create.spec.ts \
  test/commands/change-edit.spec.ts \
  test/commands/change/change-invalidate.spec.ts

7 files passed; 149 tests passed.
```

Coverage is substantial and maps to the merged scenarios: status covers DAG children/task counts, display states, overlap/review presentation, labels and reconciled evidence; invalidation covers reason/targets/policy/force and formats; approval covers both gates and evidence; transition covers protocol/gates/tasks/hooks/repair guides; create/edit cover workspace and policy behavior; verification covers adapter calls, empty reason, idempotence, mismatch diagnostics, and source/hash redaction.

## Missing Tests

These are coverage improvements, not failures of a requirement:

1. `cli:change-verification` has mocked-adapter tests but no single real-kernel CLI integration scenario that performs start, mutates a tracked input, then asserts complete returns the fingerprint repair guidance without completing evidence. Severity: LOW.
2. `cli:change-verification` has no real-kernel end-to-end test for start → complete → repeated invalidate retaining the original reason. Existing unit tests cover the formatter/delegation contract. Severity: LOW.
3. `cli:change-status` drafted-view behavior is implemented but its dedicated test file does not visibly name a drafted text-and-structured compatibility matrix. Add a regression test for suppressed command, empty legacy transitions, and omitted DAG. Severity: LOW.
4. `cli:change-edit` policy-only preserve/review scenarios are mocked; an integration fixture exercising a real reconciled preserve policy would make the Core-owned recovery boundary more robust. Severity: LOW.

## Spec Dependency Chain

- All seven CLI specs depend directly on `cli:entrypoint` for Commander registration, formatting, and exit conventions.
- `cli:change-status` additionally depends on `core:get-status`, `core:change`, `core:transition-checks`, and `sdk:build-implementation-review`.
- `cli:change-invalidate` depends on `core:invalidate-change` and `core:get-status`.
- `cli:change-approve` depends on `core:change` and `core:transition-checks` (the corresponding approval use cases own consent/fingerprint validity).
- `cli:change-transition` depends on `core:transition-change`, `core:get-status`, `core:hook-execution-model`, and `core:transition-checks`.
- `cli:change-create` and `cli:change-edit` depend on change/config/spec-ID use cases, including Core composition/invalidation behavior.
- `cli:change-verification` depends on `core:invalidate-verification`, `core:change`, `core:get-status`, and `core:transition-checks`; delegation policy requires outer verify, not compliance, to own attempt completion.

## Summary counts

| Category                    | Count |
| --------------------------- | ----: |
| Specs audited               |     7 |
| Requirement groups assessed |     7 |
| Focused tests passed        |   149 |
| Critical discrepancies      |     0 |
| High discrepancies          |     0 |
| Medium discrepancies        |     0 |
| Low discrepancies           |     0 |
| Low-priority test gaps      |     4 |

Conclusion: CLI implementation conforms to the merged active-change specifications within this scope. The listed test gaps are non-blocking hardening opportunities.
