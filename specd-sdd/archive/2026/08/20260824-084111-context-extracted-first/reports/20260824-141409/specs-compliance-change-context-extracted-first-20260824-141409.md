# Spec Compliance Report — change: context-extracted-first

Generated: 2026-08-24 (report dir 20260824-141409)
Mode: `--change context-extracted-first` · Verification mode: full

## Scope

- Change specs: `core:compile-context`, `core:get-spec-context`, `core:get-project-context`
- Project-wide globals included: `default:_global/{architecture,conventions,docs,error-handling-conventions,eslint,logging,spec-layout,testing}`
- Depth-1 dependency specs of each change spec (17/10/9 respectively) reviewed for conformance

## Verdict

**Clean — 0 blocking discrepancies.** All audited requirements are implemented and tested; change specs are conformant to global and dependency specs. One accepted design limitation and one minor missing test recorded below.

## Detailed findings

See `_partial-core-context.md` (verbatim audit content for all three specs).

### Accepted limitations

1. Legacy metadata caches without `optimizationStatus` type unknown as `missing-optimization` until first regeneration. Self-healing; remediation identical.

### Missing tests (minor)

1. DependsOn extraction-fallback tier reading merged artifacts (vs base) for scoped specs — code inspected correct; covered indirectly only.

## Summary counts

- Requirements audited: 22 · Conformant: 22
- Test suites: @specd/core 2381 ✓ · @specd/code-graph 675 ✓ · @specd/cli 867 ✓
- Lint/typecheck: clean (23 turbo tasks)
