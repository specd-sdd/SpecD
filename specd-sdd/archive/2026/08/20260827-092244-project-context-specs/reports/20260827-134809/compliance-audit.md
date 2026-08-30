# Spec Compliance Audit — project-context-specs

**Mode:** change  
**Change:** `project-context-specs`  
**Date:** 2026-08-27  
**Scope:** `core:resolve-context-specs`, `cli:project-context-specs`, `core:compile-context`, `core:get-project-context` (+ globals/deps for consistency)

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 1     |
| Low      | 2     |
| Info     | 1     |

**Verdict:** Implementation aligns with change specs. No blockers for archive. Optional follow-ups below.

## Findings

### MEDIUM — Unknown-workspace errors are plain `Error` (exit 3 in CLI)

- **Spec:** `core:resolve-context-specs` / `cli:project-context-specs` require hard failure on unknown workspaces.
- **Code:** `ResolveContextSpecs` throws `new Error(...)`; CLI `handleError` treats non-`SpecdError` as fatal (exit 3).
- **Evidence:** CLI test expects exit 3; scenarios still pass (failure path exists).
- **Interpretation:**
  - Spec correct / code acceptable for “fail hard”
  - OR tighten later to a typed `SpecdError` + exit 1 for consistency with `default:_global/error-handling-conventions`
- **Recommendation:** Optional polish; not required to close this change.

### LOW — CompileContext helper scenarios rely on integration/parity + code inspection

- **Spec scenarios:** “Steps 1–4 use shared helper”, “Optimized project context still runs workspace patterns via helper”, “Protected change seeds survive helper excludes”.
- **Coverage:** Code uses `resolveConfiguredContextSpecs`; protect-on-exclude and optimized empty project arrays present; `configured-context-parity.spec.ts` + existing `compile-context.spec.ts` suites green (75+ collection/display tests).
- **Gap:** No dedicated spy asserting helper invocation from CompileContext.
- **Recommendation:** Acceptable; parity + source inspection sufficient for verify.

### LOW — GetProjectContext helper-empty-set is behavioral, not spy-based

- **Spec scenarios:** project include/exclude via helper; empty `activeWorkspaces`.
- **Coverage:** `get-project-context.ts` calls helper with `new Set()`; test “uses shared helper semantics…” asserts project exclude + workspace ignore; suite 17 tests green.
- **Recommendation:** Acceptable.

### INFO — No SDK orchestration wrapper (intentional)

- Confirmed: `resolveProjectContextSpecs` absent from `packages/sdk/src/index.ts` / orchestration; Core types re-exported via `core-reexports.ts`. Matches proposal/design.

## Spec ↔ implementation map (change specs)

| Spec                               | Implementation                                                      | Tests                                                  |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `core:resolve-context-specs`       | `ResolveContextSpecs`, helper, kernel mount, public + SDK reexports | `resolve-context-specs.spec.ts`, parity, barrel-kernel |
| `cli:project-context-specs`        | `registerProjectContextSpecs` → kernel execute                      | `project-context-specs.spec.ts` (6)                    |
| `core:compile-context` (delta)     | helper for steps 1–4                                                | `compile-context.spec.ts`, parity                      |
| `core:get-project-context` (delta) | helper + empty active set                                           | `get-project-context.spec.ts`                          |

## Consistency with globals / deps

- Hexagonal layering preserved (application use case + `_shared` helper; composition factory; CLI via SDK host).
- No contradiction found between change requirements and `cli:project-context` (ID-only sibling; rendering remains separate).
- Circular dep avoided: `resolve-context-specs` → `list-workspaces` + `config`; consumers depend on resolve-context-specs.

## Conclusion

Compliance audit is **clean enough to proceed**. Medium finding is optional error-typing polish, not a scenario failure.
