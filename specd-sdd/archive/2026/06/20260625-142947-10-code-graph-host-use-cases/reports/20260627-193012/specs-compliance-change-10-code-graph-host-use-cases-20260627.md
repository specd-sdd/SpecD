# Specs Compliance Audit — 10-code-graph-host-use-cases

**Date:** 2026-06-27  
**Mode:** change  
**Scope:** 8 change specs + global architecture constraints

## Summary

| Metric                   | Count   |
| ------------------------ | ------- |
| Specs audited            | 8       |
| Requirements checked     | 47+     |
| Implementation gaps      | 0       |
| Test coverage gaps       | 2 (low) |
| Spec/code contradictions | 0       |

## Change specs — implementation status

### code-graph:get-graph-health — PASS

- `GetGraphHealth.execute()` implements lock assert, statistics, VCS staleness, fingerprint mismatch
- `createGetGraphHealth()` stateless factory exported
- `CodeGraphHostPort` satisfies application layer boundary (not in spec; implementation detail)

### code-graph:index-project-graph — PASS

- Force recreate + `provider.index()` delegation
- Factory exported

### code-graph:get-spec-coverage — PASS

- Found/not-found paths, unique counts

### code-graph:get-change-spec-coverage — PASS

- `ChangeNotFoundError`, ordered delegation via injected `GetSpecCoverage`

### code-graph:composition — PASS

- Host use case exports present in `packages/code-graph/src/index.ts`
- Existing composition tests still pass (`code-graph-provider.spec.ts`)

### code-graph:staleness-detection — PASS

- Primitives unchanged; hosts delegate via `GetGraphHealth` (stats, project status)

### cli:graph-stats — PASS

- Pre-open `assertGraphIndexUnlocked`; in-provider `createGetGraphHealth().execute()`
- No direct `isGraphStale` / `detectFingerprintMismatch` in command handler
- 17 CLI tests pass

### cli:graph-index — PASS

- Worker body uses `createIndexProjectGraph().execute()`; lock/spawn unchanged
- 9 CLI tests pass

## Test coverage gaps (low)

1. **get-graph-health** — verify scenario "Mismatch detected" has no dedicated unit test (code path exists; only null-without-workspaces tested)
2. **Factory stateless** scenarios — covered by inspection, not explicit tests for all four factories

## Global constraints

- Hexagonal layering: application use cases use `CodeGraphHostPort`, not composition imports — PASS
- ESM named exports — PASS
- Vitest unit tests for use cases — PASS

## Recommendation

**Proceed** to `done` / `archivable`. Optional follow-up: add fingerprint-mismatch=true unit test (non-blocking).
