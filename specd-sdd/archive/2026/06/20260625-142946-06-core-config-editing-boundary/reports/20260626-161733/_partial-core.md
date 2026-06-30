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
