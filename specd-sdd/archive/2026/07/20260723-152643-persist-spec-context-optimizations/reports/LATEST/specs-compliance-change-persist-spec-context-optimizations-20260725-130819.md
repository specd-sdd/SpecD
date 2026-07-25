# Specs Compliance Report — persist-spec-context-optimizations (Section 14 follow-up)

**Mode:** change (priority / verification-audit follow-up)  
**Change:** `persist-spec-context-optimizations`  
**Change path:** `specd-sdd/changes/20260723-152643-persist-spec-context-optimizations`  
**State at audit:** `verifying`  
**Timestamp:** 2026-07-25T13:08:19  
**Graph:** fresh (`stale: false`, `lastIndexedAt: 2026-07-23T17:37:31.659Z`)  
**Prior audit:** `reports/20260724-150329/` (confirmed bugs + CLI gaps)  
**Scope:** Section 14 priority specs + related spot-checks. Read-only; no code/spec edits.

---

## Summary verdict

**PASS WITH NOTES**

All seven priority section-14 behaviours from the previous audit are **implemented and now compliant**. Related spot-checks (`RegenerateSpecMetadata` force → `allowDependsOnOverwrite`, `GenerateSpecMetadata` `DependsOnOverwriteError`, `InitProjectResult.metadataCachePath`) also match intended behaviour.

Remaining notes are **test thinness** on some CLI contracts, a **related leftover** in `GetProjectContext` (materialize-before-list), and a **verify incompleteness** on `InitProjectResult` shape (field present in code, not listed in the interface-shape scenario).

---

## Priority specs

| Spec                                       | Status    | Severity | Evidence                                                                                          |
| ------------------------------------------ | --------- | -------- | ------------------------------------------------------------------------------------------------- |
| `core:update-persisted-spec-optimizations` | Compliant | —        | Clear-on-uninitialized early-returns without write; set uses `current.schema` when lock exists    |
| `core:get-persisted-spec-optimizations`    | Compliant | —        | Filtered absent → `freshness: 'missing'`; empty optimizations → `fresh: false`                    |
| `core:compile-context`                     | Compliant | —        | List mode short-circuits before `GetSpecMetadata` / materialization                               |
| `cli:spec-metadata`                        | Compliant | —        | Structured text counts + optional warnings/generatedBy; JSON includes source/regenerated/warnings |
| `cli:spec-generate-metadata`               | Compliant | —        | `--force` → `RegenerateSpecMetadata`; batch JSON has total/succeeded/failed                       |
| `cli:project-init`                         | Compliant | —        | Emits `metadataCachePath` from `InitProjectResult` (text + JSON)                                  |
| `cli:spec-optimizations`                   | Compliant | —        | `get --field` for absent field prints `…: missing`                                                |

### Spot-checks

| Spec / surface                  | Status           | Notes                                                                                           |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `core:regenerate-spec-metadata` | Compliant        | `force` maps to `policy: 'force'` + `allowDependsOnOverwrite: force`                            |
| `core:generate-metadata`        | Compliant        | Throws `DependsOnOverwriteError` when extracted ≠ persisted and overwrite disallowed            |
| `core:config-writer-port`       | Compliant (impl) | `InitProjectResult.metadataCachePath` present; verify shape scenario still omits the field name |

---

## Confirmed remaining gaps

No priority section-14 **implementation** gaps remain.

### Notes (non-blocking)

1. **`core:get-project-context` still materializes before list short-circuit** (related leftover from task 14.4 wording)
   - File: `packages/core/src/application/use-cases/get-project-context.ts:273-297`
   - `materializeContextSpecMetadata` runs, then `if (resolvedMode === 'list')` continues.
   - `core:compile-context` was fixed (`compile-context.ts:561-564` continues before materialize).
   - `get-project-context` verify does **not** carry an “only rendered specs are materialized” scenario, so this is efficiency/parity, not a hard priority FAIL.

2. **`core:config-writer-port` InitProjectResult shape verify lags code**
   - Code: `packages/core/src/application/ports/config-writer.ts:16-25` includes `metadataCachePath`.
   - Merged verify “InitProjectResult contains required fields” lists only `configPath`, `schemaRef`, `workspaces`.
   - Dual interpretation: extend verify to list `metadataCachePath`, or treat code as ahead of the shape scenario. CLI/behaviour scenarios already require the field.

3. **CLI test coverage thinner than implementation for some section-14 contracts** (see below) — behaviour looks correct; suites do not assert every verify scenario.

---

## Priority evidence (implementation)

### 1. `core:update-persisted-spec-optimizations`

- **Clear on uninitialized is no-op:** early return when `current === null` and no set fields — `update-persisted-spec-optimizations.ts:105-110` returns `{ specId, created: false }` before `getActiveSchema` / `writePersistedState`.
- **Set uses `current.schema` when lock exists:** `schemaForField = created ? schemaIdentity : current.schema` at `:150`.

### 2. `core:get-persisted-spec-optimizations`

- Filtered absent field: `_fieldResult` returns `{ freshness: 'missing', reasons: ['missing'] }` when `filter === name` and field undefined (`:129-133`).
- Aggregate `fresh: false` with no optimization fields: `includedFields.length > 0 && …` (`:98-100`) → empty ⇒ `false`.

### 3. `core:compile-context`

- After display-mode classification, `mode === 'list'` pushes list entry and `continue`s (`:561-564`) **before** `materializeContextSpecMetadata` (`:566-568`).
- Test asserts `getMetadata.execute` not called in list mode: `compile-context.spec.ts:2430-2474`.

> Note: dependsOn traversal may still call `_getMetadata` when `followDeps` is on (`:445`) — required by other verify scenarios; not a regression of “only rendered specs” assembly.

### 4. `cli:spec-metadata`

- Text: `source`, `regenerated`, optional `generatedBy`, `rules/constraints/scenarios` counts, optional `warnings:` (`metadata.ts:19-65`).
- JSON: top-level `source`, `regenerated`, `warnings`, nested `metadata` (`:116-126`).

### 5. `cli:spec-generate-metadata`

- `--force` option and `force` passed to `regenerateMetadata.execute` (`generate-metadata.ts:19,52,65`).
- Batch JSON: `total`, `succeeded`, `failed`, `result` ok/partial/error (`:87-119`).

### 6. `cli:project-init`

- Text: `metadata cache: ${initResult.metadataCachePath}` (`init.ts:104`).
- JSON: `metadataCachePath: initResult.metadataCachePath` (`:117`).

### 7. `cli:spec-optimizations`

- `freshness === 'missing'` → `${name}: missing` (`optimizations.ts:112-115`).

### Spot-checks

- **Regenerate:** `_regenerateOne` passes `allowDependsOnOverwrite: force` (`regenerate-spec-metadata.ts:92-96`).
- **Generate:** `resolveCanonicalDependsOn` throws `DependsOnOverwriteError` (`generate-spec-metadata.ts:305-318`); covered by generate-spec-metadata unit test (~line 440).
- **ConfigWriter:** `InitProjectResult.metadataCachePath`; FsConfigWriter returns `'.specd/metadata'`.

---

## Test coverage notes for section 14

| Area                                                                   | Coverage                                                                 | Gap                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| Update clear no-op                                                     | ✅ `update-persisted-spec-optimizations.spec.ts` (“no-ops clear…”)       | —                                        |
| Update persisted schema on set                                         | ✅ “records persisted schema when state already exists”                  | —                                        |
| Get missing field + aggregate fresh false                              | ✅ `get-persisted-spec-optimizations.spec.ts`                            | —                                        |
| CompileContext list skips GetSpecMetadata                              | ✅ `compile-context.spec.ts` (`not.toHaveBeenCalled`)                    | —                                        |
| CLI optimizations absent `--field`                                     | ✅ `spec-optimizations.spec.ts`                                          | —                                        |
| CLI project-init JSON `metadataCachePath`                              | ✅ `project-init.spec.ts`                                                | Text “metadata cache:” line not asserted |
| CLI generate-metadata `--force: true`                                  | ❌ only `force: false` asserted                                          | Add `--force` call-arg test              |
| CLI generate-metadata batch JSON totals                                | ❌ batch test does not assert `--format json` `{total,succeeded,failed}` | Add JSON batch assertion                 |
| CLI metadata rules/constraints/scenarios counts, warnings, generatedBy | ❌ thin happy-path only                                                  | Extend text/JSON contract tests          |
| Regenerate `allowDependsOnOverwrite: true`                             | ❌ only `false` path unit-tested                                         | Add `force: true` mapping test           |
| ConfigWriter `metadataCachePath` result                                | ✅ `config-writer.spec.ts`                                               | —                                        |

---

## Comparison to prior audit (2026-07-24)

| Prior finding                                                             | Now                                  |
| ------------------------------------------------------------------------- | ------------------------------------ |
| Clear-on-uninitialized creates lock                                       | **Fixed** — no-op                    |
| Set records active project schema even when lock exists                   | **Fixed** — uses `current.schema`    |
| Absent field omitted; aggregate fresh true with no fields                 | **Fixed** — missing + `fresh: false` |
| CompileContext materializes before list short-circuit                     | **Fixed**                            |
| CLI metadata / generate-metadata / project-init / optimizations contracts | **Fixed** in implementation          |

---

## Recommendation

Section 14 priority work is **implementation-complete** relative to the previous FAIL list. Remaining items are notes (test depth, `GetProjectContext` list-mode materialization parity, InitProjectResult verify shape completeness) — not blockers for the original confirmed bugs.
