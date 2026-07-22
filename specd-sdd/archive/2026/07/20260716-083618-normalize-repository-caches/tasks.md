# Tasks: normalize-repository-caches

## 1. Shared list types and Repository base

- [x] 1.1 Add shared list pagination types to Repository port
      `packages/core/src/application/ports/repository.ts`: export `ListCursor`, `ListOptions`, `ListMeta`, `ListResult<T>`
      Approach: Use the exact TypeScript shapes from design.md; document `limit` default 100 and `page` XOR `after` in JSDoc.
      (Req: Shared list pagination types)

- [x] 1.2 Add `invalidateCache()` to Repository base
      `packages/core/src/application/ports/repository.ts`: `Repository.invalidateCache`
      Approach: Concrete default method returning resolved promise (no-op); subclasses override.
      (Req: invalidateCache resets adapter caches)

## 2. List entry domain types

- [x] 2.1 Add change list entry types
      `packages/core/src/domain/change-list-entry.ts` (new): `ChangeListEntryBase`, `ActiveChangeListEntry`, `DraftedChangeListEntry`, `DiscardedChangeListEntry`
      Approach: Three distinct interfaces sharing base; optional fields only via includes; no history/artifacts on entries; export from package barrel.
      (Req: Shared change list entry base; Active/Drafted/DiscardedChangeListEntry; Three distinct entry types)

- [x] 2.2 Rename archive list entry type and drop unused fields
      `packages/core/src/domain/archived-change-index-entry.ts`: `ArchiveListEntry`
      Approach: Rename from `ArchivedChangeIndexEntry`; drop `artifacts` and legacy `workspaces`; optional `archivedBy`; remove `workspacesFromSpecIds` when unused; update imports/exports (compat alias only if needed for one compile step, remove before finish).
      (Req: ArchiveListEntry fields; No manifest-only data)

- [x] 2.3 Elevate `SpecListEntry` to port-owned type
      Prefer `packages/core/src/application/ports/spec-repository.ts` (or adjacent domain module): `SpecListEntry`
      Approach: Move/re-export from use-case module; fields `workspace`, `path`, `title`, optional `summary`/`metadataStatus`.
      (Req: SpecListEntry port shape)

## 3. Port signature updates

- [x] 3.1 Update ChangeRepository list/count/reindex contracts
      `packages/core/src/application/ports/change-repository.ts`: `list`, `listDrafts`, `listDiscarded`, `count*`, `reindex*`
      Approach: Return `ListResult<*ChangeListEntry>`; add `*ListOptions` with include flags; four reindex methods; no full aggregates from list.
      (Req: list returns ListResult; count; reindex surfaces; include projection)

- [x] 3.2 Update SpecRepository list/count/reindex contracts
      `packages/core/src/application/ports/spec-repository.ts`: `list`, `count`, `reindex`
      Approach: `list(prefix?, options?)` → `ListResult<SpecListEntry>`; `SpecListOptions` includes; `reindex()`.
      (Req: list returns SpecListEntry; Spec list reindex; count alignment)

- [x] 3.3 Update ArchiveRepository list/count/reindex contracts
      `packages/core/src/application/ports/archive-repository.ts`: `list`, `count`, `reindex`
      Approach: Replace `startAt` with `after`; `ArchiveListOptions.includeArchivedBy`; `reindex` rebuilds fs-cache.
      (Req: list canonical order; Archive list count; reindex fs-cache)

- [x] 3.4 Update stub repositories to new contracts
      `packages/core/test/application/use-cases/helpers.ts`: `StubChangeRepository` (+ spec/archive stubs if present)
      Approach: Implement list envelopes, counts, reindex/invalidate no-ops or in-memory; keep tests compiling.
      (Req: Testing — stubs/fakes)

## 4. FS index helpers

- [x] 4.1 Implement shared atomic publish + bucket lock primitives
      `packages/core/src/infrastructure/fs/` (reuse `write-atomic.ts`, add lock helper as needed)
      Approach: `mutate(fn)` acquires per-bucket lock (waiters wait); temp+rename; jsonl-then-meta publish order; discard temps on failure.
      (Req: Index write concurrency; Atomic publish)

- [x] 4.2 Implement `FsChangeIndexCache`
      `packages/core/src/infrastructure/fs/fs-change-index-cache.ts` (new)
      Approach: Wire `{entry, sourceMtime}`; meta `{totalCount, generatedAt, isInvalidated}`; canonical sort per bucket; list/count/reindex/invalidate/upsert/remove; freshness: invalidated → mtimes → 5min TTL → serve.
      (Req: FsChangeIndexCache; Freshness model)

- [x] 4.3 Implement `FsSpecIndexCache`
      `packages/core/src/infrastructure/fs/fs-spec-index-cache.ts` (new)
      Approach: Wire `{entry, sourceFiles}`; materialize full SpecListEntry (title/summary/metadataStatus) at index time; path asc sort; same mutate/freshness rules.
      (Req: FsSpecIndexCache; SpecListEntry materialization)

- [x] 4.4 Unit-test index helpers
      `packages/core/test/infrastructure/fs/fs-change-index-cache.spec.ts` + `fs-spec-index-cache.spec.ts` (new)
      Approach: Cover mutate waiters, atomic publish, TTL, mtime miss rebuild, upsert/remove, include projection from stored payload.
      (Req: Testing — helpers)

## 5. Wire FS repositories

- [x] 5.1 Delegate FsChangeRepository list/count/reindex/invalidate to helpers
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository`
      Approach: One helper instance per bucket dir under `{configPath}/tmp/fs-cache/{changes,drafts,discarded}/`; project history-derived entry fields; override `invalidateCache`.
      (Req: FS change repository delegation)

- [x] 5.2 Upsert/invalidate change index on write paths
      `packages/core/src/infrastructure/fs/change-repository.ts`: `save`, create/delete/move paths
      Approach: On save project entry and upsert if changed; moves update both buckets; `saveArtifact` does not require list-index writes.
      (Req: Write-path updates)

- [x] 5.3 Wire FsSpecRepository to FsSpecIndexCache
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `FsSpecRepository`
      Approach: Cache under `fs-cache/specs/<workspace>/`; list/count/reindex/invalidate; refresh on create/delete/metadata/content affecting entry fields.
      (Req: FS spec repository delegation)

- [x] 5.4 Migrate FsArchiveRepository index to fs-cache
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `FsArchiveRepository`
      Approach: Stop root `.specd-index*`; rebuild into `fs-cache/archive/`; orphan delete of root index files only on rebuild/migration; `ArchiveListEntry` without `artifacts` or `workspaces`.
      (Req: Archive fs-cache index; Orphan cleanup)

- [x] 5.5 Ensure `{configPath}/tmp/.gitignore` at runtime
      Shared helper used by FS repos (or change repo bootstrap)
      Approach: Idempotently write `*\n!.gitignore` when ensuring tmp/fs-cache.
      (Req: configPath/tmp git hygiene)

## 6. Use cases

- [x] 6.1 Update ListChanges to ListResult + options forwarding
      `packages/core/src/application/use-cases/list-changes.ts`: `ListChanges.execute`
      Approach: Accept `ActiveChangeListOptions`; return `ListResult<ActiveChangeListEntry>`; do not re-sort.
      (Req: ListChanges list entries)

- [x] 6.2 Update ListDrafts likewise
      `packages/core/src/application/use-cases/list-drafts.ts`
      Approach: Forward `includeDescription`/`includeReason`; no re-sort.
      (Req: ListDrafts)

- [x] 6.3 Update ListDiscarded likewise
      `packages/core/src/application/use-cases/list-discarded.ts`
      Approach: Forward description/reason/supersededBy includes; no re-sort.
      (Req: ListDiscarded)

- [x] 6.4 Update ListArchived for ArchiveListEntry + after cursor
      `packages/core/src/application/use-cases/list-archived.ts`
      Approach: Replace `startAt` with `after`; forward `includeArchivedBy`.
      (Req: ListArchived)

- [x] 6.5 Update ListSpecs to forward port entries without re-resolution I/O
      `packages/core/src/application/use-cases/list-specs.ts`: `ListSpecs.execute`
      Approach: Forward list options to each workspace repo; do not re-read metadata/spec.md when fields already present; preserve workspace declaration order.
      (Req: ListSpecs orchestration)

- [x] 6.6 Update GetProjectSummary to use counts
      `packages/core/src/application/use-cases/get-project-summary.ts`: `GetProjectSummary.execute`
      Approach: Call `count()` / use `meta.total`; never materialize full lists for totals.
      (Req: GetProjectSummary counts)

## 7. ConfigWriter / init

- [x] 7.1 Create tmp gitignore in initProject
      `packages/core/src/infrastructure/fs/config-writer.ts` (+ port docs): `initProject`
      Approach: Create `{configPath}/tmp/.gitignore` with `*` and `!.gitignore`, idempotent if already correct.
      (Req: initProject tmp gitignore)

## 8. CLI list commands

- [x] 8.1 Add shared CLI pagination/include parsing helper (if needed)
      `packages/cli/src/` shared module
      Approach: Parse `--limit` (default 100), `--page`, `--after-key`, `--after-id`; enforce page XOR after; build truncation hint `showing <count> of <total> (use --limit/--page)`.
      (Req: Pagination in CLI)

- [x] 8.2 Update `changes list` CLI
      `packages/cli/src/commands/change/list.ts`
      Approach: Pagination flags + `--description`; print hint when truncated; no re-sort; `{items,meta}` in json/toon.
      (Req: cli:change-list)

- [x] 8.3 Update `drafts list` CLI
      `packages/cli/src/commands/drafts/list.ts`
      Approach: Pagination + `--description`/`--reason` (reason opt-in); hint; no re-sort.
      (Req: cli:drafts-list)

- [x] 8.4 Update `discarded list` CLI
      `packages/cli/src/commands/discarded/list.ts`
      Approach: Pagination + description/reason/superseded-by; hint; no re-sort.
      (Req: cli:discarded-list)

- [x] 8.5 Update `archive list` CLI
      `packages/cli/src/commands/archive/list.ts`
      Approach: Replace `--start-at` with `--after-key`/`--after-id`; `--archived-by`; drop artifacts column; hint.
      (Req: cli:archive-list)

- [x] 8.6 Update `specs list` CLI
      `packages/cli/src/commands/spec/list.ts`
      Approach: Add pagination flags (no after-id); keep summary/metadata-status; hint; no re-sort.
      (Req: cli:spec-list)

## 9. CLI storage reindex

- [x] 9.1 Add `specd storage reindex` command
      `packages/cli/src/commands/storage/reindex.ts` (new) + register in entrypoint/storage group
      Approach: No flags → all; `--changes`/`--specs`/`--archive` combinable; call port `reindex` only; never touch JSONL layout.
      (Req: cli:storage-reindex Port delegation)

## 10. Tests beyond stubs

- [x] 10.1 Update core use-case/composition tests for ListResult envelopes
      `packages/core/test/application/use-cases/list-*.spec.ts`, `get-project-summary.spec.ts`, composition list tests
      Approach: Assert meta.total/count/limit; includes omit fields when unset; counts without full list.
      (Req: Testing — use cases)

- [x] 10.2 Update FS repository integration tests
      `packages/core/test/infrastructure/fs/*repository*.spec.ts`
      Approach: Cover index rebuild, orphan cleanup, write-path upsert, invalidateCache.
      (Req: Testing — FS adapters)

- [x] 10.3 Add/update CLI list and reindex tests
      `packages/cli/test/commands/*list*.spec.ts`, `storage-reindex.spec.ts` (new)
      Approach: Cover default limit, XOR validation, include flags, truncation hint, reindex flag matrix.
      (Req: Testing — CLI)

## 11. Documentation & manual verification

- [x] 11.1 Update CLI docs for pagination, includes, and storage reindex
      `docs/cli/cli-reference.md` (and related storage docs if present)
      Approach: Document default limit 100, include flags, truncation hint, `specd storage reindex` flags, fs-cache location under tmp.
      (Req: Documentation)

- [x] 11.2 Manual E2E smoke of list + reindex paths
      Local project via `node packages/cli/dist/index.js ...`
      Approach: Run design.md Manual/E2E commands; confirm fs-cache files and tmp gitignore; confirm truncated hint appears when expected.
      (Req: Manual / E2E verification)

## 12. Post-verify remediation (after first implement pass)

- [x] 12.1 Fix `paginateList` `meta.after` computation
      `packages/core/src/infrastructure/fs/list-pagination.ts`: `paginateList`
      Approach: Compute `meta.after` from `getCursor(items[items.length - 1])` whenever `window.length > limit` (more items remain), in both `page` and `after` request modes; omit `meta.after` entirely when `window.length <= limit` (page reaches end of bucket). Stop echoing the request's `options.after` back as `meta.after`.
      (Req: paginateList meta.after semantics §9.1)

- [x] 12.2 Unit tests for `paginateList` `meta.after` semantics
      `packages/core/test/infrastructure/fs/list-pagination.spec.ts` (new or extend)
      Approach: Cover first page with remainder (`meta.after` = last item cursor), last page (omitted), single-page total (omitted), and `page`-mode responses that also populate `meta.after` for forward keyset continuation.
      (Req: paginateList meta.after semantics §9.1)

- [x] 12.3 Narrow `ArchivePathEntry` to drop `workspaces`
      `packages/core/src/application/ports/archive-repository.ts`: `ArchivePathEntry`
      Approach: Change type to `{ name: string; archivedName: string; archivedAt: Date }`; remove `readonly workspaces: readonly string[]` so `ArchiveListEntry` rows satisfy the type without synthesizing a fake `workspaces` array.
      (Req: archivePath accepts ArchiveListEntry without workspaces §9.2)

- [x] 12.4 Reject `{{change.workspace}}` in `FsArchiveRepository` constructor
      `packages/core/src/infrastructure/fs/archive-repository.ts`: constructor
      Approach: Add a pattern-validation check for `{{change.workspace}}` alongside the existing `{{change.scope}}` check; `throw new UnsupportedPatternError('{{change.workspace}}', ...)` at construction time.
      (Req: Archive pattern rejects {{change.workspace}} §9.2/§9.3)

- [x] 12.5 Drop `workspace` parameter from `_expandPattern`
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `_expandPattern`
      Approach: Change signature to 3 args `(name, archivedName, archivedAt)`; remove the `.replaceAll('{{change.workspace}}', workspace)` line entirely.
      (Req: Archive pattern rejects {{change.workspace}} §9.2/§9.3)

- [x] 12.6 Stop deriving singular workspace in `archive()`
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `archive()` (create path, ~line 211)
      Approach: Remove the `change.workspaces[0] ?? 'default'` computation; stop passing a workspace argument to `_expandPattern`.
      (Req: Archive pattern rejects {{change.workspace}} §9.2/§9.3)

- [x] 12.7 Stop deriving singular workspace in `archivePath()`
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `archivePath()` (~line 333)
      Approach: Remove the `entry.workspaces[0] ?? 'default'` computation; stop passing a workspace argument to `_expandPattern`; accept the narrowed `ArchivePathEntry` (per 12.3) directly.
      (Req: archivePath accepts ArchiveListEntry without workspaces §9.2)

- [x] 12.8 Remove singular workspace injection from `RunStepHooks`
      `packages/core/src/application/use-cases/run-step-hooks.ts`: `RunStepHooks.execute`
      Approach: Remove the `workspace` key and its derivation from both the archive-fallback branch (`archived.specIds[0]?.split(':')[0] ?? 'default'`, ~line 146) and the active-change branch (`change.workspaces[0] ?? 'default'`, ~line 199); `variables.change` keeps only `name`, `path`, and (archive branch) `archivedName`. Note: `Change.workspaces` (plural derived getter) is not removed or modified — only the singular `[0] ?? 'default'` derivation at this call site is dropped.
      (Req: No singular workspace injected into template variables §9.3)

- [x] 12.9 Remove singular workspace injection from `GetHookInstructions`
      `packages/core/src/application/use-cases/get-hook-instructions.ts`: `GetHookInstructions.execute`
      Approach: Remove the `workspace` key and its derivation from the archive-fallback branch (~line 81) and the active-change branch (~line 90); narrow the local `contextVars` inline type to drop `workspace: string`.
      (Req: No singular workspace injected into template variables §9.3)

- [x] 12.10 Remove singular workspace injection from `GetArtifactInstruction`
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`: `GetArtifactInstruction.execute`
      Approach: Remove the `workspace` key (`change.workspaces[0] ?? 'default'`, ~line 123) from `contextVars.change`.
      (Req: No singular workspace injected into template variables §9.3)

- [x] 12.11 Tests: `UnsupportedPatternError` for `{{change.workspace}}` and `archivePath` without `workspaces`
      `packages/core/test/infrastructure/fs/archive-repository*.spec.ts`
      Approach: Assert construction throws `UnsupportedPatternError('{{change.workspace}}', ...)` mirroring the existing `{{change.scope}}` test; call `archivePath()` with a plain `{ name, archivedName, archivedAt }` object (no `workspaces` key) and assert it resolves.
      (Req: Archive pattern rejects {{change.workspace}} §9.2/§9.3; archivePath accepts ArchiveListEntry without workspaces §9.2)

- [x] 12.12 Test: no `workspace` key in `RunStepHooks` template variables
      `packages/core/test/application/use-cases/run-step-hooks*.spec.ts`
      Approach: Assert the `change` namespace passed to `TemplateExpander.expand()` never contains a `workspace` key, for both the active-change and archived-change (post-archive fallback) branches.
      (Req: No singular workspace injected into template variables §9.3)

- [x] 12.13 Test: no `workspace` key in `GetHookInstructions` template variables
      `packages/core/test/application/use-cases/get-hook-instructions*.spec.ts`
      Approach: Assert `contextVars.change` never contains a `workspace` key, for both active-change and archived-change branches.
      (Req: No singular workspace injected into template variables §9.3)

- [x] 12.14 Test: no `workspace` key in `GetArtifactInstruction` template variables
      `packages/core/test/application/use-cases/get-artifact-instruction*.spec.ts`
      Approach: Assert `contextVars.change` never contains a `workspace` key.
      (Req: No singular workspace injected into template variables §9.3)

- [x] 12.15 Verify composition deps narrowed (no code change expected)
      `packages/core/src/composition/use-cases/get-project-summary.ts`, `packages/core/src/composition/use-cases/list-specs.ts`
      Approach: Re-confirm `resolveGetProjectSummaryDeps` returns exactly `{ changes, archive, listWorkspaces }` and `resolveListSpecsDeps` returns exactly `{ listWorkspaces }`; extend `get-project-summary.spec.ts` / `list-specs.spec.ts` composition tests to assert the narrowed shape (no `hasher`/`yaml`/`list*` keys) so future drift fails a test.
      (Req: Composition deps narrowed §9.4)

- [x] 12.16 Verify `cli:spec-list --workspace` filtered-only JSON/toon (no code change expected)
      `packages/cli/src/commands/spec/list.ts`, `packages/cli/test/commands/spec-list*.spec.ts`
      Approach: Re-confirm `workspaceFilter` narrows `visibleWorkspaces` before building output in text/JSON/toon (no stub entries for unmatched workspaces); extend the CLI test to assert unmatched configured workspaces are absent (not empty stubs) when `--workspace` is passed.
      (Req: cli:spec-list --workspace JSON/toon filtered-only §9.5)

- [x] 12.17 Docs: remove `{{change.workspace}}` from config reference
      `docs/config/config-reference.md`
      Approach: Remove the `{{change.workspace}}` variable table row and the `pattern: '{{change.workspace}}/{{change.archivedName}}'` example; replace the example with a `{{change.name}}`-based pattern.
      (Req: Documentation sweep §9.6)

- [x] 12.18 Docs: remove `{{change.workspace}}` from multi-repo coordinator example
      `docs/config/examples/multi-repo-coordinator.md`
      Approach: Drop `{{change.workspace}}` from the "supported template variables in `run:` hooks" list.
      (Req: Documentation sweep §9.6)

- [x] 12.19 Docs: remove `{{change.workspace}}` from workspaces guide
      `docs/guide/workspaces.md`
      Approach: Remove the "`{{change.workspace}}` expands to the primary workspace" prose, its pattern example, and the variable table row; clarify the archive pattern only supports `{{change.name}}` / `{{change.archivedName}}` / date tokens.
      (Req: Documentation sweep §9.6)

- [x] 12.20 Docs: remove `{{change.workspace}}` row from workflow guide
      `docs/guide/workflow.md`
      Approach: Remove the `{{change.workspace}}` row from the hook variable table.
      (Req: Documentation sweep §9.6)

- [x] 12.21 Docs: remove `{{change.workspace}}` row from schemas guide
      `docs/guide/schemas.md`
      Approach: Remove the `{{change.workspace}}` row from the template variable table.
      (Req: Documentation sweep §9.6)

- [x] 12.22 Docs: remove `{{change.workspace}}` from configuration guide
      `docs/guide/configuration.md`
      Approach: Remove `{{change.workspace}}` from the "Available variables" list for the archive pattern.
      (Req: Documentation sweep §9.6)

- [x] 12.23 Docs: remove `{{change.workspace}}` row from schema-format reference
      `docs/schemas/schema-format.md`
      Approach: Remove the `{{change.workspace}}` row from the template variable table.
      (Req: Documentation sweep §9.6)

- [x] 12.24 Docs: update ADR 0013 workspace-template claim
      `docs/adr/0013-workspaces-not-scopes.md`
      Approach: Update the sentence asserting "Template variables use `{{change.workspace}}`" — remove it or replace with a note that this token was removed post-verify; keep the ADR's core decision (workspaces not scopes) intact.
      (Req: Documentation sweep §9.6)

- [x] 12.25 Docs: verify use-cases reference against new list/count contracts
      `docs/core/use-cases.md`
      Approach: Verify/update constructor signatures and return shapes for `GetProjectSummary`, `ListSpecs`, and the four `List*` use cases against their `count()`/`ListResult` contracts; confirm no `{{change.workspace}}` example remains.
      (Req: Documentation sweep §9.6)

- [x] 12.26 Docs: verify CLI reference against list/pagination changes and workspace token removal
      `docs/cli/cli-reference.md`
      Approach: Verify/update list command flag tables (pagination/include flags, `storage reindex`) against the cache-normalization CLI changes; confirm no `{{change.workspace}}` example remains.
      (Req: Documentation sweep §9.6)

- [x] 12.27 Confirm zero remaining `{{change.workspace}}` references
      Repo-wide grep (no source file — verification step)
      Approach: After 12.17–12.26 land, re-grep the repo for `{{change.workspace}}`; confirm zero remaining live references outside `CHANGELOG.md` / historical `specd-sdd/archive/**` entries.
      (Req: Documentation sweep §9.6)
