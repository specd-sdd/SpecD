# Tasks: studio-graph-health-warnings

## 1. Shared warning derivation + client types

- [x] 1.1 Add `GraphHealthWarningDto` and `deriveGraphHealthWarnings` in `packages/client/src/graph-health-warnings.ts`
      Approach: pure function; CLI-equivalent message strings; export from client index if barrel pattern requires
      (Req: graph status exposes health diagnostics)

- [x] 1.2 Extend `packages/client/src/dto/graph-status.ts` with `currentRef`, `fingerprintMismatch`, `warnings`
      Approach: mirror api dto fields; readonly types
      (Req: client graph status includes warnings)

- [x] 1.3 Extend `packages/client/src/dto/project-status.ts` `ProjectGraphSummaryDto` with counts + diagnostic fields
      Approach: mirror api project graph slice (`fileCount`, `documentCount`, `specCount`, `lastIndexedRef`, `warnings`, etc.)
      (Req: client project status graph includes warnings)

## 2. API DTOs, presenters, OpenAPI

- [x] 2.1 Extend `packages/api/src/delivery/http/dto/graph-status.ts` and `dto/project-status.ts`
      Approach: align with client; `warnings` required array type in TypeScript; full graph counts on project slice
      (Req: graph status exposes health diagnostics; DTO includes mandatory Studio fields)

- [x] 2.2 Refactor `toGraphStatusDto` in `packages/api/src/delivery/http/presenters/presenter-graph.ts`
      Approach: accept `GetGraphHealthResult`; map stats + diagnostics; call `deriveGraphHealthWarnings`
      (Req: graph status presenter derives warnings)

- [x] 2.3 Update `toProjectStatusDtoFromSnapshot` in `packages/api/src/delivery/http/presenters/presenter-project.ts`
      Approach: map full graph slice (counts, `currentRef`, `lastIndexedRef`, `warnings`) from `graphHealth`; reuse derivation helper
      (Req: project status presenter maps graph health diagnostics)

- [x] 2.4 Update `packages/api/src/delivery/http/handlers/handler-graph.ts` graph status route
      Approach: use `createGetGraphHealth().execute` result directly in presenter
      (Req: GET graph status exposes freshness and stale flag)

- [x] 2.5 Update `packages/api/src/delivery/http/openapi-schemas.ts` for graph + project status
      Approach: add `warnings` array schema, `fingerprintMismatch`, `currentRef`, graph counts on project slice
      (Req: response JSON uses stable camelCase field names)

## 3. Desktop IPC parity

- [x] 3.1 Update graph/project status mapping in `apps/specd-studio-desktop/src/main/ipc-handlers.ts`
      Approach: include new fields on IPC JSON; use `deriveGraphHealthWarnings` from `@specd/client`
      (Req: routes graph/project — IPC wire parity)

## 4. Project poll session store

- [x] 4.1 Add `packages/ui/src/hooks/project-poll-session.ts`
      Approach: `publishProjectPollSession` + `useProjectPollSession` via `useSyncExternalStore` (mirror `use-studio-panel.ts`)
      (Req: project poll publishes a session snapshot store)

- [x] 4.2 Wire `packages/ui/src/hooks/use-project-poll.ts` as sole writer
      Approach: publish after each project/status fetch; export session hook from same module or re-export
      (Req: project poll publishes a session snapshot store)

- [x] 4.3 Remove chrome `useGraphStatus` from `packages/ui/src/shell/ShellLayout.tsx`
      Approach: `graphStale` from `useProjectPollSession().projectStatus?.graph?.stale`; keep `getGraphStatus` out of shell chrome path
      (Req: stale graph index shows warning affordances)

## 5. Studio UI chrome + graph panel

- [x] 5.1 Update `packages/ui/src/shell/StudioTopBar.tsx` notifications
      Approach: read `projectStatus` from `useProjectPollSession()`; badge + cards from `graph.warnings` / boolean fallbacks
      (Req: top bar notifications graph health warnings)

- [x] 5.2 Update `packages/ui/src/shell/GraphMainView.tsx` Index Status card
      Approach: read `projectStatus.graph` from session store; remove `getGraphStatus` fetch for index card; keep `getHotspots` for hotspots section
      (Req: view surfaces graph health diagnostics in index status)

- [x] 5.3 Wire sidebar graph rail stale indicator from session store
      Approach: pass `graphStale` from session in `ShellLayout` / sidebar graph entry props
      (Req: graph activity rail icon reflects stale index state)

## 6. Tests

- [x] 6.1 Add `packages/client/test/graph-health-warnings.spec.ts` for derivation cases
      Approach: stale true, fingerprint true, both false → array contents
      (Req: graph status exposes health diagnostics scenarios)

- [x] 6.2 Add/extend API presenter tests for `toGraphStatusDto` and project graph slice warnings
      Approach: fixture `GetGraphHealthResult`; assert JSON warnings on both DTOs
      (Req: presenter derives warnings)

- [x] 6.3 Add `packages/ui/test/hooks/project-poll-session.spec.ts`
      Approach: publish snapshot; two subscribers see same `projectStatus.graph`
      (Req: project poll session store scenarios)

- [x] 6.4 Add `packages/ui/test/shell/graph-main-view-health.spec.tsx`
      Approach: mock session store with warnings; assert Index Status message lines
      (Req: view surfaces graph health diagnostics scenarios)

- [x] 6.5 Run `pnpm --filter @specd/api test` and `pnpm --filter @specd/ui test`
      Approach: full package suites green
      (Req: verification scenarios)
