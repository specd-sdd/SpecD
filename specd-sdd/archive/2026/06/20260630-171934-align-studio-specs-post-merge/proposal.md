# Proposal: align-studio-specs-post-merge

## Motivation

After merging `feat/user-interface` into `main`, Studio API and desktop hosts already bootstrap through `@specd/sdk`, but their specs still describe pre-merge `createKernel` wiring. Desktop also failed to start under pnpm/Cursor (`ELECTRON_RUN_AS_NODE`, graph version resolution). Specs are the source of truth — they must match shipped behaviour before further Studio work.

## Current behaviour

- `api:composition-create-api-server` requires `createKernel` once per process.
- Studio desktop specs say the main process "runs `createKernel`".
- API handler specs describe delegation to `@specd/core` without naming `@specd/sdk` as the delivery import surface.
- `sdk:composition` lists CLI/MCP as integrators but not `@specd/api` or desktop IPC hosts explicitly.
- Shared `## Constraints` boilerplate across `api:*` and `client:*` omits the SDK delivery import rule.
- `studio-web:vite-host` forbids `createKernel` but not `createSdkContext`.
- `pnpm start` in `studio-desktop` breaks when `ELECTRON_RUN_AS_NODE=1` (Cursor/IDE shells).
- `@specd/code-graph-electron` cannot resolve `CODE_GRAPH_VERSION` from bundled `dist/` without `@specd/code-graph` in `node_modules`.

## Proposed solution

Update **all** Studio-related workspace specs (112 total) with deltas that:

1. Document `createSdkContext` / `SdkHostContext` as the Studio host bootstrap path.
2. State that `@specd/api` and desktop main process MUST depend on `@specd/sdk` for kernel and graph factory access.
3. Preserve the rule that business logic stays in core use cases — only the import/bootstrap layer changes in prose.
4. Align shared Constraints sections across `api:*` (61 specs), `client:*` (37 specs), remaining `studio-desktop:*` (9 specs), and `studio-web:*` (3 specs).
5. Document and implement desktop merge fixes: Electron launch (`ELECTRON_RUN_AS_NODE`), bundled CJS main entry, code-graph version resolution for Electron bundle.

## Specs affected

### New specs

None.

### Modified specs

**SDK (2)**

- `sdk:host-context`: clarify Studio hosts use `SdkHostContext` / extended server state; config snapshot on API bootstrap.
- `sdk:composition`: name `@specd/api` and `apps/specd-studio-desktop` as SDK integrators.

**API (61)**

- Composition/bootstrap: `composition-create-api-server`, `composition-create-api-context`, `composition-graph-provider`, `http-server-bootstrap`.
- Handlers (9): Purpose + `SDK delivery imports` requirement + updated Constraints.
- Presenters (6): presenter rule + Constraints where present.
- Routes, middleware, DTOs, adapters, OpenAPI (42): updated Constraints boilerplate where present.

**Studio desktop (9 + runtime)**

- `main-kernel-lifecycle`, `ipc-handler-registry`: `createSdkContext` bootstrap; SDK deps.
- `main-kernel-lifecycle`: Electron launch + bundled `index.cjs` main entry.
- Remaining 6 specs: replace `createKernel` purpose boilerplate where applicable.
- `desktop-local-data-adapter`: fix purpose boilerplate (IPC port, not kernel ownership).

**Code graph electron (1)**

- `code-graph-electron:composition`: `@specd/code-graph` workspace dep; version lookup from `node_modules`; `require` export for CJS main.

**Client (37)**

- All specs with `## Constraints`: add explicit prohibition on `@specd/core` / `@specd/sdk` kernel bootstrap in ui/client delivery.

**Studio web (3)**

- `vite-host`: forbid `createSdkContext` alongside `createKernel` in host bootstrap requirement.
- `remote-bootstrap`, `ui-plugin-dev`: no-op deltas (scope completeness).

### Dependency additions (wave-1 bootstrap specs only)

- `api:composition-create-api-server` → `sdk:host-context`, `sdk:composition`
- `api:composition-create-api-context` → `sdk:host-context`
- `api:composition-graph-provider` → `sdk:run-index-project-graph`
- `api:http-server-bootstrap` → `api:composition-create-api-server`
- `api:handler-changes-read`, `api:handler-graph` → `sdk:composition`
- `studio-desktop:main-kernel-lifecycle`, `studio-desktop:ipc-handler-registry` → `sdk:host-context`

## Impact

- Spec and verify artifacts for **113 specs** plus targeted runtime fixes in `studio-desktop`, `code-graph-electron`, and `code-graph` version helper.
- Desktop startup and local graph IPC work after merge under pnpm.
- `specd.yaml` workspace registration for Studio packages (already done outside this change).

## Technical context

- `ApiServerState` and `ApiContext` extend `SdkHostContext` with auth and config fields.
- Desktop graph operations still use `@specd/code-graph-electron` in main process — not the Node `createCodeGraphProvider` from SDK context for IPC graph paths.
- Constraint template: delivery MUST import `@specd/sdk`; ui/client MUST NOT bootstrap kernel.
- `apps/specd-studio-desktop`: `start` = `env ELECTRON_RUN_AS_NODE= electron .`; `main` = `dist/main/index.cjs`; `tsup` bundles main as CJS with `@specd/sdk` + `@specd/client` inlined.
- `readInstalledCodeGraphVersion` walks `node_modules/@specd/code-graph/package.json` for bundled Electron dist.

## Implementation traceability

Merge code landed in `0cc90abb` and follow-up desktop fixes **outside** this change workflow. Confirmed links added via `dev/scripts/add-align-studio-implementation-links.mjs` (reads `spec-lock.json` + manual overrides):

- **134 links** across **~100 tracked files**, covering **112/113** scoped specs
- **Unlinked:** `studio-desktop:bottom-panel-terminal` (no xterm/pty implementation on disk yet)
- **SDK/API/Desktop/Client/Studio-web/code-graph-electron** — full traceability from spec-lock + runtime overrides

Script re-runnable: `node dev/scripts/add-align-studio-implementation-links.mjs`
