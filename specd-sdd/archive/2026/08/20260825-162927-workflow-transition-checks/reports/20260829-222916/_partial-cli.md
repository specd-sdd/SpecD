# Partial Audit: CLI

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-222916`  
**Read-only**

---

## Specs Audited

- `cli:change-status`
- `cli:change-transition`
- `cli:change-approve`
- `cli:change-archive`

**Spec source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks cli:<specId>`

---

## Cross-cutting CLI infrastructure

`_check-progress-presenter.ts` matches preview:

- Gerund `label` with `(id)` header
- `✓` / `✗` outcome lines
- No `Executing:` prefix (`transition.spec.ts:468`, `archive.spec.ts:507`)
- Structured `stream: "change-transition"|"change-archive"`

**Status:** **PASS** — no discrepancies.

---

## Per-Spec Findings

### `cli:change-status`

| Req                                             | Status          | Evidence              |
| ----------------------------------------------- | --------------- | --------------------- |
| Delegates lifecycle to GetStatus                | **Implemented** | `status.ts`           |
| Text blockers include check `label` / `checkId` | **Implemented** | `status.spec.ts:1061` |
| `checksByTarget` in JSON/TOON                   | **Implemented** | `status.ts:40-41`     |
| `/specd-verify` when tasks complete             | **Implemented** | `status.spec.ts:1034` |
| Drafted read-only                               | **Implemented** | existing tests        |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `cli:change-transition`

| Req                               | Status          | Evidence                                                   |
| --------------------------------- | --------------- | ---------------------------------------------------------- |
| Generic check bus rendering       | **Implemented** | `transition.ts` + presenter                                |
| No pending-spec-approval rewrite  | **Implemented** | `transition.spec.ts:162-184`                               |
| No pending-signoff rewrite        | **Implemented** | `transition.spec.ts:187-205`                               |
| JSON streams check events         | **Implemented** | `transition.spec.ts:418-559`                               |
| Chained status guidance respected | **Implemented** | CT-04 scenario covered in `transition.spec.ts` error paths |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `cli:change-approve`

| Req                                            | Status          | Evidence                                          |
| ---------------------------------------------- | --------------- | ------------------------------------------------- |
| `approve spec` / `approve signoff` subcommands | **Implemented** | `change/approve.ts`                               |
| No transition into pending states              | **Implemented** | delegates to ApproveSpec/ApproveSignoff use cases |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `cli:change-archive`

| Req                                              | Status          | Evidence                  |
| ------------------------------------------------ | --------------- | ------------------------- |
| Archive check bus                                | **Implemented** | `archive.ts` + presenter  |
| JSON check-progress then complete                | **Implemented** | `archive.spec.ts:114-146` |
| `--allow-overlap` / `--allow-out-of-scope` flags | **Implemented** | skippable check semantics |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

## Verify delta scenarios (CLI)

All 30 CLI verify scenarios from merged preview have corresponding automated tests in `packages/cli/test/commands/change/*.spec.ts` (899 CLI tests pass).

---

## Batch Summary

| Specs | Req checked | HIGH | MEDIUM | LOW |
| ----: | ----------: | ---: | -----: | --: |
|     4 |          38 |    0 |      0 |   0 |
