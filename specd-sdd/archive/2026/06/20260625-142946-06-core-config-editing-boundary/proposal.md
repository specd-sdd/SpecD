# Proposal: 06-core-config-editing-boundary

## Motivation

Config mutation (`initProject`, `addPlugin`, `removePlugin`) is exposed on `kernel.project` and wrapped in pass-through use cases (`InitProject`, `AddPlugin`, `RemovePlugin`) that add no logic beyond delegating to `ConfigWriter`. That couples yaml editing to the full kernel and duplicates the read-path pattern asymmetrically — reads already use `createConfigLoader()` + `loader.load()` with no use-case wrapper. P1e completes the config/kernel split started in P1c and aligns write access with read access.

## Current behaviour

- Three thin application use cases delegate 1:1 to `ConfigWriter` methods. Composition exposes `createInitProject()`, `createAddPlugin()`, `createRemovePlugin()` — each constructs `FsConfigWriter` and wraps one method.
- `createKernel` still wires all three on `kernel.project` (`init`, `addPlugin`, `removePlugin`). `KernelInternals` holds `configWriter` solely for that wiring.
- **Read path (already correct):** `createConfigLoader()` → `ConfigLoader.load()` — no use case, no kernel.
- **Write path (inconsistent):** `createInitProject()` → `InitProject.execute()` → `ConfigWriter.initProject()`, or `kernel.project.addPlugin`.
- `specd project init` calls `createInitProject()`; `plugins install` / `uninstall` call `kernel.project.addPlugin` / `removePlugin`.

## Proposed solution

1. **Add `createConfigWriter()`** — composition factory mirroring `createConfigLoader()`. Returns a wired `ConfigWriter` instance (`FsConfigWriter` by default; injectable in tests). Public export from `@specd/core`.
2. **Delete pass-through use cases and per-operation factories** — remove `InitProject`, `AddPlugin`, `RemovePlugin` application classes, `createInitProject` / `createAddPlugin` / `createRemovePlugin`, and their unit tests. Behaviour lives in `ConfigWriter` / `FsConfigWriter` (already tested via infrastructure integration tests).
3. **Remove config mutation from the kernel** — drop `kernel.project.init`, `addPlugin`, `removePlugin`; remove `configWriter` from `KernelInternals`.
4. **Delivery calls port methods directly** — yaml-only commands use `createConfigWriter()` then `writer.initProject()` / `addPlugin()` / `removePlugin()`. Construct kernel only when domain work follows.
5. **Retire `core:init-project` spec** — requirements fold into `core:config-writer-port` (`initProject` operation) and `core:composition` (`createConfigWriter`). The standalone use-case spec becomes redundant.

## Specs affected

### New specs

_None._

### Modified specs

- `default:_global/architecture`: Document `createConfigWriter()` as the write-path counterpart to `createConfigLoader()`. Delivery mechanisms MAY call `ConfigWriter` methods on the instance returned by the factory; they MUST NOT import `FsConfigWriter` or construct the port directly.
  - Depends on (added): none
  - Depends on (removed): none

- `core:composition`: Add `createConfigWriter()` requirement (parallel to `ConfigLoader`). Remove references to `createInitProject` / `createAddPlugin` / `createRemovePlugin` as public factories. State config mutation MUST NOT be wired into `createKernel`.
  - Depends on (added): `core:config-writer-port`
  - Depends on (removed): `core:init-project`

- `core:config-writer-port`: Becomes the single spec for all write operations (`initProject`, `addPlugin`, `removePlugin`). Absorb init requirements currently duplicated in `core:init-project`. Document that delivery reaches the port via `createConfigWriter()`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:init-project`: **Retire** — delta removes or supersedes the use-case spec; surviving requirements move to `core:config-writer-port`.
  - Depends on (added): none
  - Depends on (removed): none (spec retired)

- `core:kernel`: Remove `project.init`, `project.addPlugin`, `project.removePlugin` from kernel surface and entry mapping. Drop `configWriter` from kernel internals.
  - Depends on (added): none
  - Depends on (removed): `core:init-project` (already removed from manifest deps)

- `cli:project-init`: Replace `createInitProject()` / `InitProject.execute()` with `createConfigWriter().initProject(...)`.
  - Depends on (added): `core:composition`, `core:config-writer-port`
  - Depends on (removed): none

- `cli:plugins-install`: Replace `kernel.project.addPlugin` with `createConfigWriter().addPlugin(...)`.
  - Depends on (added): `core:composition`
  - Depends on (removed): none

- `cli:plugins-uninstall`: Replace `kernel.project.removePlugin` with `createConfigWriter().removePlugin(...)`.
  - Depends on (added): `core:composition`
  - Depends on (removed): none

## Impact

| Area                                                                                 | Change                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `packages/core/src/composition/config-writer.ts`                                     | **New** — `createConfigWriter()` factory                                |
| `packages/core/src/composition/kernel.ts`                                            | Remove `init`, `addPlugin`, `removePlugin` from `Kernel.project`        |
| `packages/core/src/composition/kernel-internals.ts`                                  | Drop `configWriter` from internals                                      |
| `packages/core/src/composition/use-cases/{init-project,add-plugin,remove-plugin}.ts` | **Delete**                                                              |
| `packages/core/src/application/use-cases/{init-project,add-plugin,remove-plugin}.ts` | **Delete**                                                              |
| `packages/core/test/application/use-cases/{init,add,remove}-plugin.spec.ts`          | **Delete** (covered by `config-writer` integration tests)               |
| `packages/cli/src/commands/project/init.ts`                                          | `createConfigWriter().initProject(...)`                                 |
| `packages/cli/src/commands/plugins/{install,uninstall}.ts`                           | `createConfigWriter().addPlugin` / `removePlugin`                       |
| `packages/cli/test/commands/{project-init,plugins}.spec.ts`                          | Mock `createConfigWriter` instead of use-case factories                 |
| `docs/core/`                                                                         | Document `createConfigWriter`; remove kernel init/add/remove references |

**Public API — breaking:**

| Removed                                                              | Replacement                 |
| -------------------------------------------------------------------- | --------------------------- |
| `kernel.project.init` / `addPlugin` / `removePlugin`                 | —                           |
| `createInitProject()` / `createAddPlugin()` / `createRemovePlugin()` | `createConfigWriter()`      |
| `InitProject` / `AddPlugin` / `RemovePlugin` types                   | `ConfigWriter` port methods |

No changes to `ConfigWriter` operation signatures, plugin-manager orchestration, or `FsConfigWriter` behaviour.

## Technical context

- **Symmetry with read path:** `createConfigLoader()` already returns a port for direct method calls. `createConfigWriter()` completes the pair. Architecture spec currently says "one factory per use case" — this change adds an explicit exception for config I/O ports (read + write).
- **Sequencing:** After P1c (archived). Before P1d. Archive before `07-core-kernel-input-audit`.
- **`listPlugins` on `ConfigWriter`:** Deprecated for reads (P1c). Port method may remain for internal/legacy use but delivery MUST NOT use it for declaration reads.
- **Rejected:** Keep thin use cases "for future hooks" — YAGNI; add use case later if orchestration appears. Rejected: export `FsConfigWriter` directly — breaks port boundary.
- **Graph impact:** MEDIUM. Deletes touch kernel, composition exports, CLI init + plugins. `FsConfigWriter` integration tests remain authoritative for behaviour.

## Open questions

_None — resolved in design discussion:_

- **Use cases vs port:** Delete pass-through use cases; `createConfigWriter()` + port methods is the public API.
- **`core:init-project` spec:** Retire; requirements fold into `core:config-writer-port`.
- **`cli:project-init`:** Added to change scope — must migrate off `createInitProject`.
- **Architecture global spec:** Added to change scope — document write-port factory exception.
