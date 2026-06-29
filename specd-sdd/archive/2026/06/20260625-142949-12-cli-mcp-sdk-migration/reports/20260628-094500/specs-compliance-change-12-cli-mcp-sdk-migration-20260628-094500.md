# Specs Compliance Report — Change `12-cli-mcp-sdk-migration`

**Timestamp:** 20260628-094500  
**Mode:** change (full verification + compliance audit)  
**Post-audit fixes applied:** cosmetic `@specd/core` comments; `codeGraphVersion` re-exported from `@specd/sdk`; removed CLI `code-graph-version.ts` duplicate.

---

## Executive Summary

| Area                      | Verdict                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Migration invariant**   | **PASS** — CLI/MCP depend on `@specd/sdk` only; zero direct `@specd/core` / `@specd/code-graph` imports in CLI `src/` |
| **Scenario verification** | **PASS** — 781 CLI + 21 SDK tests; lint + typecheck clean (post-fix)                                                  |
| **Compliance gaps**       | **7 non-blocking** discrepancies (pre-existing or out-of-scope); **0 critical** after stats import fix                |

---

## Verification (Simple) — All 11 specs

All WHEN/THEN scenarios satisfied at migration boundary. Tests + code inspection confirm SDK delegation (`openSpecdHost`, `buildProjectStatusSnapshot`, `runIndexProjectGraph`, `withOpenGraphProvider`).

---

## Compliance Findings (Full Audit)

### Fixed during this session

1. Comments in `version.ts` / `banner.ts` referenced `@specd/core` — updated to `@specd/sdk`.
2. CLI duplicated `code-graph-version.ts` reading `node_modules` path — removed; `codeGraphVersion` exported from SDK barrel.

### Remaining discrepancies (ranked)

| #   | Severity | Spec                  | Finding                                                                     | Assessment                                                     |
| --- | -------- | --------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Medium   | cli:graph-index       | Infrastructure indexing errors exit **1** not **3**                         | Pre-existing; not introduced by migration                      |
| 2   | Medium   | cli:graph-cli-context | `stats` / `index` call `withOpenGraphProvider` directly, not `withProvider` | Intentional for orchestration paths; spec wording strict       |
| 3   | Medium   | cli:graph-hotspots    | Default kinds include `interface`; spec says `class,method,function` only   | **code-graph** default; predates migration                     |
| 4   | Medium   | sdk:composition       | `export * from '@specd/core'` + extended code-graph re-exports              | Documented interim surface in design; spec says curated barrel |
| 5   | Low      | cli:project-status    | Text shows `fresh` when `graphHealth` is null                               | Edge-case label                                                |
| 6   | Low      | cli:entrypoint        | Generic `Error` throws remain in graph helpers                              | Ongoing migration gap                                          |
| 7   | Low      | cli:entrypoint        | `CLI_VALIDATION_ERROR` vs verify `INVALID_FORMAT` code string               | Behaviour correct                                              |

### Test coverage gaps (informational)

~25 scenarios lack dedicated CLI tests (lock exit 3 paths, `--graph` on project status, hotspots default kinds, search filters). Mock-heavy suites pass; integration gaps noted in partial reports.

---

## Partial Reports (verbatim)

See `_partial-cli-specs.md` and `_partial-graph-platform.md` in this directory.

---

## Recommendation

**Proceed to archive** for migration scope. Remaining items are either pre-existing, spec-drift, or follow-up polish — not blockers for A2b SDK boundary.

Optional follow-ups (separate change):

- Align hotspots default kinds with spec
- Narrow SDK barrel to explicit re-exports
- Route `stats`/`index` through `withProvider` for lifecycle uniformity
- Fix graph-index infrastructure exit code 3
