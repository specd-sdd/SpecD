# Spec Compliance Partial — API long-lived graph host

**Change:** `merge-main-adapt-ui-branch`  
**Batch:** `api`  
**Specs audited:**

1. `api:composition-create-api-server`
2. `api:composition-graph-provider`
3. `api:composition-create-api-context`
4. `api:handler-graph`

**Scope note:** Read-only audit. Evidence from `specd changes spec-preview`, `specd graph search/impact`, `packages/api` source, and `pnpm --filter @specd/api exec vitest run test/graph.spec.ts` (**13/13 passed**, ~51s; not DB-locked in this run).

**Primary implementation files:**

- `packages/api/src/composition/create-api-server.ts`
- `packages/api/src/composition/create-api-context.ts`
- `packages/api/src/composition/long-lived-graph.ts`
- `packages/api/src/delivery/http/handlers/handler-graph.ts`
- `packages/api/package.json` (deps: `@specd/sdk`, `@specd/client` only — **no** `@specd/code-graph-sqlite-electron`)

---

## Cross-cutting: long-lived graph host model

| Focus check                                                                                                        | Status   | Evidence                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `createApiServer` opens one provider at bootstrap                                                                  | **PASS** | `openLongLivedGraphProvider(sdkHost.createGraphProvider)` into `state.graph.provider` |
| `ApiServer.close()` closes long-lived provider                                                                     | **PASS** | `await state.graph.provider.close()` before `app.close()`                             |
| Context exposes `getGraphProvider` / `withGraphProvider` / `releaseGraphProviderForIndex` / `refreshGraphProvider` | **PASS** | `ApiContext` in `create-api-context.ts`                                               |
| Handler reads use `withGraphProvider`                                                                              | **PASS** | status/search/impact/hotspots/specs/changes all wrap via `ctx.withGraphProvider`      |
| Index = release → `runIndexProjectGraph` → refresh in `finally`                                                    | **PASS** | `handler-graph.ts` POST `/graph/index`                                                |
| MUST NOT use `withOpenGraphProvider` on routine routes                                                             | **PASS** | No usages under `packages/api` (symbol only in `@specd/sdk`)                          |
| MUST NOT depend on `@specd/code-graph-sqlite-electron`                                                             | **PASS** | `packages/api/package.json` dependencies                                              |

### Nuance: `getGraphProvider` vs stale reopen

- **Code:** `getGraphProvider()` returns `Promise.resolve(state.graph.provider)` — **no** stale detection/reopen.
- **Code:** `withGraphProvider` → `withHealthyGraphProvider` retries once after `GraphProviderStaleError` via `refreshLongLivedGraphProvider`.
- **Spec (`api:composition-create-api-context`):** states `getGraphProvider` returns the long-lived provider “**(reopening on `GraphProviderStaleError` when needed)**”.
- **Assessment:** **Spec drift.** Implementation intentionally splits “peek holder” (`getGraphProvider`) from “healthy accessor” (`withGraphProvider`). Handlers correctly use the healthy path. Spec (and several verify scenarios naming only `getGraphProvider`) should be updated to describe this split, not the reverse.

---

## 1. `api:composition-create-api-server`

### Requirements Summary

| Requirement                                                                         | Verdict                             |
| ----------------------------------------------------------------------------------- | ----------------------------------- |
| Factory accepts `{ projectRoot, host, port, auth, authRegistry?, uiDistPath? }`     | **Implemented**                     |
| Auth from `specd.yaml` `api.auth` (+ CLI override); reject non-`disabled`           | **Implemented**                     |
| One `createSdkContext` per process; per-request via `createApiContext`              | **Implemented**                     |
| Nested `kernel: { logRing, logFormatter: createLogFormatter({ colorize: false }) }` | **Implemented**                     |
| Open one long-lived provider at bootstrap; close on `ApiServer.close()`             | **Implemented**                     |
| Routes under `/v1`                                                                  | **Implemented**                     |
| Health/project expose `auth: { type }` without secrets                              | **Implemented** (project presenter) |
| Import policy: `@specd/sdk`, not `@specd/core` / `@specd/code-graph` directly       | **Implemented**                     |

### Implementation Status

- Bootstrap opens provider once and retains it on `ApiServerState.graph`.
- `close()` closes the provider then Fastify.
- Kernel/log nesting matches the nested-options requirement.
- Signal handlers in `listen()` call `app.close()` only (not `ApiServer.close()`), so SIGINT/SIGTERM may skip explicit provider close before process exit. Low practical risk on process death; still a lifecycle gap vs the `ApiServer.close()` contract if signals are the only shutdown path.

### Discrepancies

1. **Low — signal shutdown vs `ApiServer.close()`**
   - **Spec:** `ApiServer.close()` MUST close the long-lived provider.
   - **Code:** `listen()` registers SIGINT/SIGTERM → `void app.close()` without closing `state.graph.provider`.
   - **Possible readings:** (a) implementation incomplete for signal shutdown; (b) process exit makes it moot and only programmatic `close()` is in contract. Prefer wiring signals to `close()` for clarity.

2. No material conflict with `code-graph:composition` long-lived host contract (create → open → reuse → close/replace).

### Test Coverage

- Indirect coverage via shared `api-test-server.ts` (`createApiServer` + teardown `server.close()`).
- `static-ui.spec.ts` covers optional `uiDistPath`.
- `project.spec.ts` / health-related suites cover auth echo (out of this file’s primary focus).
- **No dedicated unit test** asserting single open at bootstrap or provider close on `ApiServer.close()`.

### Missing Tests

- Explicit assertion that bootstrap leaves exactly one opened provider reused across graph requests.
- Explicit assertion that `ApiServer.close()` closes the held provider (spy/mock).
- Signal-path close behavior (optional).

### Spec Dependency Chain

`default:_global/architecture`, `default:_global/conventions`, `sdk:host-context`, `sdk:composition`, `api:auth-adapter-registry`, `api:middleware-auth`, `core:kernel`, `code-graph:composition` — no contradictions found with the implemented long-lived host pattern.

### Summary counts — `api:composition-create-api-server`

| Metric               | Count                  |
| -------------------- | ---------------------- |
| Requirements checked | 6 (+ constraints)      |
| Fully compliant      | 5                      |
| Partial / nuance     | 1 (signal close path)  |
| Spec drift           | 0                      |
| Implementation bugs  | 0–1 (signal path only) |
| Test gaps            | 2                      |

---

## 2. `api:composition-graph-provider`

### Requirements Summary

| Requirement                                                                                                                | Verdict                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Provider from `SdkHostContext.createGraphProvider` bound to served `SpecdConfig`                                           | **Implemented**                                                                       |
| Open once, reuse, reopen/replace on stale, close on shutdown                                                               | **Implemented** (`long-lived-graph.ts` + server)                                      |
| Indexing via `runIndexProjectGraph` (CLI-aligned assembly)                                                                 | **Implemented** (handler + SDK)                                                       |
| Stale/freshness observable via status                                                                                      | **Implemented** (`createGetGraphHealth` + `toGraphStatusDto`)                         |
| Opened provider via long-lived accessor; no direct `createCodeGraphProvider`; no `withOpenGraphProvider` on routine routes | **Implemented**                                                                       |
| Refresh long-lived provider after index; stale → close/reopen (+ optional one retry)                                       | **Implemented** (`refresh` in index `finally`; `withHealthyGraphProvider` retry once) |

### Implementation Status

- Factory path: `createSdkContext` → `createGraphProvider` → `openLongLivedGraphProvider`.
- Stale recovery centralized in `withHealthyGraphProvider`.
- Index refresh: host releases before short-lived index orchestration, then `refreshGraphProvider()` in `finally`.
- Dead/unused re-export file `packages/api/src/composition/graph-provider.ts` exports `createCodeGraphProvider` from `@specd/sdk` but has **zero** importers — not a handler violation, but noise relative to “centralized provider creation” narrative.

### Discrepancies

1. **Low — unused `graph-provider.ts` re-export**  
   Does not violate “MUST NOT import `createCodeGraphProvider` from `@specd/code-graph`” (re-export is from SDK). Prefer delete or document; handlers correctly avoid it.

2. **Wording vs handlers:** verify scenarios say handlers call `getGraphProvider()`; production handlers call `withGraphProvider()` (healthier equivalent). Treat as **spec/verify drift**, not an implementation defect.

### Test Coverage

- Integration: `GET /v1/graph/status`, search/impact/hotspots, `POST /v1/graph/index` in `graph.spec.ts`.
- Presenter health mapping: `presenter-graph-health.spec.ts`.
- **No unit tests** for `withHealthyGraphProvider` stale retry or `refreshLongLivedGraphProvider` after index.

### Missing Tests

- Inject `GraphProviderStaleError` once → assert reopen + single retry success.
- After `POST /graph/index`, assert holder provider identity changed (or `open` called again) before next read.
- Status `stale: true/false` fixtures against known mtimes (verify scenarios partially uncovered).

### Spec Dependency Chain

`sdk:run-index-project-graph`, `sdk:host-context`, `code-graph:composition` — aligned with long-lived host + project-level index orchestration.

### Summary counts — `api:composition-graph-provider`

| Metric                    | Count |
| ------------------------- | ----- |
| Requirements checked      | 5     |
| Fully compliant           | 5     |
| Spec/verify wording drift | 1     |
| Implementation bugs       | 0     |
| Test gaps                 | 3     |

---

## 3. `api:composition-create-api-context`

### Requirements Summary

| Requirement                                                                                                    | Verdict                                            |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Context exposes `kernel`, `actor`, `createGraphProvider`, `getGraphProvider`, `config`, `authType`, `apiActor` | **Implemented** (plus extras)                      |
| `ApiContext` / `ApiServerState` extend `SdkHostContext`                                                        | **Implemented**                                    |
| `getGraphProvider` returns long-lived opened provider **and** reopens on stale when needed                     | **Partial** — returns holder; **does not** reopen  |
| `createGraphProvider` delegates to process SDK factory                                                         | **Implemented**                                    |
| Handlers obtain opened provider via `getGraphProvider()` (or equivalent) not open/close per request            | **Implemented** via equivalent `withGraphProvider` |

### Implementation Status

```ts
getGraphProvider() {
  return Promise.resolve(state.graph.provider)
}
withGraphProvider(run) {
  return withHealthyGraphProvider(state.createGraphProvider, state.graph, run)
}
```

Extras vs MUST list (additive, compliant): `withGraphProvider`, `releaseGraphProviderForIndex`, `refreshGraphProvider`.

`getGraphProvider` is currently **unused** by any handler (only defined). All graph routes use `withGraphProvider`.

### Discrepancies

1. **Medium — `getGraphProvider` reopen claim (spec drift preferred)**
   - **Spec text:** reopen on `GraphProviderStaleError` when needed.
   - **Code:** no reopen.
   - **Interpretation A (recommended):** Spec wrong — reopen belongs on `withGraphProvider` / `withHealthyGraphProvider`. Update spec/verify.
   - **Interpretation B:** Code wrong — `getGraphProvider` should refresh-on-stale. That would blur peek vs healthy accessor and is **not** what handlers use today.

2. **Low — verify scenarios name only `getGraphProvider`**  
   Should mention `withGraphProvider` as the routine healthy accessor used by handlers.

### Test Coverage

- No dedicated `create-api-context` / long-lived unit tests.
- Behavior covered only indirectly through HTTP graph suite.

### Missing Tests

- Unit: `getGraphProvider` returns same instance as holder without refresh.
- Unit: `withGraphProvider` refreshes once on `GraphProviderStaleError`.
- Unit: `releaseGraphProviderForIndex` + `refreshGraphProvider` sequencing.

### Spec Dependency Chain

`sdk:host-context`, `code-graph:composition` — host long-lived lifecycle matches code; only the `getGraphProvider` reopen sentence conflicts.

### Summary counts — `api:composition-create-api-context`

| Metric                 | Count                                |
| ---------------------- | ------------------------------------ |
| Requirements checked   | 2 (+ constraints)                    |
| Fully compliant        | 1                                    |
| Partial / discrepancy  | 1 (`getGraphProvider` stale wording) |
| Spec drift (preferred) | 1                                    |
| Implementation bugs    | 0 (if split intentional)             |
| Test gaps              | 3                                    |

---

## 4. `api:handler-graph`

### Requirements Summary

| Requirement                                                                                                                                                           | Verdict                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Implements routes under `/v1` per `api:routes-graph`                                                                                                                  | **Implemented** (status, index, search, impact, hotspots, specs/\*, changes/:name)     |
| Delegate: long-lived provider for reads; `runIndexProjectGraph` for index; no direct `createCodeGraphProvider`; no per-request open/close; no `withOpenGraphProvider` | **Implemented** (via `withGraphProvider`, not bare `getGraphProvider`)                 |
| Presenters + DTO wire shapes                                                                                                                                          | **Implemented** (`presenter-graph.ts`)                                                 |
| Failures → problem+json                                                                                                                                               | **Implemented** (`apiHandler` + server error handler); covered by validation/404 tests |
| Index uses CLI-aligned SDK assembly                                                                                                                                   | **Implemented**                                                                        |
| SDK delivery imports only                                                                                                                                             | **Implemented** (`@specd/sdk` only)                                                    |

### Implementation Status

- Reads: `ctx.withGraphProvider(...)`.
- Index:
  ```ts
  await ctx.releaseGraphProviderForIndex()
  try {
    const result = await runIndexProjectGraph(ctx, ...)
    return toGraphIndexResultDto(result)
  } finally {
    await ctx.refreshGraphProvider()
  }
  ```
- Change-scoped view: loads change via `ctx.kernel.changes.repo.get`, then coverage via provider — no local domain reimplementation of lifecycle rules.
- Spec impact: uses `provider.analyzeSpecImpact` (CLI-aligned capability).

### Discrepancies

1. **Low/Medium — Spec says invoke `getGraphProvider()`; code uses `withGraphProvider()`**
   - **Focus model / `code-graph:composition`:** healthy long-lived accessor with stale replace is correct.
   - **Spec/verify wording:** lagging; should say `withGraphProvider` (or “`getGraphProvider` / healthy equivalent”).
   - **Not** an implementation regression relative to the long-lived host intent.

2. No use of `@specd/code-graph-sqlite-electron` — compliant.

### Test Coverage (`packages/api/test/graph.spec.ts`)

| #   | Scenario                                       | Result (this run) |
| --- | ---------------------------------------------- | ----------------- |
| 1   | GET `/graph/status`                            | pass              |
| 2   | GET `/graph/search` missing `q` → 400          | pass              |
| 3   | GET `/graph/search?q=…`                        | pass              |
| 4   | GET `/graph/impact` missing selector → 400     | pass              |
| 5   | GET `/graph/impact` invalid direction → 400    | pass              |
| 6   | GET `/graph/impact?symbol=`                    | pass              |
| 7   | GET `/graph/impact?spec=`                      | pass              |
| 8   | GET `/graph/hotspots`                          | pass              |
| 9   | POST `/graph/index` `{ force: true }`          | pass (~43s)       |
| 10  | POST `/graph/index` unknown `workspaces` → 400 | pass              |
| 11  | GET `/graph/specs/:ws/*` coverage              | pass              |
| 12  | GET `/graph/specs/...` unknown → 404           | pass              |
| 13  | GET `/graph/changes/:name`                     | pass              |

**Totals: 13 passed / 13.** Note: index test is heavy and can fail under DB lock when another process holds the graph store.

### Missing Tests

- Undeclared HTTP verb → 405 (verify scenario).
- Explicit assertion handlers never call `withOpenGraphProvider` / never open per request (structural/unit).
- Stale-provider recovery path through a graph route.
- Unknown change name → 404 before presenter (partially pattern-matched by specs 404; change-specific may be thin if no fixture).

### Spec Dependency Chain

`sdk:composition`, `sdk:run-index-project-graph`, `api:routes-graph`, `api:composition-graph-provider`, `code-graph:composition` — handler behavior matches composition specs’ long-lived intent; only accessor naming lags.

### Summary counts — `api:handler-graph`

| Metric                    | Count                                         |
| ------------------------- | --------------------------------------------- |
| Requirements checked      | 6                                             |
| Fully compliant (intent)  | 6                                             |
| Spec wording drift        | 1 (`getGraphProvider` vs `withGraphProvider`) |
| Implementation bugs       | 0                                             |
| Integration tests passing | 13/13                                         |
| Test gaps                 | 3                                             |

---

## Batch roll-up

### Overall verdict

**Long-lived graph host model is correctly implemented in `@specd/api`.** Bootstrap open, request-scoped healthy reads via `withGraphProvider`, index release/refresh, shutdown close, SDK-only imports, and no sqlite-electron / `withOpenGraphProvider` on routine routes all check out. Primary issues are **spec/verify wording** around `getGraphProvider` (overclaims stale reopen; handlers correctly use `withGraphProvider`) and **missing unit tests** for stale refresh / close lifecycle.

### Aggregate counts

| Metric                                         | Count                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Specs audited                                  | 4                                                                                                |
| Hard implementation defects (long-lived model) | **0**                                                                                            |
| Spec drift / wording mismatches                | **2–3** (getGraphProvider reopen; get vs with in handler/verify text; optional unused re-export) |
| Minor lifecycle nits                           | **1** (SIGINT → `app.close` only)                                                                |
| Dedicated lifecycle unit-test gaps             | **several** (stale retry, refresh-after-index, close)                                            |
| `graph.spec.ts`                                | **13/13 pass** (this run)                                                                        |

### Recommended follow-ups (for humans / change authors — not applied here)

1. Amend `api:composition-create-api-context` so `getGraphProvider` is documented as a non-refreshing holder peek; stale reopen lives on `withGraphProvider`.
2. Amend `api:handler-graph` / `api:composition-graph-provider` verify scenarios to name `withGraphProvider` as the routine read accessor.
3. Add unit tests for `long-lived-graph.ts` (stale once-retry, refresh after close).
4. Optionally route signal handlers through `ApiServer.close()` and remove unused `graph-provider.ts` re-export.
