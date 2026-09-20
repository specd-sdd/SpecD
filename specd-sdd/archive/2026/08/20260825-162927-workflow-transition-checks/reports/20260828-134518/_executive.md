# Specs-compliance — change `workflow-transition-checks`

- **Mode:** specific change (re-audit after sealed archive `dependsOn`, new-spec extract, GetStatus overlap, TransitionChange reload, CLI test layout, validate-artifacts permissive)
- **Date:** 2026-08-28 13:45 (`TIMESTAMP=20260828-134518`)
- **State at audit:** `designing` (`specs` drifted-pending-review: `core:transition-change`; verify/design/tasks pending-review)
- **Graph:** `graph index --force` failed (`graph-index worker exited unexpectedly`) after schema 5 vs 9. Subagents still ran `graph search` successfully for key symbols; otherwise Read/Grep.
- **Read-only:** no source or spec files were modified for this audit.

## Executive verdict

The two previous **must-fix HIGHs from recorte-26 / 12:17** on this change’s core path are **closed**:

1. **TransitionChange stale `Change` after refresh** — reloads after `RefreshImplementationTracking`; test mutates tracked files inside the refresh stub.
2. **Archive `resolveInitialPersistedDependsOn` bypass** — `resolveSealedArchiveDependsOn` is plan → lock → on-disk `resolveInitial` (no `explicitDependsOn`) → new-spec merge-extract / `[]`. `metadata.json` is not a fallback. Archive `deps.consistent` uses the same sealed set.

**ValidateArtifacts H1 (strict vs permissive)** is **closed by spec correction**: partial extract bags use `permissiveSpecMetadataSchema`; `strictSpecMetadataSchema` remains write-only. Named test matches.

**CLI leftover HIGH** (artifact-drift tests in `change.spec.ts`) is **closed**. Tests live in `change/status.spec.ts`.

The remaining **HIGH** is **H2 drift ownership**: policy-aware baseline drift is still specified on `ValidateArtifacts` and still implemented in `FsChangeRepository.get()` (`SYSTEM_ACTOR`). That is a spec-vs-spec / layering issue, not a regression of the sealed-dependsOn work.

## Recorte / follow-up checklist

| Item                                               | Verdict                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| GetStatus `includeOverlapDetection: true`          | **Compliant** (composition test is a source-string guard — INFO)          |
| Live `OVERLAP_CONFLICT` only in `archivable`       | **Compliant**                                                             |
| Invalidation overlap → review `/specd-design`      | **Compliant**                                                             |
| `to: 'next'` + reject pending/archivable/archiving | **Compliant**                                                             |
| `allowOutOfScope` skips links, not open files      | **Compliant** + TransitionChange tests                                    |
| TransitionChange reload after refresh              | **Fixed**                                                                 |
| Archive sealed `dependsOn` + hasher                | **Fixed**                                                                 |
| New spec lock gets extract `dependsOn`             | **Compliant** + tests                                                     |
| ValidateArtifacts permissive extract               | **Fixed** (spec + code + named test)                                      |
| Leftover CLI drift tests in `change.spec.ts`       | **Fixed** (file still duplicates non-drift status/transition tests — LOW) |
| Policy-aware drift on ValidateArtifacts            | **Still HIGH (H2)**                                                       |

## Highest-priority findings

Must-fix if you want validate-artifacts as written:

1. **HIGH — H2 drift ownership** (`_partial-rest`). Either implement baseline drift in `ValidateArtifacts` and stop duplicating it on `get()`, or move the requirement to `core:storage` and drop those validate-artifacts verify scenarios.

Next (this change’s remaining quality, not execute/status divergence):

2. **MEDIUM — lock-without-plan keep-lock** has no verify scenario / test (`_partial-archive-hooks` D3). Highest leftover regression risk for sealed `dependsOn`.
3. **MEDIUM — `graph.excludePaths` ignored** when materializing implementation links.
4. **MEDIUM — `LifecycleEngine.bypassFlags` never applied** (checks already `skip`; dead option).
5. **MEDIUM — lifecycle-engine verify.md** still expects `OVERLAP_CONFLICT` from history (contradicts spec.md LE-4).
6. **MEDIUM — CLI** prints any Core `OVERLAP_CONFLICT` blocker (tests mock empty blockers).
7. **MEDIUM — hasher vs contentHasher**, `templates:` vs `templateExpander`, rules `text` vs `instruction`.

## Aggregate counts (from partials; some overlap)

| Batch          | Compliant (approx)               | HIGH | MEDIUM | Notes                        |
| -------------- | -------------------------------- | ---- | ------ | ---------------------------- |
| core-lifecycle | 55 / 61                          | 0    | 2      | Prior HIGH reload closed     |
| archive-hooks  | sealed 11/12 + hooks/gates match | 0    | 2      | D3 test gap; excludePaths    |
| cli            | 46 / 47                          | 0    | 2      | Prior drift-test HIGH closed |
| rest           | ~22 confirmed / ~55 reviewed     | 1    | 7      | H2 only remaining HIGH       |

Partial files (source of truth for detail) remain in this directory:

- `_partial-core-lifecycle.md`
- `_partial-archive-hooks.md`
- `_partial-cli.md`
- `_partial-rest.md`

## Suggested next work

1. Decide H2: storage-owned drift vs ValidateArtifacts-owned drift; one owner.
2. Add archive test: lock exists, no `specDependsOn`, extract differs → lock kept, `resolveInitial` not called, `deps.consistent` fails against **lock**.
3. Implement or descope `graph.excludePaths` on archive materialization.
4. Repair lifecycle-engine verify _Overlap conflict detection from history_.
5. Optional: required `ContentHasher` on `ArchiveChange` ctor; `createDepsConsistent` archive vs ready unit test; permissive Zod unit tests.
