# Spec Compliance Audit

- Mode: `--change align-user-interface-with-main-conventions`
- Timestamp: `2026-07-14 14:03:31 +0200`
- Change path: `/Users/monki/Documents/Proyectos/specd-worktrees/feat-user-interface/specd-sdd/changes/20260713-154752-align-user-interface-with-main-conventions`
- Graph freshness: `stale=false`, `currentRef=eb0857bf`

## Scope

Audited change specs:

- `core:composition`
- `core:kernel`
- `core:config`
- `core:config-loader`
- `core:get-project-context`
- `core:get-spec-context`
- `core:validate-specs`
- `sdk:composition`
- `core:get-change-artifact`
- `core:get-read-only-change-artifact`
- `core:outline-change-artifact`
- `core:read-log`
- `core:save-change-artifact`
- `core:validate-change-batch`
- `cli:entrypoint`
- `api:composition-create-api-server`
- `api:routes-project-logs`
- `studio-desktop:ipc-handler-registry`
- `studio-desktop:main-kernel-lifecycle`
- `code-graph-electron:composition`
- `client:dto-project-status`
- `api:dto-project-status`
- `api:presenter-project`
- `api:handler-project`
- `sdk:host-context`

Project-wide/global dependency context considered:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/error-handling-conventions`
- `default:_global/eslint`
- `default:_global/logging`
- `default:_global/spec-layout`
- `default:_global/testing`

## Method

The audit used:

- `changes status` and `changes spec-preview` to read merged change state and merged spec artifacts.
- `graph stats` and `graph search` to identify the canonical project-status mapper, desktop IPC status path, and SDK host bootstrap symbols.
- Direct code inspection for:
  - `packages/client/src/dto/project-status.ts`
  - `packages/api/src/delivery/http/presenters/presenter-project.ts`
  - `packages/api/src/delivery/http/handlers/handler-project.ts`
  - `packages/api/src/composition/create-api-server.ts`
  - `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
  - `apps/specd-studio-desktop/package.json`
  - `apps/specd-studio-desktop/tsup.main.config.ts`
  - `packages/api/package.json`
  - `packages/cli/package.json`
- Test execution across affected packages:
  - `pnpm --filter @specd/client test -- project-status.spec.ts`
  - `pnpm --filter @specd/api test -- project.spec.ts presenter-graph-health.spec.ts`
  - `pnpm --filter @specd/studio-desktop test -- desktop-host-lifecycle.spec.ts`
  - `pnpm --filter @specd/core test -- composition-resolver.spec.ts repository-factories.spec.ts retained-branch-factories.spec.ts kernel.spec.ts get-project-context.spec.ts get-spec-context.spec.ts validate-specs.spec.ts get-change-artifact.spec.ts save-change-artifact.spec.ts validate-change-batch.spec.ts read-log.spec.ts config-loader.spec.ts`
  - `pnpm --filter @specd/cli test -- entrypoint.spec.ts build-project-graph-config.spec.ts graph-index-integration.spec.ts`

## Findings

No compliance findings were identified in the audited scope.

## Requirement Review

### Changed spec deltas with semantic changes

#### `api:presenter-project`

- The HTTP presenter delegates final project-status DTO construction to `mapProjectStatusDto` from `@specd/client`.
- The graph slice is passed structurally and warning derivation comes from the shared client-side mapper, keeping HTTP and IPC parity.
- Evidence:
  - `packages/api/src/delivery/http/presenters/presenter-project.ts`
  - `packages/api/test/presenter-graph-health.spec.ts`
  - `packages/api/test/project.spec.ts`

#### `client:dto-project-status`

- `ProjectStatusDto` includes the required graph diagnostics fields and `warnings`.
- `mapProjectStatusDto` accepts only structural serializable input and has no `@specd/core` or `@specd/sdk` dependency.
- Optional field omission semantics and warning derivation are covered by tests.
- Evidence:
  - `packages/client/src/dto/project-status.ts`
  - `packages/client/test/project-status.spec.ts`

#### `studio-desktop:ipc-handler-registry`

- Desktop project-status IPC uses the same `mapProjectStatusDto` as HTTP.
- Desktop graph work stays in the Electron-local runtime via `@specd/code-graph-electron`.
- IPC handlers use the process-scoped SDK host context rather than constructing a kernel per request.
- Evidence:
  - `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
  - `apps/specd-studio-desktop/test/desktop-host-lifecycle.spec.ts`
  - `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts`
  - `apps/specd-studio-desktop/test/desktop-local-data-adapter.spec.ts`

#### `studio-desktop:main-kernel-lifecycle`

- Desktop local boot path uses `createDefaultConfigLoader` plus `createSdkContext`.
- Session generation and provider tracking prevent cross-project leakage and reject superseded results.
- Desktop packaging exposes the Electron graph rebuild wiring, bundled CJS main entry, and required externals.
- Evidence:
  - `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
  - `apps/specd-studio-desktop/package.json`
  - `apps/specd-studio-desktop/tsup.main.config.ts`
  - `apps/specd-studio-desktop/test/desktop-host-lifecycle.spec.ts`

### No-op specs with implementation changes in scope

- The remaining change-scoped specs kept merged spec/verify content unchanged and were audited against the touched implementation through targeted `core`, `cli`, and `api` suites.
- The exercised suites cover the affected areas for composition bootstrap, retained branch factories, config loading, status/context use cases, change-artifact use cases, validation batching, API project routes, and CLI graph/bootstrap flow.
- No contradiction was found between the current implementation and the unchanged merged requirements.

## Test Coverage Assessment

Coverage for the changed scope is strong:

- `@specd/client`: `3` files, `11` tests passed.
- `@specd/studio-desktop`: `4` files, `6` tests passed.
- `@specd/api`: `10` files, `70` tests passed.
- `@specd/core`: `163` files, `2169` tests passed.
- `@specd/cli`: `72` files, `801` tests passed.

Notable requirement-to-test alignment:

- Canonical project-status mapping and warning derivation are directly asserted in both client and API tests.
- Desktop local/remote status parity and host lifecycle invariants are directly asserted in dedicated desktop tests.
- Config-loader behavior relevant to the user's earlier `legacy` concern is covered by `packages/core/test/infrastructure/fs/config-loader.spec.ts`, including rejection of legacy `artifactRules`.

## Residual Risks

- The desktop `start` script currently clears `ELECTRON_RUN_AS_NODE` via `env ELECTRON_RUN_AS_NODE= electron .`. The audited code and scripts align with the stated requirement, but this path remains environment-sensitive and is best protected by keeping the existing lifecycle/script tests.
- The audit was scoped to the change and its direct/global dependencies, not to every spec in the repository.

## Conclusion

The implementation audited for `align-user-interface-with-main-conventions` is compliant with the merged change specs reviewed here, and the test evidence is adequate for the affected behavior. No spec drift or implementation divergence was identified in the audited scope.
