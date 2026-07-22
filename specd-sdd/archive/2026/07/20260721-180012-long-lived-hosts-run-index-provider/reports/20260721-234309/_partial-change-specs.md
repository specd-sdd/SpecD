# Partial audit — change specs (long-lived-hosts-run-index-provider)

Scope: `api:handler-graph`, `api:composition-create-api-context`, `api:composition-graph-provider`, `studio-desktop:ipc-handler-registry`, `studio-desktop:main-kernel-lifecycle`  
Mode: change  
Read-only: yes

## Requirements Summary

| Spec                                 | Change-focused requirements                                                                                  | Status |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| api:handler-graph                    | Index via `runIndexProjectGraph({ provider })`; no release/refresh; long-lived `withGraphProvider` for reads | Met    |
| api:composition-create-api-context   | Expose kernel/`createGraphProvider`/`getGraphProvider`/`withGraphProvider`; no release-before-index          | Met    |
| api:composition-graph-provider       | Stale reopen via healthy accessor; index on injected provider without mandatory post-index refresh           | Met    |
| studio-desktop:ipc-handler-registry  | sqlite-electron long-lived host; index via `runIndexProjectGraph`; no `createIndexProjectGraph`              | Met    |
| studio-desktop:main-kernel-lifecycle | Host opens one provider; index reuses provider; no host reload after force                                   | Met    |

## Implementation Status

- `packages/api/src/delivery/http/handlers/handler-graph.ts` — `POST /graph/index` uses `ctx.withGraphProvider` + `runIndexProjectGraph(ctx, { provider, force? })`.
- `packages/api/src/composition/create-api-context.ts` — `releaseGraphProviderForIndex` / `refreshGraphProvider` removed; healthy accessor retained.
- `packages/api/src/composition/long-lived-graph.ts` — `withHealthyGraphProvider` still refreshes once on `GraphProviderStaleError`.
- `apps/specd-studio-desktop/src/main/ipc-handlers.ts` — `indexGraph` uses `runIndexProjectGraph(sdkCtx, { provider })`; host still `sqlite-electron` + `withHealthyGraphProvider`.

## Discrepancies

### Soft — verify wording vs SDK ownership (non-blocking)

- **Where:** merged `api:handler-graph` verify scenario “Graph index builds provider input from ListWorkspaces and project graph config”
- **Says:** handler loads workspaces / assembles graph config
- **Code:** handler delegates assembly to `runIndexProjectGraph` (SDK), which uses `ctx.kernel` — matches the sibling requirement “MUST NOT duplicate CLI assembly outside the SDK helper”
- **Interpretation:** scenario wording is slightly handler-centric; behaviour is correct. Prefer clarifying verify to “SDK orchestration via `runIndexProjectGraph` loads workspaces…” on a future design pass if desired.
- **Options:** (A) leave as-is (intent satisfied via SDK), (B) tighten verify wording in `/specd-design`

No code/spec contradiction that blocks archive.

## Test Coverage

| Area                           | Evidence                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| API index wiring               | `packages/api/test/handler-graph-index-provider.spec.ts` — source asserts provider passthrough, no release/refresh                                |
| API force index + status after | `packages/api/test/graph.spec.ts` — force index then `GET /graph/status`                                                                          |
| Desktop index wiring           | `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts` — `runIndexProjectGraph`, no `createIndexProjectGraph`                                |
| Desktop host/sqlite-electron   | `desktop-graph-runtime.spec.ts`, `desktop-host-lifecycle.spec.ts`                                                                                 |
| Stale reopen                   | Covered by retained `withHealthyGraphProvider` implementation; no new unit dedicated to stale path in this change (pre-existing helper unchanged) |

## Missing Tests

- No dedicated unit that injects `GraphProviderStaleError` on API/desktop accessors in this change (regression relies on unchanged helper + package suite). Optional follow-up, not a compliance blocker for the injected-provider requirement.

## Spec Dependency Chain

- Change specs depend on `sdk:run-index-project-graph` (dependency only; SDK not in `specIds`) — consistent: hosts pass `provider`, do not reimplement assembly.
- Aligns with `code-graph:composition` long-lived host model and `code-graph-sqlite-electron` for desktop.
- No conflict found with `default:_global/architecture` / conventions (delivery adapters, ESM, SDK imports).

## Summary counts

- Requirements checked (change-focused): 12
- Met: 12
- Blocking discrepancies: 0
- Soft findings: 1 (verify wording vs SDK assembly ownership)
- Missing tests (optional): 1 (stale-path unit)
