# Spec Compliance Audit

- Change: `align-user-interface-with-main-conventions`
- Mode: `--change`
- Timestamp: `20260714-095242`
- Result: `1 finding`

## Scope

Audited the active change scope with emphasis on the specs whose deltas differ from the inherited no-op baseline:

- `studio-desktop:ipc-handler-registry`
- `studio-desktop:main-kernel-lifecycle`
- `client:dto-project-status`
- `api:presenter-project`
- `sdk:host-context`

Also checked the directly involved implementation and tests:

- `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
- `apps/specd-studio-desktop/package.json`
- `apps/specd-studio-desktop/tsup.main.config.ts`
- `packages/client/src/dto/project-status.ts`
- `packages/api/src/delivery/http/presenters/presenter-project.ts`
- `packages/api/src/composition/create-api-server.ts`
- `packages/sdk/src/composition/host-context.ts`
- `packages/client/test/project-status.spec.ts`
- `packages/api/test/presenter-graph-health.spec.ts`
- `packages/sdk/test/composition/host-context.spec.ts`
- `apps/specd-studio-desktop/test/desktop-host-lifecycle.spec.ts`

## Verification Evidence

- `pnpm test`, `pnpm lint`, and `pnpm typecheck` passed through the `verifying` pre-hooks.
- Focused tests passed:
  - `apps/specd-studio-desktop/test/desktop-host-lifecycle.spec.ts`
  - `packages/sdk/test/composition/host-context.spec.ts`
  - `packages/client/test/project-status.spec.ts`
  - `packages/api/test/presenter-graph-health.spec.ts`

## Findings

### 1. Spec drift in `studio-desktop:main-kernel-lifecycle` regarding CLI/API package dependencies

Status: `spec-level issue likely`, `implementation bug unlikely`

Relevant requirement:

- `studio-desktop:main-kernel-lifecycle` / `verify.md`
  - Scenario: `CLI and API keep the standard graph package`
  - Expected: CLI and API package dependencies include `@specd/code-graph` and do not include `@specd/code-graph-electron`

Observed implementation:

- [`packages/api/package.json`](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/package.json:1) depends on `@specd/sdk` and `@specd/client`, not `@specd/code-graph`
- [`packages/cli/package.json`](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/cli/package.json:1) depends on `@specd/sdk`, not `@specd/code-graph`
- API bootstrap in [`packages/api/src/composition/create-api-server.ts`](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/packages/api/src/composition/create-api-server.ts:1) correctly uses `createSdkContext`
- Desktop-specific graph runtime remains isolated to [`apps/specd-studio-desktop/src/main/ipc-handlers.ts`](/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/apps/specd-studio-desktop/src/main/ipc-handlers.ts:15) via `@specd/code-graph-electron`

Assessment:

- The implementation is coherent with the newer host-bootstrap direction expressed in `sdk:host-context` and with the package wiring visible in code.
- The failing part is the verification scenario wording in `studio-desktop:main-kernel-lifecycle`: it still asserts direct CLI/API dependency on `@specd/code-graph`, but the current architecture routes graph access through `@specd/sdk`.
- No user-facing runtime defect was found from this mismatch; the issue is a spec/compliance drift between the desktop lifecycle spec and the current SDK-centric composition conventions.

Suggested resolution:

- Update the spec scenario so it verifies that CLI and API use the standard graph runtime through `@specd/sdk` and do not depend on `@specd/code-graph-electron`.
- Do not change implementation unless the product decision is to reintroduce direct `@specd/code-graph` package dependencies for CLI/API.

## No Additional Findings

The following behaviors were verified as consistent with the scoped specs:

- `@specd/client` owns the canonical project-status mapper and keeps it free of `@specd/core` / `@specd/sdk` imports.
- API project-status presentation delegates to the shared client mapper.
- Desktop local project status also delegates to the same shared client mapper.
- Desktop local host bootstraps through `createDefaultConfigLoader({ startDir })` plus `createSdkContext(...)`.
- Desktop graph execution stays in the Electron-local runtime via `@specd/code-graph-electron`.
- The desktop main bundle is emitted as `dist/main/index.cjs` and externalizes `electron`, `@specd/sdk`, `@specd/client`, and `@specd/code-graph-electron`.

## Summary

- Verified scenarios: `pass`
- Compliance findings: `1`
- Recommended next action: `Update Specs`
