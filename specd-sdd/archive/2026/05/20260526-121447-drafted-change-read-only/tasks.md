# Tasks: drafted-change-read-only

## 1. Domain — read-only views and error

- [x] 1.1 Add `ReadOnlyChangeView`, `DraftedChangeView`, `DiscardedChangeView`, and `ReadOnlyChangeFacade`
      `packages/core/src/domain/read-only-change-view.ts`: `ReadOnlyChangeFacade`, `toDraftedChangeView`, `toDiscardedChangeView` — single private class implements both extended interfaces; no public `change`/`unwrap`/`toChange`
      Approach: delegate getters to wrapped `Change`; `toDraftedChangeView` throws if `!change.isDrafted`; `toDiscardedChangeView` throws if latest event is not `discarded` and maps `discardReason`, `discardedAt`, `discardedBy`, `supersededBy` from that event
      (Req: Shared read-only surface, Shared implementation, No escape hatch — `core:read-only-change-view`)

- [x] 1.2 Export domain types from package index
      `packages/core/src/domain/index.ts` (or existing barrel): re-export view types and factories
      Approach: export interfaces and `toDraftedChangeView` / `toDiscardedChangeView` only; keep `ReadOnlyChangeFacade` class unexported
      (Req: Construction — `core:drafted-change-view`, `core:discarded-change-view`)

- [x] 1.3 Add `DraftedChangeReadOnlyError`
      `packages/core/src/domain/errors/drafted-change-read-only-error.ts`: `DraftedChangeReadOnlyError` — `code: 'DRAFTED_CHANGE_READ_ONLY'`, fields `changeName`, `operation`
      Approach: extend `DomainError` like other domain errors; export from `packages/core/src/domain/errors/index.ts`
      (Req: Error contract — `core:drafted-change-read-only-error`)

- [x] 1.4 Unit-test read-only facade and factories
      `packages/core/test/domain/read-only-change-view.spec.ts`: new — drafted/discarded factories, no unwrap accessor, reject wrong lifecycle
      Approach: build in-memory `Change` fixtures; assert `toDiscardedChangeView` exposes `discardReason`; assert active change rejected by `toDraftedChangeView`
      (Req: Shared implementation, Discarded-specific surface — verify scenarios)

## 2. Change repository port

- [x] 2.1 Extend `ChangeRepository` abstract API
      `packages/core/src/application/ports/change-repository.ts`: add `getDraft`, `getDiscarded`, `mutateDraft`, `draftChangePath`; narrow `get`/`mutate` docs to active-only
      Approach: `getDraft` → `Promise<DraftedChangeView | null>`; `getDiscarded` → `Promise<DiscardedChangeView | null>`; `listDrafts`/`listDiscarded` return view arrays; `mutateDraft` mirrors `mutate` signature with `Change` callback
      (Req: getDraft, getDiscarded, mutateDraft, listDrafts, listDiscarded — `core:change-repository-port`)

## 3. FsChangeRepository — storage split

- [x] 3.1 Split directory resolution
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_resolveActiveDir`, `_resolveDraftDir`, `_resolveDiscardedDir` — replace combined `_resolveDir` usage in `get`/`mutate`/`getDraft`/`getDiscarded`
      Approach: `get`/`mutate` call active only; `getDraft`/`mutateDraft` draft only; `getDiscarded` discarded only; keep `_resolveDir(name, { includeDiscarded })` for `save`/`delete`/`artifact` internal moves
      (Req: get returns active only, getDraft, getDiscarded, mutate, mutateDraft)

- [x] 3.2 Implement `getDraft`, `getDiscarded`, and view-based list methods
      `packages/core/src/infrastructure/fs/change-repository.ts`: `getDraft`, `getDiscarded`, `listDrafts`, `listDiscarded`
      Approach: load manifest from correct dir; map with `toDraftedChangeView` / `toDiscardedChangeView`; no auto-invalidate on draft/discarded load
      (Req: getDraft, getDiscarded, listDrafts, listDiscarded)

- [x] 3.3 Implement `mutateDraft` and `_draftMutationInProgress` guard
      `packages/core/src/infrastructure/fs/change-repository.ts`: `mutateDraft`, `save`, `saveArtifact`
      Approach: same lock pattern as `mutate`; set per-name flag during `mutateDraft` callback so `save`/`saveArtifact` succeed; otherwise throw `DraftedChangeReadOnlyError` when `change.isDrafted`
      (Req: mutateDraft, save persists manifest only, saveArtifact — `core:change-repository-port`)

- [x] 3.4 Add `draftChangePath` and restrict `changePath` to active
      `packages/core/src/infrastructure/fs/change-repository.ts`: `draftChangePath(view)`, `changePath(change)`
      Approach: `draftChangePath` under `_draftsPath`; `changePath` only for non-drafted active changes
      (Req: draftChangePath — `core:change-repository-port`)

- [x] 3.5 Repository integration tests
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: active/draft/discarded isolation, `mutate` vs `mutateDraft`, save guard, `getDiscarded`/`getDraft` null when wrong storage
      Approach: extend existing discard/draft scenarios; assert `get('discarded-only')` returns null; `getDiscarded` returns view with `discardReason`
      (Req: verify scenarios — `core:change-repository-port`)

## 4. Test doubles

- [x] 4.1 Update in-memory `ChangeRepository` test helper
      `packages/core/test/application/use-cases/helpers.ts`: mock `getDraft`, `getDiscarded`, `mutateDraft`, view-returning `listDrafts`/`listDiscarded`
      Approach: mirror Fs semantics so use-case tests can stub without real fs
      (Req: Dependencies — use case tests)

## 5. Application use cases

- [x] 5.1 Add `GetDraft` use case and composition wiring
      `packages/core/src/application/use-cases/get-draft.ts`, `packages/core/src/composition/use-cases/get-draft.ts`, `packages/core/src/composition/kernel.ts`: `kernel.changes.getDraft`
      Approach: `execute({ name })` → `{ view }` or `ChangeNotFoundError`; no `mutate`/`mutateDraft`
      (Req: Resolution, Read-only — `core:get-draft`)

- [x] 5.2 Add `GetDiscarded` use case and composition wiring
      `packages/core/src/application/use-cases/get-discarded.ts`, composition module, `kernel.changes.getDiscarded`
      Approach: same pattern as `GetDraft` with `getDiscarded` and `DiscardedChangeView`
      (Req: Resolution, Read-only — `core:get-discarded`)

- [x] 5.3 Update `RestoreChange` to use `mutateDraft`
      `packages/core/src/application/use-cases/restore-change.ts`: pre-check `getDraft`; `mutateDraft` for `restore` event
      Approach: throw `ChangeNotFoundError` when `getDraft` null; never `mutate` for drafted name
      (Req: Restore uses mutateDraft — `core:restore-change`)

- [x] 5.4 Update `DiscardChange` for active vs drafted branches
      `packages/core/src/application/use-cases/discard-change.ts`: `get` then `mutate`, else `getDraft` then `mutateDraft`
      Approach: single `execute` path branches on storage; both end in `discarded/` after save
      (Req: Discard from drafts — `core:discard-change`)

- [x] 5.5 Update `ListDrafts` and `ListDiscarded` return types
      `packages/core/src/application/use-cases/list-drafts.ts`, `list-discarded.ts`: return view arrays
      Approach: delegate to repository; update exported types and `packages/core/src/application/use-cases/index.ts`
      (Req: Returns DraftedChangeView / DiscardedChangeView — `core:list-drafts`, `core:list-discarded`)

- [x] 5.6 Update `GetStatus` for active vs drafted vs not discarded
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatusResult` with optional `change` and `draftView`; `get` then `getDraft`; never `getDiscarded`
      Approach: when `draftView` set, empty `availableTransitions` and read-only `nextAction`; throw `ChangeNotFoundError` for discarded-only names
      (Req: Drafted read-only status — `core:get-status`)

- [x] 5.7 Update `DraftChange` return type
      `packages/core/src/application/use-cases/draft-change.ts`: after `mutate`, return `toDraftedChangeView` via `getDraft(name)`
      Approach: keep `mutate` on active; return view not `Change`
      (Req: Return DraftedChangeView — `core:draft-change`)

- [x] 5.8 Update `CreateChange` name collision check
      `packages/core/src/application/use-cases/create-change.ts`: reject when `get(name)` or `getDraft(name)` hits
      Approach: do not consult `getDiscarded` (name reuse allowed)
      (Req: Drafted read-only semantics — `core:change`)

- [x] 5.9 Use-case unit tests
      `packages/core/test/application/use-cases/get-draft.spec.ts`, `get-discarded.spec.ts`, updates to `restore-change.spec.ts`, `discard-change.spec.ts`, `list-drafts.spec.ts`, `list-discarded.spec.ts`, `get-status` tests, `transition-change.spec.ts` (drafted name → not found)
      Approach: use helpers from 4.1; one scenario per spec verify delta
      (Req: verify artifacts for touched use cases)

## 6. CLI

- [x] 6.1 Map `DraftedChangeReadOnlyError` in CLI
      `packages/cli/src/handle-error.ts`: handle `DRAFTED_CHANGE_READ_ONLY` with clear stderr message
      Approach: follow existing domain error mapping pattern
      (Req: secondary guard UX)

- [x] 6.2 Wire `drafts show` to `GetDraft`
      `packages/cli/src/commands/drafts/show.ts`: replace `kernel.changes.status` with `kernel.changes.getDraft.execute`
      Approach: render `view.name`, `view.state`, `view.specIds`, `view.schemaName`/`schemaVersion` from `DraftedChangeView`
      (Req: Loads drafted change via GetDraft — `cli:drafts-show`)

- [x] 6.3 Wire `drafts list` to `ListDrafts` views
      `packages/cli/src/commands/drafts/list.ts`: type against `DraftedChangeView[]`; use `history` on view for drafted metadata
      Approach: minimal diff if already calls `listDrafts`; fix types only if needed
      (Req: Uses ListDrafts read model — `cli:drafts-list`)

- [x] 6.4 Wire `discarded show` to `GetDiscarded`
      `packages/cli/src/commands/discarded/show.ts`: `GetDiscarded.execute`; use `view.discardReason` for `reason` output
      Approach: remove `GetStatus` and manual `isDiscarded` check on full status
      (Req: Loads discarded change via GetDiscarded — `cli:discarded-show`)

- [x] 6.5 Wire `discarded list` to `DiscardedChangeView` fields
      `packages/cli/src/commands/discarded/list.ts`: use `discardReason`, `discardedAt`, `discardedBy`, `supersededBy` from view instead of scanning `history`
      Approach: keep sort by `discardedAt` descending
      (Req: Uses ListDiscarded read model — `cli:discarded-list`)

- [x] 6.6 Read-only `change status` when drafted
      `packages/cli/src/commands/change/status.ts`: when status result has `draftView`, omit transition/validate next actions and label drafted
      Approach: branch on `draftView` from `GetStatus` result shape
      (Req: Drafted change status is read-only — `cli:change-status`)

- [x] 6.7 CLI tests
      `packages/cli/test/commands/list-commands.spec.ts`, `discarded-list.spec.ts`: mock `getDraft`/`getDiscarded`/`listDiscarded` views
      Approach: update mocks to return views with `discardReason`; assert `GetStatus` not called for discarded show
      (Req: CLI verify deltas)

## 7. Manual verification

- [x] 7.1 Draft lifecycle smoke test
      Manual: create change → draft → `change transition` fails → `drafts show` works → restore → active status shows transitions again
      Approach: commands from design.md Testing / Manual section
      (Req: end-to-end drafted read-only behaviour)

- [x] 7.2 Discarded show smoke test
      Manual: discard change → `discarded show <name>` prints reason → `change status <name>` fails (not in active/draft)
      Approach: confirms `GetDiscarded` path after repo split
      (Req: `cli:discarded-show`, `core:get-discarded`)
