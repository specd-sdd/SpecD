# Partial Audit: use-cases

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-222916`  
**Graph:** unavailable (see lifecycle-core partial)  
**Read-only**

---

## Specs Audited

- `core:get-status`
- `core:transition-change`
- `core:archive-change`
- `core:hook-execution-model`
- `core:approve-spec`
- `core:approve-signoff`
- `core:validate-artifacts`
- `core:get-artifact-instruction`

---

## Per-Spec Findings

### `core:get-status`

| Req                                                 | Status          | Evidence                                                     |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| `executeChecksByLegalTargets` for all legal targets | **Implemented** | `get-status.ts:457`                                          |
| `checksByTarget` on result                          | **Implemented** | `get-status.ts:249`; CLI forwards (`change/status.ts:40-41`) |
| Archive predicates only in `archivable`             | **Implemented** | `get-status.ts:466-467`                                      |
| Blockers include `label` / `checkId`                | **Implemented** | `get-status.spec.ts`; `status.spec.ts:1061`                  |
| No progress bus on status                           | **Implemented** | snapshot-only                                                |

**Tests:** `get-status.spec.ts`, `status.spec.ts` — adequate.

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:transition-change`

| Req                                           | Status          | Evidence                                                  |
| --------------------------------------------- | --------------- | --------------------------------------------------------- |
| Predicate pass before effects                 | **Implemented** | `transition-change.ts` + `execute-matching-predicates.ts` |
| Effect slots by binding `phase` / `onFailure` | **Implemented** | no `switch` on `hook.pre` id in use case                  |
| Generic check progress bus                    | **Implemented** | `transition-change.spec.ts:1760-2016`                     |
| No rewrite to pending approval states         | **Implemented** | `transition.spec.ts:162-205`                              |
| Fail-fast `protocol.edge` on execute          | **Implemented** | tests pass                                                |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:archive-change`

| Req                                    | Status          | Evidence                                    |
| -------------------------------------- | --------------- | ------------------------------------------- |
| Operation `archive` bindings           | **Implemented** | `archive-change.ts` uses `_archiveBindings` |
| `hook.post` after-persist collect      | **Implemented** | `ARCHIVE_BINDING_SPECS` line 93             |
| No `archive.publication` check         | **Implemented** | binding table + tests                       |
| Publication preflight after predicates | **Implemented** | merge/publish remains in use case body      |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:hook-execution-model`

| Req                                             | Status          | Evidence                                               |
| ----------------------------------------------- | --------------- | ------------------------------------------------------ |
| `RunStepHooks` only inside hook check `execute` | **Implemented** | `hook-pre.ts`, `hook-post.ts`, `hook-effect-shared.ts` |
| Binding-table effect selection                  | **Implemented** | lifecycle use cases iterate bindings                   |
| Progress on generic bus                         | **Implemented** | hook output → `check-progress`                         |

Cross-spec consistency with `core:transition-checks`: **PASS** — no contradictions.

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:approve-spec` / `core:approve-signoff`

| Req                                                        | Status          | Evidence                                                     |
| ---------------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| Record consent in-place (no `TransitionChange` to pending) | **Implemented** | `approve-spec.ts:86` uses `boundFromStates('approval.spec')` |
| Signoff from `done` only                                   | **Implemented** | `boundFromStates('approval.signoff')` → `['done']`           |
| Separate commands                                          | **Implemented** | CLI `change approve` delegates                               |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:validate-artifacts`

| Req                                                       | Status          | Evidence                                              |
| --------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| Uses `evaluateLifecycleVerdict` with `checksByTarget: {}` | **Implemented** | `validate-artifacts.ts:220-222`                       |
| No snapshot bag / no per-check execute in validate        | **Implemented** | DAG-only lifecycle projection for validation ordering |
| Ready-step deps/workspace via transition-check model      | **Implemented** | aligned with change delta                             |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:get-artifact-instruction`

| Req                                                  | Status          | Evidence                                                               |
| ---------------------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| No `LifecycleEngine` class dependency                | **Implemented** | `get-artifact-instruction.spec.ts`; markdown-parser-real-merge fixture |
| `checksByTarget: {}` lifecycle projection            | **Implemented** | `get-artifact-instruction.ts:98`                                       |
| Ready gating uses lifecycle verdict not snapshot bag | **Implemented** | tests pass                                                             |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

## Batch Summary

| Specs | Req checked | HIGH | MEDIUM | LOW |
| ----: | ----------: | ---: | -----: | --: |
|     8 |          58 |    0 |      0 |   0 |
