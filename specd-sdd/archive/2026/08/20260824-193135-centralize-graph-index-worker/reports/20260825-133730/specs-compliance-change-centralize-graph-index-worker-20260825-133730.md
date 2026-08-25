# Compliance Audit — centralize-graph-index-worker

## Scope

Mode: specific change. Audited all nine merged change specs, direct dependencies, and applicable global architecture, conventions, error-handling, and testing rules. The graph was current, though source-symbol coverage was unavailable during one audit slice; auditors fell back to source/test inspection after graph-first attempts.

## Summary

| Classification             | Count |
| -------------------------- | ----: |
| Code discrepancies         |     2 |
| Spec discrepancies         |     1 |
| Both                       |     0 |
| Non-blocking coverage gaps |     6 |

### Blocking code discrepancies

1. **High — final recovery cleanup is missing.** `withOpenGraphProvider` does not attempt a final `provider.close()` when either the recovery callback or retry `open()` fails, yet calls `afterClose`. This violates the merged `sdk:with-open-graph-provider` cleanup ordering and can expose partially-acquired SQLite resources.
2. **Medium — removed specialized-open API remains public.** `WithOpenGraphProviderOptions.open` and the second callback result parameter still permit a host-specific open path, contradicting the new parameterless `provider.open()` contract.

### Spec discrepancy

`code-graph:index-project-graph` retains a legacy incompatibility-repair requirement/scenario saying that the use case recreates storage. The merged design instead makes typed open recovery SDK-owned before `IndexProjectGraph` receives an open provider. The implementation follows the revised contract; the requirement/scenario is stale.

### Coverage gaps

- Recovery callback failure and retry-open failure need tests asserting final close before `afterClose`.
- API-surface tests should prove specialized `options.open` and callback result no longer exist.
- Recovery hook ordering needs explicit SDK orchestration coverage.
- SQLite needs real corrupt-byte and ordinary non-recoverable-open integration coverage.

## Conforming areas

- CLI uses the SDK isolated worker boundary, owns presentation only, has no direct Code Graph dependency, and preserves logical force/typed recovery output.
- Isolated worker lifecycle, IPC validation, lease cleanup, signal forwarding, packaged-child execution, and forced-child clean exit conform.
- Code Graph force performs logical clear/reanalysis; physical recreation is closed-only and typed-open recovery is narrow.
- SQLite store contracts, generation semantics, sidecar cleanup, and error classification conform.
- `runIndexProjectGraph` correctly owns bounded force-only typed recovery for transient providers while preserving explicit-provider ownership.

## Evidence

- Verification hooks passed: `pnpm test`, `pnpm lint`, and `pnpm typecheck`.
- Full project suite: 14 Turbo tasks successful; CLI 81 files / 869 tests.
- Code Graph focused suite: 58 files / 696 tests passed.
- SDK focused suite: 9 files / 71 tests passed.
- Real `graph index --force --format json` completed successfully in 8.85 seconds with zero errors.

## Detailed findings

Complete package-area evidence is retained in the immutable partial reports for audit traceability:

- `_partial-sdk-cli.md` — 2 code discrepancies and 4 coverage gaps.
- `_partial-runtime.md` — 1 stale legacy spec requirement; no runtime code discrepancy.
- `_partial-store.md` — 6/6 assessed requirements conform; 2 coverage gaps.

## Recommended resolution

Return to implementation to remove the obsolete SDK API and guarantee final close on every terminal recovery path. Then return to design to reconcile the stale `IndexProjectGraph` repair requirement/scenario (or do design first if the artifact correction should be reviewed before code changes).
