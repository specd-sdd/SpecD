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
