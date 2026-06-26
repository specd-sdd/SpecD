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
