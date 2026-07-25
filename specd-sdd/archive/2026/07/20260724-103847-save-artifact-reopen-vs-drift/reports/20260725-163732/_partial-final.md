# Partial Final Compliance Notes — `save-artifact-reopen-vs-drift`

**Generated:** 2026-07-25T16:37:32+02:00  
**Prior report:** `reports/20260725-161939/`  
**Mode:** Read-only file inspection + targeted test runs

---

## Fix-scope gap verification (T-06–T-10)

| ID   | Prior status | Evidence                                                                                                                                                                                                                                        | Status     |
| ---- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T-06 | OPEN         | `change-repository.spec.ts` L2644–2662: `given saveArtifact writes bytes inside mutate, when completed, then list-index files are unchanged` — asserts index content + `mtimeMs` unchanged inside `mutate` callback around `saveArtifact` alone | **CLOSED** |
| T-08 | OPEN         | `helpers.ts` L135–142 JSDoc documents stub limits (no drift reclassify); L226–249 `mutate`/`mutateDraft` persist then re-read from store for `MutateResult.change`                                                                              | **CLOSED** |
| T-09 | OPEN         | `create-change.spec.ts` L24–47: spies `create` + `scaffold`, asserts call order (`createOrder < scaffoldOrder`)                                                                                                                                 | **CLOSED** |
| T-10 | OPEN         | `composition/use-cases/create-change.spec.ts` L58–81: `resolveCreateChangeDeps` asserts all five dep keys + identity wiring to resolver; factory smoke tests                                                                                    | **CLOSED** |

---

## Previously closed (confirmed still closed)

| ID   | Evidence                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| D-01 | `change-repository.ts` L78–83 `get()` JSDoc: `artifact-drift`, `drifted-pending-review`, `saveArtifact` byte-write semantics |
| T-01 | `change-repository.spec.ts` L952–1036: post-reconcile `.change` matches `get()`                                              |
| T-02 | Same test L1021–1023: in-callback status/hash unchanged after `saveArtifact`                                                 |
| T-03 | L1070–1093: `saveArtifact` inside `mutateDraft`                                                                              |
| T-04 | L1095–1114: `mutateDraft` post-reconcile return                                                                              |
| —    | L142–148: `create` writes manifest only                                                                                      |
| —    | L1046–1068: `DraftedChangeReadOnlyError` outside `mutateDraft`                                                               |

---

## Targeted test runs

```text
vitest run test/infrastructure/fs/change-repository.spec.ts \
  -t "saveArtifact|create is called, then only the manifest|mutateDraft restores|list-index files are unchanged"
→ PASS (12) FAIL (0) skipped (85)

vitest run test/application/use-cases/create-change.spec.ts \
  -t "creates a change via repository create then scaffold"
→ PASS

vitest run test/composition/use-cases/create-change.spec.ts \
  -t "resolveCreateChangeDeps"
→ PASS
```

---

## Change-critical spot-check (implementation)

| Area                                     | File                                            | Spot-check                                                |
| ---------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `saveArtifact` window guard + bytes only | `fs/change-repository.ts` L776–821              | No manifest write, no `setFileStatus`; mutation-set guard |
| Index skip on `saveArtifact`             | `fs/change-repository.ts` L776–821 vs L268+     | `saveArtifact` does not call `_syncChangeIndex`           |
| `create` + `scaffold`                    | `create-change.ts` L147–148                     | `create` then `scaffold`                                  |
| `resolveCreateChangeDeps`                | `composition/use-cases/create-change.ts` L37–44 | Five deps from resolver                                   |
| Port `saveArtifact` contract             | `change-repository.ts` L245–268                 | Mutate-window, bytes-only JSDoc                           |

---

## Counts

| Metric                         | Count |
| ------------------------------ | ----: |
| Fix-scope gaps verified        |     4 |
| Fix-scope gaps closed          |     4 |
| Fix-scope gaps remaining       |     0 |
| Previously closed re-confirmed |     7 |
| Change-critical spot-checks    |    11 |
| Compliant spot-checks          |    11 |
| New discrepancies              |     0 |

**Verdict (fix-scope):** clean
