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
| Medium   | 0     |
| Low      | 0     |
| Info     | 1     |

**Verdict:** Implementation aligns with change specs. Prior Medium finding (plain `Error` → exit 3) is resolved. Safe to proceed / archive after verify transition.

## Findings

### INFO — No SDK orchestration wrapper (intentional)

- Confirmed: `resolveProjectContextSpecs` absent from `packages/sdk/src` / orchestration exports.
- Core types/class/factory re-exported via `packages/sdk/src/core-reexports.ts`.
- Matches `core:resolve-context-specs` Public surface and `cli:project-context-specs` Host wiring.

## Prior findings closed

| Prior                                                 | Status                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| MEDIUM — unknown workspace plain `Error` / CLI exit 3 | **Fixed** — `InvalidInputError` (`INVALID_INPUT`); CLI test expects exit `1` + `error:`                      |
| LOW — helper coverage via parity only                 | **Improved** — dedicated `resolve-configured-context-specs.spec.ts` (order, empty active set, inactive skip) |
| LOW — GetProjectContext helper empty-set behavioral   | **Acceptable** — code + suite still green; empty `activeWorkspaces: new Set()` confirmed                     |

## Spec ↔ implementation map

| Spec                               | Implementation                                                                             | Tests                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `core:resolve-context-specs`       | `ResolveContextSpecs` + helper + `InvalidInputError`; kernel mount; public + SDK reexports | resolve-context-specs, resolve-configured-context-specs, parity, barrel-kernel |
| `cli:project-context-specs`        | `registerProjectContextSpecs` → `resolveCliContext` → kernel execute                       | project-context-specs (6) — exit 1 path                                        |
| `core:compile-context` (delta)     | helper for steps 1–4                                                                       | compile-context + parity                                                       |
| `core:get-project-context` (delta) | helper + empty active set                                                                  | get-project-context                                                            |

## Consistency with globals / deps

- `default:_global/error-handling-conventions`: expected validation failure uses `SpecdError` subclass — compliant.
- Hexagonal layering preserved; no SDK orchestration facade.
- Circular dep avoided: resolve-context-specs → list-workspaces + config only.

## Conclusion

Compliance audit is **clean**. No blockers.
