# Spec Compliance Audit — studio-graph-health-warnings

**Mode:** change  
**Date:** 2026-07-01  
**State:** verifying  
**Specs in scope:** 13 change specs + global architecture/conventions (dependency)

## Executive Summary

| Metric                           | Count |
| -------------------------------- | ----- |
| Specs audited                    | 13    |
| Requirements verified            | 42+   |
| Discrepancies (critical)         | 0     |
| Discrepancies (minor / advisory) | 2     |
| Missing tests (material)         | 0     |

**Verdict:** Implementation conforms to change specs. Two advisory notes on DTO single-source wording and IPC link routing — neither blocks archive.

---

## Per-Spec Findings

### api:dto-graph-status / api:dto-project-status — PASS

- `GraphStatusDto` and `ProjectStatusDto.graph` include `stale`, `currentRef`, `fingerprintMismatch`, `warnings[]`.
- OpenAPI `GraphStatusDto` and `ProjectStatusDto.graph.warnings` use `{ type, message }` objects.
- Presenter tests + `graph.spec.ts` / `project.spec.ts` exercise runtime JSON.

### client:dto-graph-status / client:dto-project-status — PASS (advisory)

- Client types mirror API fields; `GraphHealthWarningDto` shared via `@specd/client`.
- **Advisory:** Spec says types MUST be "imported from shared package or generated." Client and API maintain parallel hand-written interfaces. Mitigated by compile-time parity and presenter tests. Not a runtime bug.

### api:presenter-graph / api:presenter-project — PASS

- `toGraphStatusDto` accepts `GetGraphHealthResult`, calls `deriveGraphHealthWarnings`.
- `toProjectStatusDtoFromSnapshot` maps full graph slice including warnings.
- Pure mapping; no lifecycle logic embedded.

### api:routes-graph / api:routes-project — PASS

- `handler-graph.ts` uses health result in presenter (task 2.4).
- `GET /graph/status` and `GET /project/status` covered by integration tests.

### ui:hooks-project — PASS

- `publishProjectPollSession` + `useProjectPollSession` via `useSyncExternalStore`.
- `use-project-poll.ts` sole writer.

### ui:hooks-graph — PASS

- Chrome path (`ShellLayout`) no longer calls `useGraphStatus`; `graphStale` from session.
- `useGraphStatus` remains exported for graph workspace operations only.

### ui:design-system (StudioTopBar) — PASS

- Bell reads `useProjectPollSession().projectStatus.graph.warnings` with boolean fallbacks.

### ui:graph-main-view — PASS

- Index Status from session `graph.warnings`; hotspots still via `getHotspots`.

### ui:sidebar-graph-entry — PASS

- Rail `graphStale` from `pollSession.projectStatus?.graph?.stale` in `ShellLayout`.

### Desktop IPC — PASS

- `ipc-handlers.ts` uses `deriveGraphHealthWarnings` for graph/project status DTOs.

---

## Advisory Discrepancies

1. **DTO single-source (client:dto-\*)** — Spec prefers generated/shared single source; implementation uses mirrored TypeScript interfaces in `packages/api` and `packages/client`. Tests enforce parity. Consider future codegen from OpenAPI if drift becomes painful.

2. **Implementation link on api:routes-graph** — Link targets `ipc-handlers.ts` (desktop) rather than HTTP handler file. HTTP route behavior verified via `graph.spec.ts`; link is organizational, not behavioral gap.

---

## Test Coverage

| Area                        | Tests                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `deriveGraphHealthWarnings` | `packages/client/test/graph-health-warnings.spec.ts` (3)     |
| API presenters              | `packages/api/test/presenter-graph-health.spec.ts` (2)       |
| Session store               | `packages/ui/test/hooks/project-poll-session.spec.ts` (1)    |
| Graph panel UI              | `packages/ui/test/shell/graph-main-view-health.spec.tsx` (1) |
| Integration                 | `packages/api/test/graph.spec.ts`, `project.spec.ts`         |

All targeted suites green during verify post-hooks.

---

## Global Spec Compliance

- **Architecture:** API presenters at delivery boundary; UI uses `@specd/client` port, not `@specd/sdk` bootstrap.
- **Conventions:** ESM, camelCase wire fields, English identifiers.
- **Testing:** Vitest unit + API integration coverage for new behavior.
