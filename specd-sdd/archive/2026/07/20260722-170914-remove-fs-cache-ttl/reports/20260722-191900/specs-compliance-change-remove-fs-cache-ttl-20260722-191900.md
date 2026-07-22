# Spec Compliance Audit — remove-fs-cache-ttl

**Mode:** change  
**Change:** remove-fs-cache-ttl  
**Date:** 2026-07-22

## Scope

- core:fs-change-repository (merged via change deltas)
- core:fs-spec-repository (merged via change deltas)
- core:fs-archive-repository (merged via change deltas)
- Dependencies: core:storage, core:composition, default:\_global/architecture

## Summary

| Spec                       | Requirements checked        | Implemented | Discrepancies | Missing tests |
| -------------------------- | --------------------------- | ----------- | ------------- | ------------- |
| core:fs-change-repository  | 6 rule groups, 18 scenarios | Yes         | 0 blocking    | 0 blocking    |
| core:fs-spec-repository    | 4 rule groups, 12 scenarios | Yes         | 0 blocking    | 0 blocking    |
| core:fs-archive-repository | 5 rule groups, 14 scenarios | Yes         | 0 blocking    | 0 blocking    |

**Overall:** PASS — implementation matches merged change specs.

## Key findings

### TTL removal (primary change intent)

- `INDEX_TTL_MS` removed from `fs-index-cache-base.ts`.
- `_ensureFresh()` sequence is now: invalidated flag → mtime mismatch → serve.
- Test `serves from cache when stamps match regardless of generatedAt age` covers the new "Fresh stamps serve without time-based rebuild" scenario for all bucket types (shared base cache).

### Non-blocking notes

1. **Workspace specs pre-archive:** `specs/core/fs-change-repository/spec.md` and `verify.md` still contain TTL language until this change is archived. Merged change previews are correct; no action needed before archive.
2. **Graph index staleness:** `specd graph search` still references `INDEX_TTL_MS` at a stale line. Re-index after merge to refresh symbol metadata.

## Test coverage

- `@specd/core`: 2198 tests passed (includes `fs-index-cache-base.spec.ts`, `change-repository.spec.ts`, `spec-repository.spec.ts`, `archive-repository.spec.ts`).
- Pre-verify hooks: test, lint, typecheck all passed.

## Dependency consistency

- `core:storage` does not mandate TTL-based freshness; compatible with change deltas.
- No contradictions found between change spec deltas and dependency specs.
