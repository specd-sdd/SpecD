# Specs Compliance Report — `06-core-config-editing-boundary`

**Generated:** 2026-06-26 16:17:33  
**Mode:** change (`--change 06-core-config-editing-boundary`)  
**Change state:** `verifying`  
**Graph:** fresh (indexed 2026-06-26)

---

## Executive summary

P1e config-editing boundary refactor is **implemented correctly** for scope: `createConfigWriter()`, kernel slimmed, pass-through use cases removed, CLI migrated.

| Metric                             | Count |
| ---------------------------------- | ----: |
| Specs audited                      |     8 |
| Requirements pass (implementation) |    44 |
| Implementation failures            |     0 |
| Spec / verify artifact drift       |     3 |
| Test coverage gaps                 |     7 |

**Blocking for archive?** No — drift is artifact cleanup (`skillsInstalled`, `init-project` Constraints), not missing P1e behaviour.

**Recommended before archive:**

1. Fix `cli:project-init` delta — `plugins` not `skillsInstalled` in JSON output
2. Remove/replace `core:init-project` Constraints in delta
3. Optional: add export + injection tests; plugins install/uninstall JSON tests

---

## Spec scope

**Change specs:**

- `core:composition`, `core:kernel`, `core:init-project`, `core:config-writer-port`
- `cli:plugins-install`, `cli:plugins-uninstall`, `cli:project-init`
- `default:_global/architecture`

**Key files touched:**

- `packages/core/src/composition/config-writer.ts`
- `packages/core/src/composition/kernel.ts`, `kernel-internals.ts`
- `packages/cli/src/commands/project/init.ts`
- `packages/cli/src/commands/plugins/install.ts`, `uninstall.ts`

---

## Discrepancy index

| ID       | Severity | Type         | Spec                | Summary                                            |
| -------- | -------- | ------------ | ------------------- | -------------------------------------------------- |
| D-CORE-1 | Low      | Spec drift   | `core:init-project` | Constraints still describe deleted use case        |
| D-CORE-2 | Low      | Test gap     | `core:composition`  | No automated export / injection tests              |
| D-CLI-1  | Medium   | Spec drift   | `cli:project-init`  | Delta says `skillsInstalled`; code uses `plugins`  |
| D-CLI-2  | Medium   | Verify stale | `cli:project-init`  | verify scenario still checks `skillsInstalled`     |
| D-CLI-3  | Low      | Ambiguous    | `cli:project-init`  | Wizard includes `plugin-agent-standard` (superset) |

---

## Per-spec rollup

| Spec                           | Impl | Tests | Notes                                     |
| ------------------------------ | :--: | :---: | ----------------------------------------- |
| `core:composition`             |  ✅  |  ⚠️   | `createConfigWriter` + no kernel mutation |
| `core:kernel`                  |  ✅  |  ✅   | `getConfig` snapshot; no mutation entries |
| `core:init-project`            |  ✅  |  ⚠️   | Retired; Constraints drift                |
| `core:config-writer-port`      |  ✅  |  ✅   | `fs/config-writer.spec.ts` (14 tests)     |
| `cli:plugins-install`          |  ✅  |  ⚠️   | `createConfigWriter().addPlugin`          |
| `cli:plugins-uninstall`        |  ✅  |  ⚠️   | `createConfigWriter().removePlugin`       |
| `cli:project-init`             |  ✅  |  ⚠️   | Delegation OK; JSON field drift           |
| `default:_global/architecture` |  ✅  |   —   | Layer boundaries respected                |

---

## Detailed findings

### \_partial-core.md

# Partial: Core specs — `06-core-config-editing-boundary`

**Specs:** `core:composition`, `core:kernel`, `core:init-project`, `core:config-writer-port`

## Requirements summary

| Spec                    | Req focus                                                                                            | Impl status                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| core:composition        | `createConfigWriter()` symmetric to loader; no pass-through use cases; config mutation not in kernel | ✅ Pass                                      |
| core:kernel             | `kernel.project` query-only; no init/addPlugin/removePlugin                                          | ✅ Pass                                      |
| core:init-project       | Use case retired; not exported                                                                       | ✅ Pass (impl) / ⚠️ Spec drift (Constraints) |
| core:config-writer-port | `FsConfigWriter` implements port                                                                     | ✅ Pass                                      |

## Implementation status

### core:composition

- `packages/core/src/composition/config-writer.ts` — `createConfigWriter()` + `createConfigWriter({ configWriter })` overload
- Exported from `packages/core/src/composition/index.ts`
- `createKernel` does not instantiate `ConfigWriter` or mutation use cases (`kernel.ts`, `kernel-internals.ts`)
- Deleted: `application/use-cases/{init-project,add-plugin,remove-plugin}.ts`, `composition/use-cases/{init-project,add-plugin,remove-plugin}.ts`

**Runtime exports (`@specd/core`):** `createConfigWriter` present; `InitProject`, `AddPlugin`, `RemovePlugin`, `createInitProject`, `createAddPlugin`, `createRemovePlugin`, `FsConfigWriter` absent.

### core:kernel

- `Kernel.project` keys: `listWorkspaces`, `getProjectContext`, `getConfig`, `getMetadata`, `updateMetadata` only
- `kernel-internals.ts`: no `configWriter` field

### core:init-project

- Merged Purpose/Requirements: retired — behaviour on `ConfigWriter.initProject`
- Implementation matches retirement invariant
- **Constraints section in base spec not removed by delta** — still describes pass-through `InitProject` use case (see Discrepancies)

### core:config-writer-port

- Port: `application/ports/config-writer.ts`
- Adapter: `infrastructure/fs/config-writer.ts`
- Delivery: `createConfigWriter()` only (not kernel)

## Discrepancies

### D-CORE-1 — Spec drift: `core:init-project` Constraints (severity: low, artifact)

**Evidence (merged preview still includes):**

```markdown
## Constraints

- The use case has no business logic beyond delegation…
- `InitProject` is constructed with a single dependency…
```

**Delta** removed Requirements but not Constraints (`deltas/core/init-project/spec.md.delta.yaml`).

| Possibility | Assessment                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------ |
| Spec wrong  | **Likely** — Constraints should be removed or replaced with retirement note before archive |
| Code wrong  | No — use case deleted as intended                                                          |

**Fix:** Add delta op to remove/replace Constraints in `/specd-design`.

### D-CORE-2 — Test gap: export assertion (severity: low)

**Scenario:** `InitProject` / `createInitProject` not in `@specd/core` exports.

**Status:** Manual/runtime check passes; no automated test in `packages/core/test`.

## Test coverage

| Area                              | Tests                                          | Notes                                                |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `createConfigWriter` default      | `test/composition/config-writer.spec.ts`       | Methods exist only                                   |
| `createConfigWriter` injection    | —                                              | **Gap** — overload untested                          |
| Kernel no mutation entries        | `test/composition/kernel-get-config.spec.ts`   | `not.toHaveProperty` for init/addPlugin/removePlugin |
| Kernel no `configWriter` internal | —                                              | **Gap** — not asserted                               |
| `FsConfigWriter` port             | `test/infrastructure/fs/config-writer.spec.ts` | 14 tests — strong                                    |

## Summary

- **Pass:** 22 requirements (composition + kernel + config-writer-port + init retirement impl)
- **Fail:** 0 implementation
- **Drift:** 1 spec artifact
- **Test gaps:** 2

---

### \_partial-cli.md

# Partial: CLI specs — `06-core-config-editing-boundary`

**Specs:** `cli:project-init`, `cli:plugins-install`, `cli:plugins-uninstall`

## Requirements summary

| Spec                  | Req focus                                                             | Impl status |
| --------------------- | --------------------------------------------------------------------- | ----------- |
| cli:project-init      | `createConfigWriter().initProject`; no kernel/init use case           | ✅ Pass     |
| cli:plugins-install   | `createConfigWriter().addPlugin`; no `kernel.project.addPlugin`       | ✅ Pass     |
| cli:plugins-uninstall | `createConfigWriter().removePlugin`; no `kernel.project.removePlugin` | ✅ Pass     |

## Implementation status

### cli:project-init

- `packages/cli/src/commands/project/init.ts` — `createConfigWriter().initProject(...)` in interactive + non-interactive paths
- No `createInitProject`, `InitProject.execute`, or `kernel.project.init`
- Plugin install after init via `installPluginsWithKernel` (no kernel for yaml write)

### cli:plugins-install

- `packages/cli/src/commands/plugins/install.ts` — `createConfigWriter().addPlugin(configPath, type, name)` after `InstallPlugin`
- `installPluginsWithKernel` signature dropped `kernel` param
- Declared plugins read from loaded `SpecdConfig` (`getDeclaredPlugins`), not `ConfigWriter.listPlugins`

### cli:plugins-uninstall

- `packages/cli/src/commands/plugins/uninstall.ts` — `writer.removePlugin(configPath, type, name)` after plugin uninstall hook

## Discrepancies

### D-CLI-1 — Spec vs implementation: JSON output field name (severity: medium, artifact + verify)

**Merged spec** (`deltas/cli/project-init/spec.md.delta.yaml`, Non-interactive mode):

> `json` outputs `…,"skillsInstalled":{}` where `skillsInstalled` maps agent ids…

**Implementation** (`init.ts`):

```typescript
output({ result: 'ok', configPath, schema, workspaces, plugins: installed.plugins }, fmt)
```

**Tests** (`project-init.spec.ts`): assert `parsed.plugins`, not `skillsInstalled`.

| Possibility | Assessment                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- |
| Spec wrong  | **Likely** — plugin-phase output uses `plugins` array; `--agent` / `skillsInstalled` legacy |
| Code wrong  | Possible if archive must match written delta text                                           |

**Fix:** Update delta to document `plugins` field (or restore `skillsInstalled` in code — wider scope).

### D-CLI-2 — Verify scenario stale: `skillsInstalled` (severity: medium)

**Scenario:** `JSON output contains all fields including skillsInstalled` (`--agent claude`).

- Base `verify.md` scenario not updated in change delta
- Implementation + tests use `plugins`
- **Verify scenario would fail** if run literally today

### D-CLI-3 — Known plugin set vs wizard (severity: low, pre-existing)

**Spec:** wizard MUST expose claude, copilot, codex, opencode.

**Code:** `AVAILABLE_AGENT_PLUGINS` also includes `@specd/plugin-agent-standard`.

Superset of required set — **verify scenario** (opencode listed) passes; strict reading of "this known set" ambiguous. Not introduced by P1e.

## Test coverage

| Spec                  | Covered                                                                     | Gaps                                                                   |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| cli:project-init      | `project-init.spec.ts` — initProject delegation, `--plugin`, JSON `plugins` | No integration test for `.gitignore` / storage dirs (verify scenarios) |
| cli:plugins-install   | install + addPlugin mock                                                    | No `--format json` install test; no partial-failure exit 1 test        |
| cli:plugins-uninstall | uninstall + removePlugin mock                                               | No `--format json` uninstall test                                      |

## Summary

- **Pass:** 18 requirements (delegation + workflow)
- **Fail:** 0 core P1e implementation
- **Drift:** 2 spec/verify artifacts (`skillsInstalled`)
- **Test gaps:** 5 scenarios

---

### \_partial-global.md

# Partial: Global architecture — `06-core-config-editing-boundary`

**Spec:** `default:_global/architecture`

## Requirements summary

Change reinforces layered boundaries: config mutation via composition factory + port, not kernel use cases.

## Implementation status

✅ **Pass** — no new violations introduced:

- `ConfigWriter` port in `application/ports/`
- `FsConfigWriter` in `infrastructure/fs/` — only reached via `createConfigWriter()` in composition
- CLI imports `@specd/core` factory, not infrastructure adapter
- Domain/application layers unchanged by this change; deleted pass-through use cases removed thin delegation only

## Discrepancies

None specific to this change.

## Test coverage

N/A — architectural constraints enforced by structure and existing lint/graph conventions.

## Summary

- **Pass:** 4 relevant boundary rules
- **Fail:** 0
- **Drift:** 0
- **Test gaps:** 0

---

## Audit metadata

- **Report directory:** `specd-sdd/changes/20260625-142946-06-core-config-editing-boundary/reports/20260626-161733/`
- **Partials:** `_partial-core.md`, `_partial-cli.md`, `_partial-global.md`
- **Read-only audit** — no code or spec files modified
