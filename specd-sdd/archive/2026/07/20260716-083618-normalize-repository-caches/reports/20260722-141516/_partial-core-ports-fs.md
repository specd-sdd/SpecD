# Spec Compliance Audit — Partial Report: core ports + fs adapters

**Change:** `normalize-repository-caches`
**Batch scope:** `core:repository-port`, `core:change-repository-port`, `core:spec-repository-port`, `core:archive-repository-port`, `core:change-list-entry`, `core:archived-change-index-entry`, `core:storage`, `core:fs-change-repository`, `core:fs-spec-repository`, `core:fs-archive-repository`
**Method:** `specd changes spec-preview` for merged spec/verify content per spec ID, code-graph search for symbol locations, direct read of port + fs adapter implementations and their existing unit tests.

---

## Finding 1 — CRITICAL — `paginateList` computes `meta.after` incorrectly (CODE bug)

**Spec:** `core:repository-port` verify.md, Requirement "Shared list pagination types":

> #### Scenario: After cursor returns the next page in canonical order
>
> - **GIVEN** a bucket with at least three entries in canonical sort order
> - **WHEN** `list({ limit: 1, after: { key: <first-key>, id: <first-id> } })` is called for a change bucket
> - **THEN** the first returned item is strictly after that cursor position
> - **AND** `meta.after` reflects **the last returned position** when more items remain

**Implementation:**

```15:57:packages/core/src/infrastructure/fs/list-pagination.ts
export function paginateList<T>(
  allItems: readonly T[],
  options: ListOptions | undefined,
  getCursor: (item: T) => ListCursor,
): ListResult<T> {
  const limit = options?.limit ?? 100
  const total = allItems.length

  let window = allItems
  let page: number | undefined
  let afterCursor: ListCursor | undefined

  if (options?.after !== undefined) {
    afterCursor = options.after
    ...
  }
  ...
  return {
    items,
    meta: {
      total,
      count: items.length,
      limit,
      ...(page !== undefined ? { page } : {}),
      ...(afterCursor !== undefined ? { after: afterCursor } : {}),
    },
  }
}
```

`afterCursor` is assigned directly from `options.after` — the **input** cursor the caller
passed in — and is echoed back verbatim as `meta.after`. It is never recomputed from
`getCursor(lastReturnedItem)`.

Consequences:

1. **Broken keyset pagination loop.** A caller that pages forward by feeding
   `meta.after` back into the next call's `options.after` (the documented usage pattern
   for exclusive keyset cursors) will receive the **exact same page again**, forever —
   because `meta.after` is identical to the `after` they just sent. This defeats the
   entire purpose of `after`-based pagination for changes/drafts/discarded/archive/specs.
2. **Missing "no more pages" signal.** The spec implies `meta.after` should be present
   "when more items remain" (i.e., omitted / absent once there is nothing left to page
   through). The current code sets `meta.after` any time the caller passed `after` in
   the request, regardless of whether the returned window reached the end of the bucket.

**Fix direction (not applied — read-only audit):** `meta.after` should be derived from
`getCursor(items[items.length - 1])` when `items.length > 0` **and** there are more
items beyond the current window (`window.length > limit`, i.e. items were truncated),
and omitted otherwise.

**Verification status:** No test exercises this scenario. There is no dedicated test
file for `list-pagination.ts` (`packages/core/test/**/*list-pagination*` — 0 files), and
`fs-change-index-cache.spec.ts` / `fs-spec-index-cache.spec.ts` contain no `after:` /
`meta.after` assertions. CLI tests (`packages/cli/test/commands/change-list.spec.ts` etc.)
only assert that `--after-key`/`--after-id` are forwarded into the mocked use-case call
args — they never assert on `meta.after` of a real result, so this defect passes CI
undetected.

**Classification:** CODE bug (implementation contradicts an explicit, unambiguous
verify.md scenario). Affects every listable port that uses shared pagination
(`ChangeRepository.list/listDrafts/listDiscarded`, `ArchiveRepository.list`,
`SpecRepository.list`) since they all route through `FsIndexCache.list()` →
`paginateList()`.

---

## Finding 2 — CRITICAL — `archivePath()` cannot actually accept an `ArchiveListEntry`, contradicting an explicit spec requirement (CODE bug)

**Spec:** `core:archive-repository-port` delta (spec.md), Requirement "archivePath returns the absolute path for an archived change":

> `archivePath(entry)` MUST accept **either** a full `ArchivedChange` **or** an
> `ArchiveListEntry` and return the absolute filesystem path to the archived directory.

verify.md delta adds an explicit scenario:

> #### Scenario: Path resolved from ArchiveListEntry
>
> - **GIVEN** an `ArchiveListEntry` for the same archived change
> - **WHEN** `archivePath(entry)` is called
> - **THEN** it returns the same absolute archived directory path as for the full `ArchivedChange`

**Implementation contradicts this:**

```14:20:packages/core/src/application/ports/archive-repository.ts
export type ArchivePathEntry = {
  readonly name: string
  readonly archivedName: string
  readonly archivedAt: Date
  readonly workspaces: readonly string[]
}
```

```124:124:packages/core/src/application/ports/archive-repository.ts
  abstract archivePath(entry: ArchivePathEntry): string
```

`ArchivePathEntry.workspaces` is a **required** field. But per the sibling spec
`core:archived-change-index-entry` (delta), `ArchiveListEntry` was explicitly changed to
**drop** `workspaces`:

```9:17:packages/core/src/domain/archived-change-index-entry.ts
export interface ArchiveListEntry {
  readonly name: string
  readonly archivedName: string
  readonly archivedAt: Date
  readonly archivedBy?: ActorIdentity
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
}
```

> "`ArchiveListEntry` MUST NOT include a `workspaces` field. Callers that need workspace
> prefixes MUST derive them from `specIds`... The former derived `workspaces` field and
> `workspacesFromSpecIds` helper used only for archive listing MUST be removed when no
> longer referenced." (`archived-change-index-entry` spec.md delta)

So the two deltas in the same change are mutually inconsistent with the actual code:
`archivePath()`'s parameter type structurally **excludes** `ArchiveListEntry` (missing
required `workspaces`), and the real implementation body dereferences that field at
runtime:

```327:336:packages/core/src/infrastructure/fs/archive-repository.ts
  override archivePath(entry: ArchivePathEntry): string {
    const relPath = this._expandPattern(
      entry.name,
      entry.archivedName,
      entry.archivedAt,
      entry.workspaces[0] ?? 'default',
    )
    return resolveArchiveDirPathSync(this._archivePath, relPath)
  }
```

If a caller were to pass a real `ArchiveListEntry` (e.g. a row from `list()`), this would
either:

- fail to compile (TypeScript: `Property 'workspaces' is missing in type 'ArchiveListEntry'`), or
- if forced past the type system, throw at runtime on `entry.workspaces[0]` (`workspaces`
  is `undefined` on an actual `ArchiveListEntry` object; `undefined[0]` throws).

**Blast radius / current usage:** Grepped all production call sites of `archivePath(...)`:
`run-step-hooks.ts:152` and `get-hook-instructions.ts:82` both call it with the result of
`this._archive.get(name)`, which returns `ArchivedChange` (which satisfies
`ArchivePathEntry` because `ArchivedChange extends ReadOnlyChangeView`, and
`ReadOnlyChangeView.workspaces` is a required field on that interface). So today, no
production code path actually breaks — but the spec's required capability (deriving an
archived path directly from a cheap `ArchiveListEntry` row without loading full detail,
e.g. for CLI display alongside `archive list`) is **not implementable** with the current
type signature.

**Verification status:** No test exercises `archivePath()` with an `ArchiveListEntry`.
`packages/core/test/infrastructure/fs/archive-repository.spec.ts`'s `describe('archivePath', ...)`
block only calls `archivePath(archivedChange)` with the full `ArchivedChange` returned
from `archive()`. The verify.md-mandated "Path resolved from ArchiveListEntry" scenario
has no corresponding test anywhere in the repo.

**Classification:** CODE bug / incomplete implementation of an explicit, testable spec
requirement — not spec drift, since the requirement is clear and the domain type
(`ArchiveListEntry`) was correctly built per its own spec; it's the **port's parameter
type and the FS adapter body** that were never updated to make the union usable.

**Suggested fix direction (not applied):** Change `ArchivePathEntry` to a union/loosened
shape, e.g. `{ name, archivedName, archivedAt, workspaces } | { name, archivedName, archivedAt, specIds }`,
and change `archivePath()`'s body to derive the workspace either from `workspaces[0]`
(when present) or from `specIds[0]?.split(':')[0] ?? 'default'` (the same derivation
already used ad hoc in `get-hook-instructions.ts:81` and `run-step-hooks.ts:146`) when
`workspaces` is absent.

---

## Finding 3 — MEDIUM — `FsChangeRepository.save()` always unconditionally rewrites the list-index row, contradicting the change's own design intent (likely CODE / design gap, not a strict MUST violation)

**Design intent** (`design.md`, task 5.2 in `tasks.md`):

> "On save project entry and upsert if changed" — i.e. an unconditional `save()` should
> only trigger an index-file rewrite when the projected list entry actually differs from
> what's stored, avoiding needless atomic-publish churn on every manifest write (e.g.
> artifact validation events that don't touch list-entry fields).

**Implementation:**

```265:293:packages/core/src/infrastructure/fs/change-repository.ts
  private async _syncChangeIndex(
    change: Change,
    targetDir: string,
    targetBucket: ChangeBucketKind,
    previousBucket: ChangeBucketKind | null,
  ): Promise<void> {
    ...
    if (targetBucket === 'active') {
      await this._activeIndex.upsert(toActiveChangeListEntry(change, { includeDescription: true }), mtimeIso)
      return
    }
    ...
```

`FsChangeIndexCache` only exposes `upsert()` (unconditional write); it does not expose the
`upsertIfChanged()` capability that the underlying `FsIndexCache` base class already
provides (`fs-index-cache-base.ts:257-268`). Every `save()` — including saves triggered
purely by artifact-content changes that don't affect any list-entry field — performs a
full JSONL-index temp-write + rename + meta temp-write + rename for that bucket.

**Spec status:** No `spec.md`/`verify.md` MUST explicitly requires "upsert only if
changed" for the _change_ buckets (unlike the _spec_ buckets, where materialization cost
is much higher). This is a task-note/design-doc deviation rather than a verified MUST
violation, so it does not block compliance, but it is a real behavioral gap versus the
stated implementation approach and a potential write-amplification / lock-contention
concern under concurrent `save()` calls on frequently-touched active changes.

**Classification:** LOW-MEDIUM, design-doc deviation (approach note not enforced),
not a spec MUST violation. Flagging for awareness; does not block sign-off on its own.

---

## Areas checked and found compliant

- `Repository` base class (`repository.ts`): `RepositoryConfig`, four accessors,
  `ReadOnlyWorkspaceError` (checked existence, not re-verified in depth this pass),
  `invalidateCache()` default no-op — matches `core:repository-port` exactly.
- `ListOptions`/`ListMeta`/`ListResult`/`ListCursor` shapes — match spec exactly, default
  `limit` 100 applied in `paginateList`.
- `page`/`after` mutual exclusivity — code "normalizes to one pagination mode" (ignores
  `page` when `after` is set) per the spec's permitted alternative to outright rejection;
  CLI additionally hard-rejects the combination.
- `ChangeListEntryBase` / `ActiveChangeListEntry` / `DraftedChangeListEntry` /
  `DiscardedChangeListEntry` (`domain/change-list-entry.ts`) — field shapes, optional
  `description`/`reason`/`supersededBy` (singular, matching spec's list-row
  simplification vs. the array-typed `ReadOnlyChangeView.supersededBy` used for detail
  views) all match `core:change-list-entry`.
- `state` derivation in `FsChangeIndexCache`'s `deriveState()` is byte-for-byte the same
  algorithm as `Change.state` getter (`change.ts:346-352`) — no drift between list-entry
  projection and detail-view state.
- `ChangeRepository` port (`change-repository.ts`): `list`/`listDrafts`/`listDiscarded`
  signatures, `count()`/`countDrafts()`/`countDiscarded()`, `reindex()` +
  per-bucket `reindexActive/Drafts/Discarded()`, include-flag projection contract, abstract
  method list — all match `core:change-repository-port`.
- `FsChangeRepository` wiring: three `FsChangeIndexCache` instances under
  `{configPath}/tmp/fs-cache/{changes,drafts,discarded}/`, `_syncChangeIndex` on save
  (upsert + cross-bucket removal on move), `invalidateCache()` invalidates all three,
  `_ensureGitignore()` called before every list/count/reindex — matches
  `core:fs-change-repository` and the storage-layout requirement.
- `SpecRepository` port shape (`SpecListEntry`, `SpecListOptions`, `list/count/reindex`)
  matches `core:spec-repository-port`; `FsSpecIndexCache` bucket path
  `fs-cache/specs/<workspace>/` matches storage spec's "Filesystem list index cache
  layout" requirement.
- `ArchiveRepository.list/count/reindex/get` and `FsArchiveRepository`: fs-cache index
  under `fs-cache/archive/`, legacy root-index deletion on rebuild only
  (`_deleteLegacyRootIndex`, invoked via `onRebuilt` hook — never on normal
  list/count cache hits), archive-root `.gitignore` reduced to `.staging` only (no
  stale requirement for `.specd-index.jsonl`/`.specd-index-meta.json` entries),
  staged commit via `.staging/` + atomic `moveDir` + rollback on failure, dedup-by-name
  "last entry wins" in both `list()` and `count()` (consistent with each other) — all
  match `core:archive-repository-port`, `core:fs-archive-repository`, and `core:storage`.
- `ArchiveListEntry` domain type (`archived-change-index-entry.ts`): required fields,
  optional `archivedBy`, no `artifacts`, no `workspaces`, deprecated alias kept — matches
  `core:archived-change-index-entry` delta exactly.
- `FsIndexCache` base (`fs-index-cache-base.ts`): mutate/lock queue, jsonl-then-meta
  atomic publish order, invalidated → mtime/sourceFiles staleness → 5-minute TTL
  freshness sequence, `upsert`/`upsertIfChanged`/`remove` — matches `core:storage`'s
  "Filesystem list index cache layout" and design.md's freshness model description.
- `configPath/tmp/.gitignore` hygiene (`ensure-tmp-gitignore.ts` used by change/spec/archive
  repos) — not re-read in full this pass, but call sites and idempotency guard
  (`_tmpGitignoreEnsured`) are present in all three FS repositories as required.

## Not covered in this batch (out of scope)

`core:change`, `core:change-manifest`, `core:list-changes`/`list-drafts`/`list-discarded`/
`list-archived`/`list-specs` use cases, `core:get-project-summary`, `core:config-writer-port`,
and all `cli:*` list/reindex specs are covered by other report batches per the change's
report split.
