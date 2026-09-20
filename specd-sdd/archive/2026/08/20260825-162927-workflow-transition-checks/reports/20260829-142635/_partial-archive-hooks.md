# Spec-compliance audit (partial): archive, hooks, storage

**Mode:** change `workflow-transition-checks`  
**Scope:** `core:archive-change`, `core:hook-execution-model`, `core:storage`  
**Read-only**

---

## Implementation Status

| Requirement                                              | Verdict         | Evidence                                                       |
| -------------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| `failFastOn: 'schema.nameMatch'`                         | **Implemented** | `execute-matching-predicates.spec.ts`; archive bindings        |
| Overlap load after predicates                            | **Implemented** | `_loadArchiveOverlap` gated (`archive-change.ts:294-303`)      |
| `isArchivable` / `assertArchivable` includes `archiving` | **Implemented** | `change.spec.ts`                                               |
| Dual `runDepsConsistent` documented                      | **Implemented** | spec + merge-time pass                                         |
| Domain hook stub comments                                | **Implemented** | `domain/checks/hook-pre.ts`, `hook-post.ts`                    |
| Schema mismatch no peer `list`                           | **Implemented** | test `throws SchemaMismatchError without listing peer changes` |

---

## Discrepancies

### HIGH / MEDIUM / LOW

_None in this batch._

Optional note: overlap-fail may still double-scan peers in predicate details + host load — spec permits; not a MUST fail.

---

## Test Coverage

| Gap (prior)                    | Now                                            |
| ------------------------------ | ---------------------------------------------- |
| Schema mismatch skips `list()` | **Covered** (`archive-change.spec.ts:274-289`) |
| `archiving` retry              | Covered via entity + CLI (sibling batch)       |

---

## Closed vs prior `20260829-125651`

All four prior LOW items **remain CLOSED**.

---

## Summary counts

|        | Count |
| ------ | ----- |
| HIGH   | **0** |
| MEDIUM | **0** |
| LOW    | **0** |
