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
