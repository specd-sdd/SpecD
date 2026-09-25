# Spec compliance — adapter-sourced-resolution-fingerprint

Timestamp: 20260925-222400
Mode: change (full verify re-check)
Context fingerprint: `sha256:e5c1988d2c8cd11734bef6887581ec3bd667cb790292e0af8c0b417579a05a18` (unchanged)
Prior reports: `reports/20260925-215407/`, `reports/20260925-221400/`

Production fingerprint and adapter code is unchanged. This pass checks the two residual test gaps from `20260925-221400`.

## Closed

`packages/code-graph/test/infrastructure/tree-sitter/resolution-manifests.spec.ts`:

1. Built-in TypeScript, Go, PHP, and Python adapters return `['package.json']`, `['go.mod']`, `['composer.json']`, and `['pyproject.toml']`. `existsSync`, `readFileSync`, `lstatSync`, and `statSync` are mocked and are not called.
2. `NoManifestAdapter.resolutionManifests()` returns `[]` and does not call those filesystem functions.

Scenario tests in this pass: 8 code-graph files, 184 tests passed; `graph-stats.spec.ts`, 19 tests passed. Earlier implementing post-hooks (`pnpm test`, `pnpm lint`, `pnpm typecheck`) passed after this file was added.

## Open issues

None. The testing discrepancies from `20260925-215407` (application manifest tests on a real temp directory, three titles outside `given/when/then`) stay closed. The two missing assertions from `20260925-221400` are now covered.
