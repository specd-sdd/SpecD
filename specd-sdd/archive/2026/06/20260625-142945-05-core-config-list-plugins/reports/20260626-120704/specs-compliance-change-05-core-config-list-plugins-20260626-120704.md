# Specs Compliance Audit — Change `05-core-config-list-plugins`

**Date:** 2026-06-26 12:07:04  
**Mode:** change  
**State:** archivable  
**Specs in scope:** `core:kernel`, `cli:plugins-list`, `cli:plugins-install`, `cli:plugins-update`

---

## Executive Summary

| Metric                      | Count              |
| --------------------------- | ------------------ |
| Specs audited               | 4                  |
| Requirements (change scope) | **PASS**           |
| Implementation bugs         | **0**              |
| Test coverage gaps          | **4** (low/medium) |
| Pre-existing spec drift     | **1**              |
| Tracking/metadata issues    | **3**              |

**Verdict:** Implementation matches change specs. Safe to archive from compliance perspective. Recommended follow-ups: kernel negative test for `listPlugins`, CLI `--type missing` test, fix implementation tracking links, re-index graph.

---

## Aggregate Counts

- ✅ Conformant requirements: **all change-scoped requirements**
- ⚠️ Partial test coverage: **4 scenarios**
- ℹ️ Pre-existing drift (not introduced by change): **1**
- 🔧 Tooling/tracking: **3**

---

## Detailed Findings

### \_partial-core-kernel.md

# Partial: core:kernel

## Requirements Summary

- Remove `kernel.project.listPlugins`; plugin declarations are config data on `getConfig` snapshot.
- No redundant `ConfigWriter.listPlugins` for declaration reads.

## Implementation Status

| Requirement                               | Status   | Evidence                                                                              |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Plugin declarations not a kernel use case | **PASS** | `listPlugins` removed from `Kernel` interface and `createKernel` wiring (`kernel.ts`) |
| ListPlugins use case deleted              | **PASS** | `list-plugins.ts` (application + composition) deleted; barrels cleaned                |
| getConfig exposes plugins                 | **PASS** | `GetConfig` returns construction-time `SpecdConfig` including optional `plugins`      |

## Discrepancies

### D-K1 — Verify scenario vs kernel.project keys (pre-existing)

- **Spec/verify:** `Project group` scenario lists `recordSkillInstall`, `getSkillsManifest` among required keys.
- **Code:** `kernel.project` has `init`, `addPlugin`, `removePlugin`, `listWorkspaces`, `getProjectContext`, `getConfig`, `getMetadata`, `updateMetadata` — no `recordSkillInstall` / `getSkillsManifest`.
- **Assessment:** Pre-existing kernel spec/verify drift, outside P1c delta scope. Change correctly adds `does not contain listPlugins`.

## Test Coverage

| Scenario                                   | Covered? | Notes                                                                   |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| kernel.project does not expose listPlugins | **GAP**  | No explicit assertion in `kernel.spec.ts` / `kernel-get-config.spec.ts` |
| Plugin declarations on getConfig snapshot  | **GAP**  | `kernel-get-config.spec.ts` uses config without `plugins` field         |
| getConfig wired as GetConfig               | **PASS** | `kernel-get-config.spec.ts`                                             |

## Missing Tests (recommended)

1. `expect('listPlugins' in kernel.project).toBe(false)` after `createKernel`.
2. `getConfig.execute()` with `plugins.agents` populated returns same declarations.

## Summary

- Requirements implemented: **2/2** (change scope)
- Discrepancies: **1** (pre-existing, low severity for this change)
- Test gaps: **2**

---

### \_partial-cli-plugins.md

# Partial: cli:plugins-list, cli:plugins-install, cli:plugins-update

## cli:plugins-list

### Implementation Status: **PASS**

- `list.ts` uses `getDeclaredPlugins(config, type)` — no `kernel.project.listPlugins`, no `ConfigWriter`.
- Default type `agents` when `--type` omitted (line 43).
- Runtime status via `plugin-manager` `ListPlugins` (distinct from removed core use case).
- `docs/cli/plugins-list.md` updated.

### Test Coverage

| Scenario                          | Status                                                    |
| --------------------------------- | --------------------------------------------------------- |
| Declarations from config snapshot | **PASS** — `plugins.spec.ts` sets `config.plugins.agents` |
| Default type agents               | **PARTIAL** — no test with `plugins.other` present        |
| Unknown type empty                | **GAP** — no CLI integration test for `--type missing`    |
| Plugin status / output            | **PASS** — existing tests                                 |

---

## cli:plugins-install

### Implementation Status: **PASS**

- `installPluginsWithKernel` uses `getDeclaredPlugins(input.config, 'agents')` for already-installed check.
- `kernel.project.addPlugin` write path unchanged.
- `kernel` param retained (needed for `addPlugin`).

### Test Coverage

| Scenario                                              | Status                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Already-installed from config.plugins                 | **PASS** — `plugins.spec.ts` warning test                      |
| Declaration source (no listPlugins/ConfigWriter read) | **PARTIAL** — behavior covered; no explicit negative assertion |
| Install workflow / addPlugin                          | **PASS**                                                       |

### Docs: **PASS** — `plugins-install.md` describes config-based skip; no `ConfigWriter.listPlugins` read.

---

## cli:plugins-update

### Implementation Status: **PASS**

- `updatePluginsWithKernel` uses `getDeclaredPlugins`; `kernel` param removed.
- `project/update.ts` updated (caller fix).
- Update-all derives names from declared agents.

### Test Coverage

| Scenario                              | Status                                  |
| ------------------------------------- | --------------------------------------- |
| Update-all from config.plugins.agents | **PASS** — `plugins-update.spec.ts`     |
| Filter by name                        | **PASS**                                |
| Declaration source                    | **PARTIAL** — implicit via config setup |

### Docs: **PASS** — `plugins-update.md` references `plugins.agents`.

---

## Shared helper: get-declared-plugins.ts

### Implementation Status: **PASS**

- Pure read of `config.plugins[type]` with `?? []`.
- Unit tests: agents present, unknown type, undefined plugins.

## Implementation tracking issues

- Links attach `registerPluginsList` to `get-declared-plugins.ts` (wrong file — symbol lives in `list.ts`).
- Graph reports stale symbols on helper file (likely needs `graph index` post-change).
- `approval-system-notes.md` tracked as open — out of change scope; should `ignore`.

## Summary

- Requirements implemented: **PASS** (all three specs)
- Test gaps: **2** (unknown type CLI test; default-type isolation test)
- Tracking hygiene: **2** issues (wrong link targets, stray file)

---

## Recommendations

| Priority | Action                                                               |
| -------- | -------------------------------------------------------------------- |
| Low      | Add kernel test: `'listPlugins' not in kernel.project`               |
| Low      | Add CLI test: `plugins list --type missing` → empty                  |
| Low      | Fix `implementation add` links (`list.ts` for `registerPluginsList`) |
| Low      | `graph index` + `implementation resolve` tracked files               |
| Low      | `implementation ignore` for `approval-system-notes.md`               |
| Info     | D-K1 kernel.project key drift — separate change                      |

---

## Out of Scope (unchanged, correct)

- `ConfigWriter.listPlugins` port method — still exists, no prod caller after delete
- `plugin-manager` `ListPlugins` — runtime status, still used by CLI list
