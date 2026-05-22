# Spec compliance audit (partial): CLI

**Change:** `fix-validate-all-dag` (`20260521-094729-fix-validate-all-dag`)  
**Audited specs:** `cli:change-validate`, `cli:change-status`  
**Sources:** merged `spec-preview`, `packages/cli/src/commands/change/{validate,status}.ts`, `packages/cli/test/commands/{change-validate,change-status}.spec.ts`, `graph search executeBatch`  
**Mode:** read-only — no code modified

---

## Global consistency (`default:_global/*`, `cli:entrypoint`)

| Check                                                                  | Result                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Validation failures on **stdout**, CLI errors on **stderr**            | **PASS** — `validate.ts` routes validation to stdout via `output()`; `cliError` / `handleError` use stderr                |
| Exit codes 0/1/3 per `cli:entrypoint`                                  | **PASS** (validate/status); schema resolution failure path uses `handleError` → code 3 (not covered by CLI unit tests)    |
| Plural canonical commands (`changes validate`, `changes spec-preview`) | **PASS** in merged spec and implementation hints; Commander still registers `change validate` (alias-compatible per spec) |
| CLI does not recompute core validation paths / blocker semantics       | **PASS** — filenames and failure descriptions come from `ValidateArtifacts` metadata                                      |
| Status lifecycle from `GetStatus` only                                 | **PASS** — no `SchemaRegistry` / independent lifecycle recompute in `status.ts`                                           |

---

## `cli:change-validate`

### Merged preview summary

Delta replaces **Batch mode (`--all`)** with a DAG-driven driver: walk `schema.artifactDag().topologicalOrder()`, run change-scoped artifacts once, spec-scoped once per `specId`, optional `--artifact` filter, aggregate results, no early abort on failure. Constraints explicitly forbid a full multi-artifact pass per `specId`.

### Code mapping

| Requirement                               | Implementation                                                              | Location                       |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `executeBatch` DAG driver                 | `executeBatch()` — `dag.topologicalOrder()`, scope branch                   | `validate.ts:322–458`          |
| `--all` ∧ specPath mutual exclusion       | `cliError('--all and <specPath>...')`                                       | `validate.ts:169–171`          |
| Missing specPath / `--all`                | `cliError('either <specPath> or --all is required')`                        | `validate.ts:173–175`          |
| Spec-scoped: per `specId`                 | inner `for (const specId of specIds)`                                       | `validate.ts:383–399`          |
| Change-scoped: once                       | single `validate.execute` per artifact id                                   | `validate.ts:364–380`          |
| `--artifact` filter                       | `if (opts.artifact !== undefined && artifactId !== opts.artifact) continue` | `validate.ts:358–359`          |
| No early abort                            | all steps pushed to `results` before exit                                   | `validate.ts:358–457`          |
| Text summary `validated N/M steps`        | `output(\`validated ${passedSteps}/${results.length} steps\`)`              | `validate.ts:442–443`          |
| JSON batch `{ passed, total, results[] }` | `output({ passed, total, results }, fmt)`                                   | `validate.ts:445–452`          |
| File paths from metadata                  | `result.files` → `file:` / `missing:` lines                                 | `validate.ts:261–263, 411–413` |
| Preview hint (spec-scoped)                | `buildPreviewCommand` → `specd changes spec-preview ...`                    | `validate.ts:126–131, 268–272` |
| No preview for change-scoped              | `previewNote === null` when change-scoped                                   | `validate.ts:266–267, 416–419` |
| Single-spec `ValidateArtifacts`           | `executeSingle` → `kernel.changes.validate.execute`                         | `validate.ts:234–310`          |

**Graph:** `executeBatch` is defined only in `validate.ts:322` (not confused with `spec/generate-metadata.ts`).

### Tests

| verify.md scenario (batch / core)                               | Covered?                                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `--all` + specPath rejected                                     | **YES** — `rejects --all with specPath`                                                            |
| neither specPath nor `--all`                                    | **YES**                                                                                            |
| `--all` partial failures, all steps run                         | **YES** — `validated 1/2 steps`, exit 1                                                            |
| `--all` JSON `passed`, `total`, `results[]`                     | **YES**                                                                                            |
| `--all` + `--artifact` filters steps                            | **YES** (spec-scoped only mock)                                                                    |
| File paths from metadata                                        | **YES** (single-spec)                                                                              |
| Dependency-block wording preserved                              | **YES** (text + JSON)                                                                              |
| Change-scoped `--artifact` without specPath                     | **YES**                                                                                            |
| Spec-scoped `--artifact` without specPath → error               | **YES**                                                                                            |
| **DAG: change-scoped once, spec per specId, topological order** | **NO** — mock schema has only `specs` (spec-scoped); no `proposal` (change-scoped) step count test |
| Unknown artifact ID                                             | **NO**                                                                                             |
| Schema resolution exit 3                                        | **NO**                                                                                             |

### Discrepancies

| Severity   | Issue                                                                              | Spec                                                                     | Code / tests                                                                              |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **High**   | Change-scoped batch steps still pass **`specPath`** to `ValidateArtifacts`         | “invoke once … (**no `specPath`**)”                                      | `validate.ts:366–369` uses `specPath: batchSpecPath` (first `specId` placeholder)         |
| **Medium** | Preview hint wording                                                               | `note: inspect merged spec output with \`specd changes spec-preview …\`` | `note: verify merged output with: specd changes spec-preview …` (`validate.ts:268, 419`)  |
| **Medium** | Batch JSON result field name                                                       | `warnings: [...]` in each `results[]` entry                              | `notes` only in pushed objects (`validate.ts:349–356`); no `warnings` key                 |
| **Low**    | Extra structural disclaimer on every text result                                   | Not in success/failure templates                                         | `note: validation is structural; review artifact content separately…` always appended     |
| **Low**    | verify.md stale command group in several scenarios                                 | `specd change spec-preview`                                              | Merged spec + code use `changes spec-preview`; tests assert plural form                   |
| **Info**   | `passed` in single JSON derived from `failures.length === 0` in `toValidateResult` | Spec: `passed` from use case                                             | Normalization may diverge if core sends `passed: false` with empty `failures` (edge case) |

### Compliance verdict: **PARTIAL**

Core DAG scheduling, aggregation, mutual exclusion, and metadata-driven paths align with the change intent. The **change-scoped `specPath` placeholder** and **batch JSON `warnings` vs `notes`** are the main spec gaps.

---

## `cli:change-status`

### Merged preview summary

Delta strengthens **Schema-derived fields**: `schema.artifactDag` in topological order, `children` from `artifactDag().childrenOf(id)`, text DAG uses `roots()` / `childrenOf()`. Existing requirements for drift-aware JSON `artifactDag[].state`, task tags, and `GetStatus` serialization remain.

_(Note: workspace baseline `specs/cli/change-status/spec.md` still describes a simpler `artifactDag` without `children`/topological order; merged preview is authoritative for this change.)_

### Code mapping

| Requirement                                              | Implementation                                                                 | Location                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `schema.artifactDag` topological + `childrenOf`          | `ArtifactDag.from(schemaInfo.artifacts)` + `topologicalOrder()` / `childrenOf` | `status.ts:302–318`         |
| Top-level `artifactDag[].state` = display projection     | `displayStatus ?? 'missing'`                                                   | `status.ts:233–234`         |
| Text DAG `roots()` / `childrenOf`                        | `renderDag(dag, …)`                                                            | `status.ts:346–406, 99–104` |
| Details use `displayStatus`                              | `a.displayStatus` in details lines                                             | `status.ts:196, 202`        |
| `hasTasks` + task counts in DAG text                     | `[hasTasks - N/M done]`                                                        | `status.ts:382–385`         |
| Schema version warning                                   | `change.schema*` vs `lifecycle.schemaInfo` on stderr                           | `status.ts:68–77`           |
| Implementation section gated                             | `--implementation` only                                                        | `status.ts:64–66, 138–164`  |
| JSON includes `schema.artifactDag` with optional, output | `optional`, `output`, `children` in nested schema                              | `status.ts:309–317`         |

### Tests

| verify.md scenario                                              | Covered?                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| JSON `artifactDag` `children` = `childrenOf`                    | **YES** — `JSON artifactDag children match schema DAG childrenOf` |
| JSON drift `complete-with-drift` in top-level `artifactDag`     | **YES**                                                           |
| Text DAG tree / task counts / details `tasks: N/M`              | **YES**                                                           |
| Schema mismatch warning                                         | **YES**                                                           |
| Change not found                                                | **YES**                                                           |
| Implementation opt-in                                           | **YES**                                                           |
| Overlap conflict display                                        | **YES**                                                           |
| **Text DAG uses display state for drift**                       | **NO**                                                            |
| **Nested `schema.artifactDag` shape (optional, output, order)** | **NO** dedicated test                                             |
| **`hasTasks` when only `taskCompletionCheck` set**              | **NO**                                                            |

### Discrepancies

| Severity   | Issue                                                                                           | Spec                                                                                | Code / tests                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Medium** | Text **DAG tree** uses **`effectiveStatus`**, not display projection                            | “text output SHALL prioritize the **display state**”; drift → `complete-with-drift` | `renderDag`: `artifactStatus?.effectiveStatus` (`status.ts:377`) — JSON top-level `artifactDag` uses `displayStatus` correctly |
| **Medium** | `schema.artifactDag[].hasTasks` ignores `taskCompletionCheck`                                   | “true when … `hasTasks: true` **or** `taskCompletionCheck`”                         | `hasTasks: a.hasTasks` only (`status.ts:314`)                                                                                  |
| **Low**    | Merged spec adds `children` on nested `schema.artifactDag`; baseline spec file not yet archived | Delta only in change                                                                | Implementation matches **merged** spec                                                                                         |
| **Low**    | `stateSymbols` in `renderDag` has no `complete-with-drift` entry                                | Display states                                                                      | Falls through to `[?]` if display status ever used in tree without fix                                                         |

### Compliance verdict: **PARTIAL**

DAG topology and JSON drift projection match the change. Text DAG drift display and `hasTasks` derivation from `taskCompletionCheck` are not fully aligned with merged requirements.

---

## Cross-spec / change cohesion

- **`cli:change-validate` batch driver** depends on core `schema.artifactDag()` — aligned with **`cli:change-status`** schema DAG emission; both use `ArtifactDag` from `@specd/core`.
- **Status** is largely unchanged by validate work; audit findings on status are mostly pre-existing display vs effective status in the DAG renderer, not introduced by the validate delta.
- End-to-end scenario in validate verify (`fix-validate-all-dag --all` with `proposal` once) is **not** enforced by CLI unit tests yet.

---

## Recommended follow-ups (audit only)

1. **validate:** For `scope: change` in `executeBatch`, omit or document `specPath` per core contract; add test with multi-artifact DAG (`proposal` + `specs`).
2. **validate:** Align preview hint copy with spec (`inspect merged spec output`) or update spec to match intentional “verify” wording.
3. **validate:** Align batch JSON `results[]` field names (`warnings` vs `notes`) with spec and core payload.
4. **status:** Use `displayStatus` (with symbol map including `complete-with-drift`) in `renderDag`; add regression test.
5. **status:** Compute `hasTasks` for schema JSON as `a.hasTasks || a.taskCompletionCheck != null` (or core helper).

---

_Generated: 2026-05-22 — partial CLI audit for `fix-validate-all-dag`._
