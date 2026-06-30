# Proposal: 05-core-config-list-plugins

## Motivation

`kernel.project.listPlugins` re-reads `specd.yaml` through `ConfigWriter` to return plugin declarations that are already present on the in-memory `SpecdConfig` loaded at kernel construction. This duplicates I/O and keeps an unnecessary kernel entry on the config-read path. P1c removes that surface now that `getConfig` exposes the construction-time config snapshot (P0c).

## Current behaviour

- `ListPlugins` use case exists in `application/use-cases/list-plugins.ts` and is wired into `kernel.project.listPlugins`.
- The use case delegates to `ConfigWriter.listPlugins(configPath, type?)`, re-reading disk even when the caller already has a resolved `SpecdConfig`.
- `specd plugins list` calls `kernel.project.listPlugins.execute({ configPath, type })` to enumerate declarations, then uses `plugin-manager` `ListPlugins` for runtime load status per declaration.
- `core:kernel` spec already documents `project.getConfig` as the host-facing config snapshot and no longer lists `listPlugins` in the entry mapping — implementation lags the spec.
- `cli:plugins-list` depends on `core:config-writer-port` for reading declared plugins.

## Proposed solution

1. **Remove `ListPlugins` from the kernel** — drop `kernel.project.listPlugins`, the use-case factory, and wiring in `createKernel` / kernel internals. **Fully delete** the `ListPlugins` application use case, its composition factory, tests, and barrel exports (no deprecation period).
2. **Read declarations from config, not disk** — callers with a loaded `SpecdConfig` (CLI via `loadConfig`, hosts via `kernel.project.getConfig.execute()`) read `config.plugins` directly. Optional `--type` filtering inlined at the CLI call site (no shared helper).

`ConfigWriter.listPlugins` remains for write-path use cases (`add-plugin`, `remove-plugin`, `init-project`) — out of scope here.

## Specs affected

### New specs

_None._

### Modified specs

- `core:kernel`: Confirm `kernel.project` no longer exposes `listPlugins`; document that plugin declarations are read from `getConfig` / `SpecdConfig`, not a dedicated list use case. Align verify scenarios with implementation removal.
  - Depends on (added): `core:get-config`
  - Depends on (removed): none

- `cli:plugins-list`: Change how declared plugins are obtained — from `ConfigWriter.listPlugins` to `SpecdConfig.plugins` (loaded config or `getConfig` snapshot). Command signature, status detection, and output format unchanged.
  - Depends on (added): `core:get-config`
  - Depends on (removed): `core:config-writer-port`

- `cli:plugins-install`: Enumerate/check declared plugins from loaded `SpecdConfig.plugins` (not `kernel.project.listPlugins`). `ConfigWriter.addPlugin` write path unchanged.
  - Depends on (added): `core:get-config`
  - Depends on (removed): none (`core:config-writer-port` retained for persistence)

- `cli:plugins-update`: Read declared plugins from loaded `SpecdConfig.plugins` for update-all and name filtering. No config mutation.
  - Depends on (added): `core:get-config`
  - Depends on (removed): `core:config-writer-port`

## Impact

| Area                                                              | Change                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/core/src/composition/kernel.ts`                         | Remove `listPlugins` from `Kernel` interface and `createKernel` wiring         |
| `packages/core/src/composition/kernel-internals.ts`               | Drop list-plugins registry entry                                               |
| `packages/core/src/composition/use-cases/list-plugins.ts`         | Remove factory                                                                 |
| `packages/core/src/application/use-cases/list-plugins.ts`         | Delete use case (MEDIUM blast radius — kernel + tests)                         |
| `packages/cli/src/commands/plugins/list.ts`                       | Read `config.plugins` instead of `kernel.project.listPlugins`                  |
| `packages/cli/src/commands/plugins/install.ts`                    | Read declared plugins from `config.plugins` for already-installed check        |
| `packages/cli/src/commands/plugins/update.ts`                     | Read declared plugins from `config.plugins` for update-all / filter            |
| `packages/cli/test/commands/plugins.spec.ts`                      | Config-based declarations instead of listPlugins mock                          |
| `packages/cli/test/commands/plugins-update.spec.ts`               | Same                                                                           |
| `packages/cli/test/commands/plugins-install.spec.ts` (if present) | Same                                                                           |
| `docs/core/`                                                      | Update kernel docs if `listPlugins` is documented                              |
| Public API                                                        | Breaking: `kernel.project.listPlugins` removed; `getConfig` is the replacement |

No changes to `ConfigWriter` port, `plugin-manager` runtime list use case, or plugin load semantics.

## Technical context

- **Sequencing:** Depends on P0c (`getConfig` on kernel) — archived. Part of P1 kernel slimming; precedes P1d audit and P1e further `kernel.project` reduction.
- **Overlap:** `core:kernel` also targeted by `06-core-config-editing-boundary` — serialize archives to avoid merge conflicts.
- **Rejected alternative:** Keep `ListPlugins` as thin `getConfig` wrapper — still unnecessary kernel surface and obscures that declarations are config data, not a use-case operation.
- **Two different `ListPlugins` classes:** `core` lists declarations from yaml; `plugin-manager` lists runtime load status. This change only removes the core/kernel one. CLI keeps plugin-manager for status.
- **Graph impact:** Removing core `ListPlugins` is MEDIUM risk (kernel composition + tests). `ConfigWriter.listPlugins` stays — CRITICAL dependents elsewhere, untouched.

## Resolved decisions

- **`ListPlugins` use case:** full delete. Graph shows single consumer chain (kernel → CLI tests). No external `@specd/core` export today. Files removed: `application/use-cases/list-plugins.ts`, `composition/use-cases/list-plugins.ts`, `test/.../list-plugins.spec.ts`, kernel wiring, barrel exports.
- **Plugin declaration projection:** inline in CLI — read `config.plugins?.[type]` directly. No `listPluginDeclarations` helper, no new spec.
