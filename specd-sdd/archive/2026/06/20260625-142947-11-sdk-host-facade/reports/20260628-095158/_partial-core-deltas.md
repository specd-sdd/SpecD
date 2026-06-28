# Partial Audit: Core Delta Specs (change 11-sdk-host-facade)

**Scope:** `core:composition` (delta), `core:kernel` (no-op delta)  
**Implementation relevance:** SDK bootstrap entry points in `packages/sdk/`

---

## core:composition (delta)

### New/Changed Requirement: @specd/sdk orchestrates cross-package host bootstrap

| Aspect                               | Finding                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status                               | ✅ Conformant                                                                                                                                                                                                            |
| Evidence                             | `@specd/sdk` package exists at `packages/sdk/` exporting `openSpecdHost` and `createSdkContext` per `src/index.ts` and `dist/index.d.ts`                                                                                 |
| Consistency with global architecture | SDK is a thin composition/orchestration layer delegating to `createConfigLoader`, `createKernel`, `createCodeGraphProvider` — aligns with hexagonal guidance that delivery hosts should not wire infrastructure directly |

### Verify Scenario: SDK package exists for host bootstrap

- **WHEN** delivery host needs config, kernel, and graph provider wiring
- **THEN** `@specd/sdk` provides `openSpecdHost` and `createSdkContext`
- **Result:** ✅ Implemented and exported

### Discrepancies

None. Delta requirement is satisfied by this change's implementation.

### Summary

- Conformant: 1 | Partial: 0 | Missing: 0 | Discrepancies: 0

---

## core:kernel (no-op delta)

### Assessment

Preview shows original kernel spec/verify unchanged. No new SDK-specific kernel wiring required in `@specd/core` for this change.

SDK correctly consumes:

- `kernel.project.getConfig.execute()`
- `kernel.project.getProjectSummary.execute()`
- `kernel.project.listWorkspaces.execute()`

These paths exist on the current kernel per `packages/core/src/composition/kernel.ts`.

### Consistency Check

- SDK does not expose config mutation on kernel — ✅
- SDK uses `getConfig` for readonly config rather than duplicating `SpecdConfig` on context (except `openSpecdHost` result which includes loaded config for host convenience — separate from `SdkHostContext`) — ✅ aligns with kernel spec

### Summary

- No delta requirements to implement in core code for this change.
- SDK usage of kernel API: Conformant.
