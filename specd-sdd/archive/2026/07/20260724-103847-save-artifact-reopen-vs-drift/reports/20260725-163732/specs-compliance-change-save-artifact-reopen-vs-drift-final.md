# Spec-Compliance Final Re-Audit: `save-artifact-reopen-vs-drift`

**Change:** `save-artifact-reopen-vs-drift` (`20260724-103847-save-artifact-reopen-vs-drift`)  
**Report generated:** 2026-07-25T16:37:32+02:00  
**Prior report:** `reports/20260725-161939/`  
**Scope:** `core:change-repository-port`, `core:fs-change-repository`, `core:create-change`  
**Method:** Read fixed files + targeted test review + implementation spot-check against change deltas  
**Mode:** Read-only — no code or spec modifications

---

## Executive summary

All four remaining **LOW** gaps from the prior recheck (T-06, T-08, T-09, T-10) are **closed**. Together with the five issues closed in the earlier pass (D-01, T-01–T-04) and two additional LOW closures (`create` manifest-only, `DraftedChangeReadOnlyError`), the change has **zero open compliance gaps** in audit scope.

Change-critical requirements across the three scoped specs remain compliant in implementation and are covered by targeted tests where verify scenarios demand them.

**Verdict:** **clean**

---

## Fix-scope gap closure (this pass)

### T-06 — `saveArtifact` does not update list indexes (LOW) — CLOSED

**Requirement:** FCR-06 verify — `saveArtifact()` / skip / non-listing history MUST NOT require list-index updates.

**Test:** `given saveArtifact writes bytes inside mutate, when completed, then list-index files are unchanged`  
**File:** `packages/core/test/infrastructure/fs/change-repository.spec.ts` lines 2644–2662

Assertions inside `mutate` callback:

- Reads `.specd-index.jsonl` before and after `saveArtifact`
- Expects identical content and `mtimeMs` (index untouched for byte write alone)

**Implementation alignment:** `FsChangeRepository.saveArtifact` (lines 776–821) performs `fs.writeFile` only; no `_syncChangeIndex` call.

### T-08 — `StubChangeRepository` post-persist semantics (LOW) — CLOSED

**File:** `packages/core/test/application/use-cases/helpers.ts`

- **JSDoc** (lines 135–142): documents that stub does not simulate filesystem drift reclassification; directs integration tests to `FsChangeRepository`
- **`mutate`** (lines 226–236): persists callback aggregate, then re-reads from store for `MutateResult.change`
- **`mutateDraft`** (lines 242–249): same re-read pattern

Aligns stub fidelity with port contract shape (`{ result, change }` from post-persist store) without claiming drift reconcile.

### T-09 — `CreateChange` spies `create` then `scaffold` (LOW) — CLOSED

**Test:** `creates a change via repository create then scaffold`  
**File:** `packages/core/test/application/use-cases/create-change.spec.ts` lines 24–47

- `vi.spyOn(repo, 'create')` and `vi.spyOn(repo, 'scaffold')`
- Each called once; `create` invoked with `result.change`
- `createOrder < scaffoldOrder` enforces CC-10 sequencing

**Implementation:** `packages/core/src/application/use-cases/create-change.ts` lines 147–148 — `create` then `scaffold`.

### T-10 — `resolveCreateChangeDeps` wiring (LOW) — CLOSED

**Test:** `resolveCreateChangeDeps resolves all CreateChange deps`  
**File:** `packages/core/test/composition/use-cases/create-change.spec.ts` lines 58–81

Asserts:

- Dep keys: `actor`, `changes`, `detectOverlap`, `getActiveSchema`, `listWorkspaces`
- Identity wiring to resolver getters
- `detectOverlap` is `DetectOverlap` instance
- Both config-based and deps-based `createCreateChange` produce `CreateChange`

**Implementation:** `packages/core/src/composition/use-cases/create-change.ts` lines 37–44.

---

## Prior pass closures (re-confirmed)

| ID   | Severity | Summary                                                        | Status |
| ---- | -------- | -------------------------------------------------------------- | ------ |
| D-01 | LOW      | Port `get()` JSDoc drift semantics                             | CLOSED |
| T-01 | MEDIUM   | `mutate().change` vs `get()` parity after `saveArtifact`       | CLOSED |
| T-02 | MEDIUM   | In-callback `Change` unchanged by `saveArtifact`               | CLOSED |
| T-03 | MEDIUM   | `saveArtifact` inside `mutateDraft`                            | CLOSED |
| T-04 | MEDIUM   | `mutateDraft` post-reconcile return                            | CLOSED |
| —    | LOW      | `create()` manifest-only (no artifact bytes)                   | CLOSED |
| —    | LOW      | `DraftedChangeReadOnlyError` for `saveArtifact` outside window | CLOSED |

---

## Remaining issues

**None.** Fix-scope and full audit backlog: **0** open items.

---

## Change-critical compliance spot-check

Sampled against change deltas and implementation:

| ID     | Spec                   | Requirement                                                            | Result                          |
| ------ | ---------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| CRP-05 | change-repository-port | `mutate` serializes; returns `{ result, change }` post-reconcile       | ✅ Impl + tests T-01            |
| CRP-06 | change-repository-port | `mutateDraft` same return semantics                                    | ✅ Impl + test T-04             |
| CRP-07 | change-repository-port | Auto-invalidation on drift; `artifact-drift`; `drifted-pending-review` | ✅ JSDoc D-01 + reconcile tests |
| CRP-14 | change-repository-port | `create` for new; no public `save`                                     | ✅ Impl + manifest-only test    |
| CRP-17 | change-repository-port | `saveArtifact` mutate-window; bytes only; no in-memory mutation        | ✅ Impl + tests T-01–T-03       |
| CRP-25 | change-repository-port | Abstract port surface                                                  | ✅ Unchanged compliant          |
| FCR-06 | fs-change-repository   | Index maintenance skips `saveArtifact`                                 | ✅ Impl + test T-06             |
| FCR-07 | fs-change-repository   | `create` first persist; collision refuse                               | ✅ Impl + tests                 |
| FCR-08 | fs-change-repository   | Post-mutate reconcile                                                  | ✅ Impl + tests T-01, T-04      |
| FCR-09 | fs-change-repository   | `saveArtifact` window guard; no `Change` touch                         | ✅ Impl + tests T-02, T-03      |
| CC-10  | create-change          | `create` + `scaffold` sequencing                                       | ✅ Impl + test T-09             |

Cross-spec alignment (port ↔ fs adapter ↔ create-change) is consistent.

---

## Targeted test evidence

```text
vitest run test/infrastructure/fs/change-repository.spec.ts \
  -t "saveArtifact|create is called, then only the manifest|mutateDraft restores|list-index files are unchanged"
→ PASS (12) FAIL (0) skipped (85)
```

Create-change unit and composition tests for T-09/T-10: **PASS**.

---

## Summary counts

| Metric                                    | Count |
| ----------------------------------------- | ----: |
| Total issues tracked across audit history |    11 |
| Issues closed (all passes)                |    11 |
| Remaining issues (fix-scope)              |     0 |
| Remaining issues (full backlog)           |     0 |
| Change-critical requirements spot-checked |    11 |
| Compliant (implementation + tests)        |    11 |
| New discrepancies                         |     0 |

---

## Verdict

| Scope                                    | Verdict   |
| ---------------------------------------- | --------- |
| **Final re-audit (fix-scope T-06–T-10)** | **clean** |
| **Full change compliance backlog**       | **clean** |

**REPORT_DIR:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260724-103847-save-artifact-reopen-vs-drift/reports/20260725-163732`
