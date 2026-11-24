# Spec compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260828-192030
- **Graph:** current (`lastIndexedAt` 2026-08-28T17:21:07Z)
- **Read-only audit.** Partial files remain in this directory for traceability.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide globals (depth 0):** conventions, testing, eslint, spec-layout, docs, error-handling-conventions

**Depth-1 deps:** checked for contradictions only (kernel, composition-resolver, count-tasks, run-step-hooks, compile-context, …)

## Executive findings (neither spec nor code is SoT)

### HIGH

1. **Domain imports application** — `packages/core/src/domain/services/lifecycle-engine.ts` imports `evaluateLifecycle` from application. Violates `default:_global/architecture` (Logger is the sole exception) and ESLint `no-restricted-imports`. **code-wrong** vs architecture; **spec-wrong** if `core:lifecycle-engine` still permits a domain shim.
2. **Overlap hop target** — `review.reason === 'spec-overlap-conflict'` keeps `nextHop.targetStep` on current `state`; spec hop matrix requires `designing`. Command is still `/specd-design`. **code-wrong**.
3. **Ctor/factory leftover `LifecycleEngine`** — GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction **code** uses functions; **preview specs/verify** still require injected `LifecycleEngine` / `createEvaluateLifecycle()`. **spec-wrong** (CODE WINS).

### MEDIUM

- DAG consumers call `evaluateLifecycle` (attaches `command`) instead of `evaluateLifecycleVerdict`.
- Domain `blockers` omit hop failures unless `requestedTarget` is set (GetStatus merges separately).
- `done`/`signed-off` command `/specd-verify` vs archive/signoff matrix tension.
- `hook.pre`/`hook.post` share `hook-effect.ts`.
- Committed `specs/cli/change-transition` still describes a CLI `--next` table; preview + code use `to: 'next'`.
- `schema-format` “requires must be complete” vs workflow-model/code `complete|skipped`.
- Conventions Spec Dependencies `_none` plus a list; eslint spec silent on Logger exception; possible ADR gap for ambient Logger.

### LOW

Stale verify names (`LifecycleEngine.evaluate`), CLI given/when/then titles, archive constraint “only archivable”, `log` vs `info` facade alias, schema catch-all, draft `nextAction` print, leftover `regenerateMetadata` in archive verify.

## Aggregate counts (sum of batches; requirements may overlap across batches)

| Batch              | Requirements | Discrepancies | Missing tests |
| ------------------ | -----------: | ------------: | ------------: |
| lifecycle-core     |           66 |            28 |            33 |
| archive-validate   |          105 |            19 |            16 |
| workflow-approvals |           87 |            13 |            21 |
| cli-skills         |           66 |            13 |             6 |
| globals            |           64 |            17 |            10 |
| **Sum**            |      **388** |        **90** |        **86** |

**Implementation:** no missing capability for the product model (checks, empty `checksByTarget` DAG, in-place approvals, CLI presenter). Gaps are layering (shim), hop target on overlap, and spec/verify lag.

**Focus pass on globals:** architecture preview has no `evaluateLifecycle` / core file paths; logging preview is generic ambient Logger.

## Batches

1. `_partial-lifecycle-core.md`
2. `_partial-archive-validate.md`
3. `_partial-workflow-approvals.md`
4. `_partial-cli-skills.md`
5. `_partial-globals.md`

---

# Detailed Findings

The following sections are the complete contents of each `_partial-*.md` file, verbatim.
