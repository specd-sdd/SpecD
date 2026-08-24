# Partial audit — change: context-extracted-first

Scope: core:compile-context, core:get-spec-context, core:get-project-context (+ globals default:\_global/\* and depth-1 deps)

## Requirements audited

- `core:compile-context`: 19 requirements (1 added: Extracted-first rendering; 8 modified: Context spec collection, Context display modes, dependsOn resolution order, Staleness detection and content fallback, Prefer LLM-optimized context, Optimization warning signal, Missing spec IDs emit a warning, Context fingerprint, Constraints, Spec Dependencies)
- `core:get-spec-context`: 2 requirements modified (Build context entry from metadata; Prefer LLM-optimized context)
- `core:get-project-context`: 1 requirement modified (Renders spec content from metadata when fresh)

## Implementation status

| Requirement area                                       | Status             | Evidence                                                                           |
| ------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| Extracted-first rendering (all modes, scoped)          | Implemented        | `compile-context.ts` rung ladder; unit tests summary/preview-fallback/scope-bypass |
| No spurious metadata warnings while ladder yields data | Implemented        | guard on `usable(finalView)`                                                       |
| Regeneration ≠ warning (provenance on result)          | Implemented        | sink relay removed; consumer tests assert zero warnings                            |
| missing/stale optimization split, scoped silence       | Implemented        | projection `optimizationStatus`; three emission sites switched                     |
| Traversal manifest-first + existence-check skip option | Implemented        | Step-5 reorder; `TraverseDependsOnOptions`                                         |
| Fingerprint invalidation on delta edits                | Implemented+tested | merged-derived entries feed fingerprint                                            |

## Discrepancies

1. **Legacy-cache typing ambiguity** — persisted `metadata.json` cached before this change lacks `optimizationStatus`; consumers type unknown as `missing-optimization` even when the lock holds a drifted optimization. Accepted by design (self-heals on next regeneration; remediation action identical). Neither side "wrong": documented trade-off.
2. **No discrepancy found** between change specs and global specs (`_global/architecture`, `conventions`, `testing`, `logging`, `error-handling-conventions`) or dependency specs (`get-spec-metadata` if-needed contract; `spec-optimization` baseline semantics; `preview-spec` single-merge-source role; `content-extraction` engine usage).

## Test coverage

- All new/modified verify scenarios map to passing vitest cases (2381 green in @specd/core; full monorepo lint/typecheck/test green).
- **Missing (minor)**: no dedicated unit test asserting that the dependsOn extraction-fallback tier reads MERGED artifacts (vs base) for scoped specs (`mergedForDep` path in Step-5 catch). Code inspected correct; scenario exercised indirectly.

## Spec dependency chain

- `core:content-extraction` newly declared by `core:compile-context` (manifest + Spec Dependencies section) ✓ consistent with usage.
- `core:get-spec-context` / `core:get-project-context` already depend on `core:compile-context`; their deltas align semantics ✓ no ripple beyond scope.

## Summary

- Requirements audited: 22 (19 compile-context incl. 1 new; 2 get-spec-context; 1 get-project-context)
- Conformant: 22
- Discrepancies: 0 blocking · 1 accepted limitation · 1 minor missing test
