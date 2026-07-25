# Spec-Compliance Re-Audit: `save-artifact-reopen-vs-drift`

**Change:** `save-artifact-reopen-vs-drift`  
**Report generated:** 2026-07-25T16:19:39+02:00  
**Prior report:** `reports/20260725-160852/`  
**Scope:** `core:change-repository-port`, `core:fs-change-repository`, `core:create-change`  
**Method:** Read fixed files + targeted test review + `changes spec-preview` spot-check  
**Mode:** Read-only — no code or spec modifications

---

## Executive summary

The fixes applied after the initial audit **close all five previously reported issues** (one LOW documentation gap, four MEDIUM test gaps). Change-critical requirements remain compliant per merged spec previews and implementation spot-check. Four **LOW** test-fidelity gaps from the original audit were **not** part of this fix pass and remain open; none are MEDIUM+ or indicate production non-compliance.

**Verdict:** **clean** for the re-audit scope (prior flagged issues). **issues** if counting the full original LOW backlog (4 items).

---

## Prior issue closure

### D-01 — Port `get()` JSDoc (LOW) — CLOSED

**Before:** JSDoc described drift as resetting artifact status to `in-progress`.  
**After:** `packages/core/src/application/ports/change-repository.ts` lines 78–83 document:

- auto-invalidation with cause `artifact-drift`
- drifted files marked `drifted-pending-review`
- cross-reference to `saveArtifact` (byte writes do not reopen status)

Aligns with CRP-07 merged spec and `FsChangeRepository._manifestToChange` behaviour.

### T-01 — `mutate().change` vs `get()` parity (MEDIUM) — CLOSED

**Test:** `given a complete artifact changed inside mutate, when mutate returns, then .change reflects drift without saveArtifact forcing in-progress`  
**File:** `packages/core/test/infrastructure/fs/change-repository.spec.ts` lines 952–1036

Assertions:

- Post-reconcile `.change` artifact status matches `await repo.get(name)` (lines 1029–1035)
- Reconciled state matches `get()` state

### T-02 — In-callback `Change` unchanged by `saveArtifact` (MEDIUM) — CLOSED

**Same test** (lines 1021–1023):

- Immediately after `saveArtifact` inside callback: status remains `complete`, `validatedHash` unchanged
- Post-mutate `.change` reflects drift via reconcile (not via in-callback mutation)

### T-03 — `saveArtifact` inside `mutateDraft` (MEDIUM) — CLOSED

**Test:** `given mutateDraft is active, when saveArtifact is called, then bytes are written without reopening status`  
**File:** lines 1070–1093

- `saveArtifact` succeeds inside `mutateDraft`
- Callback `Change` status unchanged
- File bytes written under `drafts/`

### T-04 — `mutateDraft` post-reconcile return (MEDIUM) — CLOSED

**Test:** `given mutateDraft restores a draft, when it completes, then result and post-reconcile change are returned`  
**File:** lines 1095–1114

- `{ result: 'restored', change: restored }` with `restored.isDrafted === false`
- `get()` agrees with `restored.state` and `isDrafted`

### Additional closures (original LOW, fixed in same test pass)

| Issue                                               | Test                           | Status |
| --------------------------------------------------- | ------------------------------ | ------ |
| `create()` writes only manifest (no artifact bytes) | `create()` block lines 142–148 | CLOSED |
| `DraftedChangeReadOnlyError` outside `mutateDraft`  | lines 1046–1068                | CLOSED |

### Targeted test run

```text
vitest run test/infrastructure/fs/change-repository.spec.ts \
  -t "saveArtifact|create is called, then only the manifest|mutateDraft restores"
→ PASS (11) FAIL (0) skipped (85)
```

---

## Remaining issues (not closed in this fix pass)

| Severity | ID   | Description                                                              |
| -------- | ---- | ------------------------------------------------------------------------ |
| LOW      | T-06 | No test that `saveArtifact` does not update list indexes (FCR-06 verify) |
| LOW      | T-08 | `StubChangeRepository` lacks post-reconcile semantics (test fidelity)    |
| LOW      | T-09 | `CreateChange` tests do not spy `repository.create` (CC-10 wording)      |
| LOW      | T-10 | Composition test does not assert `resolveCreateChangeDeps` wiring        |

No new MEDIUM or HIGH issues identified.

---

## Change-critical compliance spot-check (`spec-preview`)

Merged previews for all three change specs were generated successfully. Sampled change-critical requirements:

| ID     | Requirement                                                              | Spot-check result                            |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------- |
| CRP-05 | `mutate` serializes updates; returns `{ result, change }` post-reconcile | ✅ Present in merged spec + port/impl        |
| CRP-06 | `mutateDraft` same return semantics                                      | ✅ Present + test T-04                       |
| CRP-07 | Auto-invalidation on drift; `artifact-drift`; `drifted-pending-review`   | ✅ Present + JSDoc D-01 fix                  |
| CRP-14 | `create` for new; no public `save`                                       | ✅ Present + create manifest-only test       |
| CRP-17 | `saveArtifact` mutate-window; bytes only; no in-memory mutation          | ✅ Present + tests T-01–T-03                 |
| CRP-25 | Abstract port surface                                                    | ✅ Unchanged compliant                       |
| FCR-07 | `create` first persist; collision refuse                                 | ✅ Present + tests                           |
| FCR-08 | Post-mutate reconcile                                                    | ✅ Present + tests T-01, T-04                |
| FCR-09 | `saveArtifact` window guard; no `Change` touch                           | ✅ Present + tests T-02, T-03                |
| FCR-06 | Index maintenance skips `saveArtifact`                                   | ✅ Spec compliant (impl); test gap T-06      |
| CC-10  | `create` + `scaffold`                                                    | ✅ Present in merged `create-change` preview |

Cross-spec alignment (port ↔ fs ↔ create-change) unchanged and consistent.

---

## Summary counts

| Metric                                       | Count |
| -------------------------------------------- | ----: |
| Prior issues in fix scope                    |     5 |
| Prior issues closed                          |     5 |
| Additional LOW gaps closed                   |     2 |
| Remaining issues (LOW, pre-existing backlog) |     4 |
| Change-critical requirements spot-checked    |    11 |
| Compliant (implementation + spec-preview)    |    11 |
| New discrepancies                            |     0 |

---

## Verdict

| Scope                               | Verdict                           |
| ----------------------------------- | --------------------------------- |
| **Re-audit (prior flagged issues)** | **clean**                         |
| **Full original audit backlog**     | **issues** (4 LOW test gaps only) |

**REPORT_DIR:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260724-103847-save-artifact-reopen-vs-drift/reports/20260725-161939`
