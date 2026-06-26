# Spec Compliance Audit — `03-core-host-orchestration-context`

**Mode:** change  
**Timestamp:** 2026-06-26T00:06:04  
**Change path:** `specd-sdd/changes/20260625-142937-03-core-host-orchestration-context/`  
**State at audit:** `verifying`

## Scope

| Spec                       | Type                                |
| -------------------------- | ----------------------------------- |
| `core:compile-context`     | change delta (P1a + inherited base) |
| `core:get-project-context` | change delta (P1a + inherited base) |
| `cli:change-context`       | change delta (P1a + inherited base) |
| `cli:project-context`      | change delta (P1a + inherited base) |

Dependencies reviewed for consistency (depth 1): `core:config`, `core:change`, `cli:entrypoint` — no contradictions with P1a host-orchestration pattern.

---

## Executive summary

| Metric                                    |  Count |
| ----------------------------------------- | -----: |
| Specs audited                             |      4 |
| P1a requirements checked                  |     18 |
| Fully compliant                           |     16 |
| Compliant (behavior) / wire-format nuance |      1 |
| Test coverage gaps                        |      3 |
| Implementation bugs                       |      0 |
| Spec drift (spec wrong?)                  |      0 |
| Out-of-scope code touched                 | 1 file |

**Verdict:** Implementation matches merged specs for all functional requirements. No blocking bugs. Minor test-coverage gaps and one verify-scenario wording vs intentional “omit override when equal to yaml default” design.

---

## `core:compile-context`

### P1a requirements

| Requirement                                                                     | Status | Evidence                                                                                                     |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Constructor accepts `defaultConfig` from yaml                                   | ✅     | `compile-context.ts` ctor final arg `_defaultConfig`; `kernel.ts` passes `buildCompileContextConfig(config)` |
| `defaultConfig` via internal `buildCompileContextConfig`                        | ✅     | `composition/build-compile-context-config.ts`; not re-exported from `composition/index.ts` or package barrel |
| `defaultConfig` includes projectRoot, configPath, context, patterns, workspaces | ✅     | `build-compile-context-config.spec.ts`                                                                       |
| `CompileContextInput` drops `config`; adds runtime overrides                    | ✅     | `CompileContextInput` interface — no `config` field                                                          |
| Merge at `execute` start                                                        | ✅     | `mergeCompileContextRuntimeOverrides` in `execute()`                                                         |
| Only `contextMode` / `llmOptimizedContext` overridable at runtime               | ✅     | `merge-compile-context-config.ts`                                                                            |
| Hosts must not pass yaml config per call                                        | ✅     | CLI commands updated; grep shows no `execute({ config:` in packages                                          |

### Test coverage

| Scenario / requirement                                 | Tests                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildCompileContextConfig` mapping                    | ✅ `build-compile-context-config.spec.ts`                                                                                                                          |
| Merge helper                                           | ✅ `merge-compile-context-config.spec.ts`                                                                                                                          |
| Runtime `contextMode` overrides baked default          | ⚠️ **Gap** — merge unit-tested; no integration test with ctor `defaultConfig: { contextMode: 'summary' }` + `execute({ contextMode: 'full' })` without legacy shim |
| `llmOptimizedContext` override wins                    | ⚠️ **Gap** — same; legacy tests still pass `config` via shim                                                                                                       |
| Inherited base scenarios (modes, traversal, staleness) | ✅ existing `compile-context.spec.ts` (via legacy shim)                                                                                                            |

### Discrepancies

None (implementation).

---

## `core:get-project-context`

### P1a requirements

| Requirement                             | Status | Evidence                               |
| --------------------------------------- | ------ | -------------------------------------- |
| Constructor `defaultConfig`             | ✅     | `get-project-context.ts`               |
| Input drops `config`; runtime overrides | ✅     | `GetProjectContextInput`               |
| Merge at `execute`                      | ✅     | same helper                            |
| Factory/kernel wiring                   | ✅     | `createGetProjectContext`, `kernel.ts` |

### Test coverage

| Scenario                         | Tests                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `execute({})` with baked default | ⚠️ **Gap** — `makeGetProjectContext` legacy shim still accepts `config` in execute; no dedicated native test |
| Inherited base scenarios         | ✅ existing suite (via shim)                                                                                 |

### Discrepancies

None (implementation).

---

## `cli:change-context`

### P1a requirements

| Requirement                                                            | Status | Evidence                                                           |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| No inline `CompileContextConfig` builder                               | ✅     | `change/context.ts` — no `compileConfig` / `workspacesConfig`      |
| Pass runtime overrides only                                            | ✅     | `execute({ name, step, contextMode?, llmOptimizedContext?, ... })` |
| `--no-optimized` → `llmOptimizedContext: false` when differs from yaml | ✅     | tested in `change-context.spec.ts`                                 |
| `--optimized` → `llmOptimizedContext: true` when yaml false            | ✅     | code: `opts.optimized === true` branch; **not tested**             |
| `RefreshImplementationTracking` before compile                         | ✅     | unchanged order in handler                                         |

### Verify delta — section flags + `llmOptimizedContext` wire format

**Scenario:** `--rules` only with `llmOptimizedContext: true` in yaml → verify says CLI passes `llmOptimizedContext: false` on execute.

**Implementation:** CLI omits override when computed value equals yaml default (`true`). `CompileContext` suppresses optimization via `shouldUseOptimizedContext` when sections lack both rules+constraints.

| Lens                                 | Assessment                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Behavior (THEN user-visible)         | ✅ Correct — raw sections, no false optimization                                                                                                       |
| Wire format (literal verify wording) | ⚠️ Nuance — `false` not forwarded; baked `true` + section gating achieves same effect                                                                  |
| Spec vs code                         | Design doc explicitly says “pass override only when differs from yaml default” — **code matches design**; verify delta wording is stricter than design |

### Test coverage gaps

- ❌ No test: `--optimized` with `llmOptimizedContext: false` in config → `execute` receives `{ llmOptimizedContext: true }`
- ❌ No test: section-flag scenarios from verify delta (rules-only / rules+constraints override forwarding)

---

## `cli:project-context`

### P1a requirements

| Requirement               | Status | Evidence                                        |
| ------------------------- | ------ | ----------------------------------------------- |
| No inline builder         | ✅     | `project/context.ts`                            |
| Runtime overrides only    | ✅     | tests assert `not.objectContaining({ config })` |
| `--no-optimized` override | ✅     | `project-context.spec.ts`                       |
| `--mode` override         | ✅     | `project-context.spec.ts`                       |

### Discrepancies

None.

---

## Cross-cutting / out of scope

| Item                                          | Notes                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/project/status.ts` | Updated to `getProjectContext.execute({})` — **not in change specIds**; required API migration side-effect |
| `buildCompileContextConfig` public export     | ✅ Not exported from `@specd/core` barrel                                                                  |
| `docs/core/use-cases.md`                      | ✅ Updated for ctor + runtime overrides                                                                    |

---

## Findings register

### F1 — LOW — Test gap: core runtime override integration

**Spec:** `core:compile-context` verify — “Runtime contextMode overrides baked default”; tasks 5.1  
**Issue:** Unit tests use legacy `config` shim on execute instead of ctor `defaultConfig` + `execute({ contextMode })`.  
**Code wrong?** No — production path correct.  
**Spec wrong?** No.  
**Fix:** Add 1–2 integration tests in `compile-context.spec.ts` using native API (optional before archive).

### F2 — LOW — Test gap: change-context `--optimized` + section flags

**Spec:** `cli:change-context` verify delta scenarios  
**Issue:** Missing spy assertions for `--optimized` and section-flag override cases.  
**Code wrong?** No — handler logic present.  
**Fix:** Extend `change-context.spec.ts`.

### F3 — INFO — Verify wording vs design (section flags)

**Spec:** verify delta says CLI must pass explicit `llmOptimizedContext` on section flags  
**Design:** omit override when value equals yaml default  
**Resolution:** Behavior compliant; consider softening verify delta wording in a future design pass (not blocking).

### F4 — INFO — Out-of-scope `project/status.ts`

Document in archive notes or fold into a follow-up CLI migration change if strict scope hygiene required.

---

## Recommendation

| Action                           | Priority                         |
| -------------------------------- | -------------------------------- |
| Proceed to `done` → `archivable` | ✅ Safe — no functional blockers |
| Add F1/F2 tests                  | Optional polish                  |
| Revise verify delta F3 wording   | Optional                         |
