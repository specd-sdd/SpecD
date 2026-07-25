# Partial Recheck Notes — `save-artifact-reopen-vs-drift`

**Generated:** 2026-07-25T16:19:39+02:00  
**Mode:** Read-only re-audit after fixes  
**REPORT_DIR:** `reports/20260725-161939`

---

## Prior issues — closure check

| ID   | Sev | Issue                                                                          | Fix location                           | Test / evidence                                                                                        | Status     |
| ---- | --- | ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| D-01 | LOW | Port `get()` JSDoc said drift resets to `in-progress`                          | `change-repository.ts` L78–83          | JSDoc now: `artifact-drift` + `drifted-pending-review`; references `saveArtifact` byte-write semantics | **CLOSED** |
| T-01 | MED | `mutate().change` vs following `get()` parity after in-callback `saveArtifact` | `change-repository.spec.ts` L952–1036  | Asserts reconciled status/state match `get()` after `saveArtifact` inside `mutate`                     | **CLOSED** |
| T-02 | MED | In-callback `Change` unchanged immediately after `saveArtifact`                | `change-repository.spec.ts` L1021–1023 | `statusImmediatelyAfterWrite === 'complete'`; `hashImmediatelyAfterWrite === hash`                     | **CLOSED** |
| T-03 | MED | `saveArtifact` inside `mutateDraft` window                                     | `change-repository.spec.ts` L1070–1093 | Bytes written to drafts path; status unchanged in callback                                             | **CLOSED** |
| T-04 | MED | `mutateDraft` post-reconcile `{ result, change }` return                       | `change-repository.spec.ts` L1095–1114 | `result === 'restored'`; `restored.isDrafted === false`; matches `get()`                               | **CLOSED** |

### Bonus closures (original LOW gaps also addressed in same test file)

| ID   | Sev | Issue                                              | Evidence                               | Status     |
| ---- | --- | -------------------------------------------------- | -------------------------------------- | ---------- |
| T-05 | LOW | `create()` writes no artifact bytes                | `change-repository.spec.ts` L142–148   | **CLOSED** |
| T-07 | LOW | `DraftedChangeReadOnlyError` outside `mutateDraft` | `change-repository.spec.ts` L1046–1068 | **CLOSED** |

### Still open from original audit (not in fix scope)

| ID   | Sev | Issue                                                 | Status   |
| ---- | --- | ----------------------------------------------------- | -------- |
| T-06 | LOW | No test that `saveArtifact` skips list-index updates  | **OPEN** |
| T-08 | LOW | `StubChangeRepository` lacks post-reconcile semantics | **OPEN** |
| T-09 | LOW | `CreateChange` tests do not spy `repository.create`   | **OPEN** |
| T-10 | LOW | Composition wiring scenario not asserted              | **OPEN** |

---

## Test execution (spot)

```text
vitest run change-repository.spec.ts -t "saveArtifact|create is called, then only the manifest|mutateDraft restores"
→ PASS (11) FAIL (0) skipped (85)
```

---

## spec-preview spot-check (change-critical)

Commands:

```bash
node packages/cli/dist/index.js changes spec-preview save-artifact-reopen-vs-drift core:change-repository-port
node packages/cli/dist/index.js changes spec-preview save-artifact-reopen-vs-drift core:fs-change-repository
node packages/cli/dist/index.js changes spec-preview save-artifact-reopen-vs-drift core:create-change
```

Key merged requirements confirmed present:

- **CRP-05/06:** `{ result, change }` with post-reconcile `change`; `mutateDraft` same semantics
- **CRP-07:** `artifact-drift` cause; `drifted-pending-review` on drifted files; invalidation to `designing`
- **CRP-14/17:** `create` only for new; manifest writes in mutate/mutateDraft; `saveArtifact` bytes-only, no in-memory mutation
- **FCR-08:** Post-mutate reconcile re-enters load path; second persist when drift detected
- **FCR-09:** Mutation-window guard; no `Change` aggregate mutation in `saveArtifact`
- **FCR-06 (spec):** `saveArtifact` MUST NOT require list-index updates — implementation unchanged; test still missing (T-06)
- **CC-10:** `ChangeRepository.create` then `scaffold`; no public `save`

Implementation spot-check: port JSDoc now aligns with spec + `FsChangeRepository` behaviour (no new code discrepancies found).

---

## Counts (re-audit scope)

| Metric                                              | Count |
| --------------------------------------------------- | ----: |
| Prior issues targeted by fixes                      |     5 |
| Prior issues closed                                 |     5 |
| Additional LOW gaps closed in same pass             |     2 |
| Remaining LOW gaps (pre-existing, out of fix scope) |     4 |
| Change-critical requirements spot-checked           |    11 |
| Change-critical compliant (impl + spec-preview)     |    11 |
| New discrepancies found                             |     0 |

**Verdict (prior-issue scope):** **clean**

**Verdict (full original audit backlog):** **issues** — 4 LOW test-fidelity gaps remain (T-06, T-08–T-10); no MEDIUM+ production or spec-compliance gaps identified.
