# Spec compliance — adapter-sourced-resolution-fingerprint

Timestamp: 20260925-221400
Mode: change (re-check after test fixes)
Prior report: `reports/20260925-215407/`

Production fingerprint and adapter code is unchanged since that report. This pass re-scores the open test findings against the current tests. Context fingerprint `sha256:e5c1988d2c8cd11734bef6887581ec3bd667cb790292e0af8c0b417579a05a18` was unchanged.

## Closed

1. Application fingerprint and staleness cases no longer use `os.tmpdir()` or `NodeResolutionManifestSource`. They use an in-memory `ResolutionManifestSource`.
2. The three new titles now use `given …, when …, then …`.
3. Poetry-only `pyproject.toml` with no parent `[project].name` expects `undefined`.
4. `IndexCodeGraph.execute()` after a real manifest text change expects the exact `fullRebuildReason`, `fullRebuild === true`, and `filesSkipped === 0`.

Implementing post-hooks after those edits passed (`pnpm test`, `pnpm lint`, `pnpm typecheck`).

## Residual missing tests

These do not fail a product scenario. The methods return constants and do no I/O.

1. No test spies on `fs` inside `resolutionManifests()`.
2. No adapter fixture asserts that an adapter which reads no manifest returns `[]`. No built-in adapter is specified to return `[]`.

## Scenarios

Change-owned scenarios match the implementation and the tests named above. Pre-existing scenario titles that still start with `Scenario:` were not introduced by this change.
