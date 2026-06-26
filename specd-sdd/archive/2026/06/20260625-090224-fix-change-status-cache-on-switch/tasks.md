# Tasks: fix-change-status-cache-on-switch

## 1. Per-key status cache in useChangesRead

- [x] 1.1 Introduce per-key status cache ref
      `packages/ui/src/hooks/use-changes-read.ts`: `useChangesRead` — add `StatusCacheEntry` type and `useRef<Map<string, StatusCacheEntry>>`
      Approach: key map entries with `changeReadCacheKey(listSection, \`change-status:${changeName}\`)`; store `{ lastModified, status }` per entry
      (Req: useChangesRead scopes status cache per change key)

- [x] 1.2 Scope ifModifiedSince to current cache key
      `packages/ui/src/hooks/use-changes-read.ts`: `loadStatus` callback — read `ifModifiedSince` from map entry for current key only
      Approach: remove hook-global `useState(lastModified)`; `loadStatus` looks up `cacheRef.current.get(statusCacheKey)?.lastModified`
      (Req: useChangesRead scopes status cache per change key)

- [x] 1.3 Restore cached status on key change
      `packages/ui/src/hooks/use-changes-read.ts`: replace `setStatusData(undefined)` on `changeName` effect — add `useEffect` on `statusCacheKey` that seeds `statusData` from map
      Approach: on key change, `setStatusData(cache.get(key)?.status)` so revisiting shows last known status immediately
      (Req: useChangesRead scopes status cache per change key, Revisiting a change restores cached workflow status)

- [x] 1.4 Handle unchanged polls without clearing status
      `packages/ui/src/hooks/use-changes-read.ts`: status resource effect — when `next.unchanged === true`, keep cached full status; when full payload, update map entry
      Approach: extract `applyStatusPollResult(entry, next)`; only update map + `setStatusData` on full payloads; unchanged returns prior `entry.status`
      (Req: useChangesRead scopes status cache per change key, Unchanged poll retains visible status)

## 2. Tests

- [x] 2.1 Add useChangesRead navigation tests
      `packages/ui/test/use-changes-read.spec.ts`: new file — `renderHook` with `SpecdDataPortProvider` + `MemorySpecdDataAdapter`
      Approach: seed `alpha` and `beta` with `beta.updatedAt` > `alpha.updatedAt`; load alpha → beta → alpha; assert `status.data` defined with nextAction/blockers after return; spy `getChangeStatus` calls to verify alpha never receives beta's `ifModifiedSince`
      (Req: Revisiting a change restores cached workflow status, Active change keeps workflow status after sidebar switch)

- [x] 2.2 Add unchanged poll retention test
      `packages/ui/test/use-changes-read.spec.ts`: same file — second poll returns `{ unchanged: true }`
      Approach: after initial full load, trigger refetch; assert `status.data` still contains full fields and `isLoading` is false
      (Req: Unchanged poll retains visible status for the same change)

- [x] 2.3 Add Playwright e2e for change switch workflow status
      `apps/specd-studio-web/tests/e2e/studio.ui.spec.ts` — "switching between changes keeps workflow status on overview"
      `packages/ui/src/change/ChangeOverview.tsx` — `data-testid="studio-change-workflow-status"`
      `packages/ui/src/sidebar/ChangesSidebar.tsx` — `studio-draft-change-*` row test ids for draft sidebar e2e
      (Req: Active change keeps workflow status after sidebar switch)

## 3. Verification

- [x] 3.1 Run UI package tests
      `packages/ui`: `pnpm --filter @specd/ui test`
      Approach: ensure new spec file passes with existing suite
      (Req: all verify scenarios)

- [x] 3.2 Run Playwright Studio smoke (A → B → A)
      `pnpm studio-web:test:e2e -- -g "switching between changes keeps workflow status"`
      Requires free ports 4450 (API) and plugin UI port; stop any running `ui serve` first
      (Req: Active change keeps workflow status after sidebar switch)
