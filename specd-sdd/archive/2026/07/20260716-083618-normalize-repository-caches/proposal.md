# Proposal: normalize-repository-caches

## Motivation

Listing changes, drafts, discarded items, archives, and specs is a hot path for CLI and agents. Today those paths are inconsistent and often expensive. Verification of the first implementation also exposed leftover singular-`{{change.workspace}}` semantics and a few contract/docs mismatches that belong in the same change before archive:

- `ChangeRepository.list*` returns full domain objects / rich views (including history), so every list pays for full `manifest.json` rehydration — and active `list()` even goes through `get()` with drift hashing.
- `SpecRepository.list()` is lighter, but still walks the tree; title/summary enrichment lives only in the use case.
- `ArchiveRepository.list()` already returns lightweight index entries with a `{ items, meta }` envelope, but its index files live inside the archive root.
- Template expansion and archive path patterns treat a change as having a single “primary” workspace (`change.workspaces[0] ?? 'default'` / `{{change.workspace}}`), which is incorrect: a change has no workspace of its own — only workspaces touched via `specIds`.

We need one uniform list/count/reindex contract across repositories, backed by a filesystem index cache under `{configPath}/tmp/fs-cache/` for FS adapters, plus removal of singular-workspace template semantics and the verification/compliance fixes listed below.

## Current behaviour

- **Changes / drafts / discarded:** `list*` materializes full `Change` / drafted / discarded views from manifests (active list calls `get()` per entry).
- **Specs:** `list()` returns lightweight `Spec` metadata; `ListSpecs` builds `SpecListEntry` (title / optional summary / metadata status) above the port. `count()` walks the tree.
- **Archive:** `list()` returns `ArchivedChangeIndexEntry[]` inside `{ items, meta }` without reading every manifest. Index files (`.specd-index.jsonl`, `.specd-index-meta.json`) live at the archive root and are gitignored locally. `reindex()` rebuilds that root-local index.

## Proposed solution

### 1. Uniform list/count API at the port layer

Shared listing types live on **`core:repository-port`** (alongside `Repository`):

```typescript
interface ListCursor {
  /** Sort-key value in canonical order (ISO timestamp for time-sorted buckets; capability path for specs). */
  key: string
  /** Tiebreak id when keys collide (change `name` for change/archive buckets; omit for specs). */
  id?: string
}

interface ListOptions {
  limit?: number
  page?: number
  /** Exclusive keyset cursor: continue after this position in canonical sort order. Mutually exclusive with `page`. */
  after?: ListCursor
}

interface ListMeta {
  total: number
  count: number
  limit: number
  page?: number
  after?: ListCursor
}

interface ListResult<T> {
  items: T[]
  meta: ListMeta
}
```

- `limit` defaults to **100** on **every** listable port (including changes/drafts/discarded/specs — a deliberate break from today's “return all” behaviour). Callers that need more must pass a higher `limit` or paginate.
- `page` (1-based) and `after` are mutually exclusive. Today's archive `startAt: string` is **replaced** by `after` (no ambiguous bare `startAt`).
- Pagination applies over the **canonical sort order** defined below (owned by the index helper; use cases/CLI MUST NOT re-sort).

#### Keyset cursor `after` (normative)

| Bucket         | `after.key`            | `after.id`               |
| -------------- | ---------------------- | ------------------------ |
| Active changes | `createdAt` ISO-8601   | change `name` (tiebreak) |
| Drafts         | `draftedAt` ISO-8601   | change `name`            |
| Discarded      | `discardedAt` ISO-8601 | change `name`            |
| Archive        | `archivedAt` ISO-8601  | change `name`            |
| Specs          | capability path        | omit                     |

Exclusive: return the next `limit` items **strictly after** that position in canonical order.

#### Canonical sort order (index helper)

| Bucket         | Sort key                                                                     | Direction               |
| -------------- | ---------------------------------------------------------------------------- | ----------------------- |
| Active changes | `createdAt` (aligned with timestamped `dirName`, but the key is `createdAt`) | oldest → newest         |
| Drafts         | `draftedAt`                                                                  | newest → oldest         |
| Discarded      | `discardedAt`                                                                | newest → oldest         |
| Archive        | `archivedAt`                                                                 | newest → oldest         |
| Specs          | capability path                                                              | lexicographic ascending |

Each concrete port **extends** `ListOptions` with fixed `include*` flags for **optional** entry fields. Required row fields always appear; optional fields appear only when the matching include flag is set. The catalog is normative:

| Port           | Flags                                                        | Projected optional field(s)             |
| -------------- | ------------------------------------------------------------ | --------------------------------------- |
| Active changes | `includeDescription`                                         | `description`                           |
| Drafts         | `includeDescription`, `includeReason`                        | `description`, `reason`                 |
| Discarded      | `includeDescription`, `includeReason`, `includeSupersededBy` | `description`, `reason`, `supersededBy` |
| Specs          | `includeSummary`, `includeMetadataStatus`                    | `summary`, `metadataStatus`             |
| Archive        | `includeArchivedBy`                                          | `archivedBy`                            |

Required vs optional fields are defined per list-entry type in the sections below (not by informal examples).

**FS index stores the full CLI-usable payload** for each entry (including optional fields). `include*` flags are **response projection only** — use cases and CLI MUST NOT perform extra `get` / file reads to satisfy a flag.

List methods return **list entries**, never full aggregates:

| Port surface   | List entry type                                                   |
| -------------- | ----------------------------------------------------------------- |
| Active changes | `ActiveChangeListEntry`                                           |
| Drafts         | `DraftedChangeListEntry`                                          |
| Discarded      | `DiscardedChangeListEntry`                                        |
| Specs          | `SpecListEntry` (port-level)                                      |
| Archive        | `ArchiveListEntry` (rename of today's `ArchivedChangeIndexEntry`) |

Three change entry types share a common base; drafts/discarded add extras (not a single discriminated union type).

**Detail stays on `get` / `getDraft` / `getDiscarded` / `status` / `artifact`:** history, artifact file maps, hashes, approvals, etc.

#### Change list entries (normative fields)

Shared required base (all three change list types):

- `name`, `createdAt`, `state`, `specIds`, `schemaName`, `schemaVersion`

| Type                       | Always (in addition to base) | Optional via include                                                                                     |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ActiveChangeListEntry`    | —                            | `includeDescription` → `description`                                                                     |
| `DraftedChangeListEntry`   | `draftedAt`, `draftedBy`     | `includeDescription` → `description`; `includeReason` → `reason`                                         |
| `DiscardedChangeListEntry` | `discardedAt`, `discardedBy` | `includeDescription` → `description`; `includeReason` → `reason`; `includeSupersededBy` → `supersededBy` |

`state` and draft/discard timestamp/actor/reason/superseded fields are **derived** from history when projecting an entry (they are not necessarily plain manifest snapshot fields).

#### Archive list entries

`ArchiveListEntry` replaces `ArchivedChangeIndexEntry` with these **normative** fields:

- **Always:** `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`
- **Optional via `includeArchivedBy`:** `archivedBy`
- **Not on the list entry:** `artifacts` (detail belongs on `get`); **`workspaces`** (legacy derived field — unused by CLI/use cases; callers that need workspace prefixes MUST derive them from `specIds`)

#### Spec list entries

`SpecListEntry` is a **port-level** contract with normative fields:

- **Always:**
  - `workspace` — workspace name bound to the repository instance
  - `path` — capability path with `/` separators
  - `title` — resolved when indexing: (1) non-empty trimmed `title` from spec metadata if present and valid; (2) else last segment of `path`
- **Optional via includes:**
  - `includeSummary` → `summary` resolved in this fixed order (first hit wins; omit field if none):
    1. non-empty trimmed `optimizedDescription` from spec metadata
    2. non-empty trimmed `description` from spec metadata
    3. extract from `spec.md` via existing core pure helper: (a) first non-empty paragraph after `# H1`; (b) first paragraph of first `## Overview` / `## Summary` / `## Purpose` section
  - `includeMetadataStatus` → `metadataStatus`: `'missing' | 'invalid' | 'stale' | 'fresh'` with today's semantics (`missing` / invalid schema / missing-or-mismatch hashes → `stale` / all hashes match → `fresh`). I/O errors while hashing for status → `stale`, not a thrown failure.

Errors while resolving title/summary/status for an individual spec MUST be swallowed; the entry still appears with title fallback. The FS index materializes the full CLI-usable payload; `ListSpecs` orchestrates across workspaces and forwards list options — it MUST NOT re-resolve summary/status with extra I/O when the repository already returned them.

#### Count

Every listable port exposes **`count()`**. The FS index helper also exposes `count()`, reading `totalCount` from meta (after freshness checks). `list()` fills `meta.total` from the same source. `GetProjectSummary` MUST use `count()` / `meta.total` — not materializing full lists.

#### Pagination in CLI

All list CLI commands (`changes`, `drafts`, `discarded`, `specs`, `archive`) gain the same flags (`--limit`, `--page`, `--after-key`, `--after-id`) and pass them through to use cases/ports. Default `limit` is **100**. `--page` is mutually exclusive with `--after-key` / `--after-id`.

When the result is truncated (`meta.count < meta.total`), **text** mode MUST still print the returned rows and then a trailing hint line of the form `showing <count> of <total> (use --limit/--page)` (wording may be normalized in CLI specs but MUST convey count, total, and pagination flags). JSON/toon modes expose `meta` and do not require that hint line.

#### Include flags in CLI (normative)

| Command          | Flags → port options                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `changes list`   | `--description` → `includeDescription`                                                                          |
| `drafts list`    | `--description` → `includeDescription`; `--reason` → `includeReason`                                            |
| `discarded list` | `--description` → `includeDescription`; `--reason` → `includeReason`; `--superseded-by` → `includeSupersededBy` |
| `specs list`     | existing `--summary` → `includeSummary`; `--metadata-status` → `includeMetadataStatus`                          |
| `archive list`   | `--archived-by` → `includeArchivedBy`                                                                           |

Default behaviour: CLI passes **no** include flags unless the user sets them. Optional entry fields / columns appear only when the corresponding flag is set (this changes today's drafts/discarded tables, which always showed reason — reason becomes opt-in via `--reason`).

#### Reindex

Listable ports expose `reindex` surfaces that force a full rebuild of the relevant `fs-cache` index via the helper:

- **`ChangeRepository`:** four methods —
  - `reindex()` — rebuilds active + drafts + discarded
  - `reindexActive()`
  - `reindexDrafts()`
  - `reindexDiscarded()`
- **`SpecRepository`:** `reindex()`
- **`ArchiveRepository`:** `reindex()` (rebuilds `fs-cache/archive/`; no longer writes a root-local archive index)

`specd storage reindex` is the normative CLI (new/updated CLI spec in this change). Behaviour:

- With **no resource flags**, rebuild **all** FS list indexes: `ChangeRepository.reindex()` (active+drafts+discarded), `SpecRepository.reindex()` for **every** configured workspace, and `ArchiveRepository.reindex()`.
- With flags (combinable):
  - `--changes` → `ChangeRepository.reindex()`
  - `--specs` → all workspace `SpecRepository.reindex()`
  - `--archive` → `ArchiveRepository.reindex()`
- The CLI MUST NOT know JSONL layout; it only invokes port `reindex*` methods.
- Per-bucket change methods (`reindexActive` / `reindexDrafts` / `reindexDiscarded`) remain available on the port for programmatic use; the CLI v1 uses the aggregate `reindex()` for `--changes`.

### 2. Port-level `invalidateCache()`

`Repository` gains:

```typescript
async invalidateCache(): Promise<void> {
  // default no-op
}
```

Semantics: **reset whatever this adapter caches** — not FS-specific, not list-only by name. Unknown future events (sync, checkout hooks, plugins) can call it without knowing the adapter.

FS adapters override it to mark their index helper(s) invalidated. Other adapters may no-op or clear different caches later.

### 3. FS index helpers own list/count caches

All FS repositories depend on dedicated index helper classes (infrastructure-only):

- **`FsChangeIndexCache`** — flat directories: `changes/`, `drafts/`, `discarded/`, `archive/` (one instance per bucket)
- **`FsSpecIndexCache`** — nested spec trees (one instance per workspace under `specs/<workspace>/`)

Each helper owns:

- the JSONL index of list entries (full CLI-usable payload)
- `totalCount` and freshness fields in meta
- canonical **sort** for that bucket
- `list` / `count` / `reindex` / `invalidate` / regeneration
- **per-bucket file lock** for writers via a **`mutate(fn)`-style API** on the helper (same idea as `ChangeRepository.mutate`): the **only** allowed write path. It acquires the bucket lock, runs `fn`, and releases the lock — including on failure. Concurrent mutators **wait** (they do not fail). Higher-level helper operations (`invalidate`, `reindex`, entry upsert, full rebuild) MUST go through this mutate primitive rather than writing files ad hoc.
- **Atomic publish:** inside `mutate`, any update to `.specd-index.jsonl` or `.specd-index-meta.json` MUST write a temp file and **`rename` atomically** over the live path so readers never observe a partial file. Normative publish rules:
  1. Meta-only update → temp+rename of `.specd-index-meta.json` only.
  2. JSONL-only update → temp+rename of `.specd-index.jsonl`, then meta update (at least `totalCount` / `generatedAt` as applicable) via temp+rename.
  3. Both files change → publish **jsonl first**, then **meta**.
  4. If `fn` fails mid-flight → do not leave a half-published pair; discard temps; release the lock.
- **Reads unlocked:** `list`/`count` do not take the lock; with atomic publish they always observe a complete prior or complete next snapshot.

Repositories MUST NOT read/write cache files directly. They delegate `list`, `count`, `reindex`, and invalidation to the helper(s).

Cache layout:

```text
{configPath}/tmp/fs-cache/
  archive/
  changes/
  drafts/
  discarded/
  specs/<workspace>/
```

Each directory contains:

- `.specd-index.jsonl` — one JSON object per line with normative wire shape:

```ts
{
  entry: /* public *ListEntry payload for this bucket */,
  // freshness (helper-only; never returned from list())
  sourceMtime?: string // ISO mtime of the primary source file (e.g. manifest.json for change buckets / archive)
  sourceFiles?: Array<{ filename: string, mtime: string }> // specs: per-file mtimes used for freshness
}
```

Change/archive buckets use `sourceMtime` (manifest). Spec buckets use `sourceFiles`. The helper sorts and paginates using `entry` fields according to canonical order; freshness fields are for rebuild/hit detection only.

- `.specd-index-meta.json` — normative shape:

```json
{
  "totalCount": 123,
  "generatedAt": "2026-07-16T10:30:00.000Z",
  "isInvalidated": false
}
```

No `vcsRef` (VCS is not part of cache freshness). TTL max-age uses `generatedAt`.

### 4. Archive migration

Archive abandons the index at the archive root. On first use, rebuild into `fs-cache/archive/` (**migrate and forget** — no dual-read compatibility). Update `core:storage` / archive port requirements that currently require root-local `index.jsonl` and archive-local gitignore entries for the old index files. Staging/gitignore rules for `.staging` remain archive-root concerns as applicable. Rename the public list model to `ArchiveListEntry`.

**Orphan cleanup (one-shot on rebuild/migration only):** when `reindex()` or the first full rebuild materializes `fs-cache/archive/`, delete legacy `.specd-index.jsonl` / `.specd-index-meta.json` from the archive root if present (ignore ENOENT). Optionally drop obsolete index-only lines from the archive-root `.gitignore` while keeping `.staging`. Normal `list`/`count` cache hits MUST NOT scan or delete root-local legacy files.

### 5. Freshness model (no VCS inside the cache)

Keep composition decoupled: **do not** inject `VcsAdapter` into FS repos for cache freshness.

On `list` / `count`:

1. If `isInvalidated` → mandatory rebuild (incremental stream rebuild).
2. Else compare disk presence/mtimes to the index → incremental rebuild when needed (covers manual moves/deletes).
3. Else if `now - generatedAt > TTL` → mandatory regenerate (**max-age** safety net — not “skip disk checks while young”). TTL is a **fixed FS-helper constant of 5 minutes** (`300_000` ms); not user-configurable in this change.
4. Else serve from index.

External/manual workflows that know the tree changed outside the repo MAY call `invalidateCache()`.

#### Write-path updates

- **`save(manifest)` (same bucket):** project the new list entry from the saved aggregate (including **history-derived** `state` / draft/discard extras). Compare to the cached entry projection. If equal → no index write. If different → **upsert** that row. Do not require a hand-maintained field allowlist.
- **create / delete:** update or remove the row (and `totalCount`) or invalidate the bucket.
- **Moves** between `changes` ↔ `drafts` ↔ `discarded`: update/invalidate **both** buckets.
- **Archive:** upsert/append archive index entry + invalidate/update source bucket.
- **`saveArtifact()` / skip / non-listing history:** do not require list-index updates (artifact mtimes are irrelevant to change list entries).
- **Specs:** create/delete/publish; content/metadata/lock changes that affect cached SpecListEntry fields refresh via upsert or invalidate according to helper rules.

Rebuild algorithm: single-pass disk scan of mtimes → stream old JSONL → copy hits / rewrite misses → append new → atomic rename; update meta (`totalCount`, `generatedAt`, clear `isInvalidated`).

### 6. `configPath/tmp` git hygiene

- **Runtime:** ensure `{configPath}/tmp/.gitignore` exists with normative contents:

```gitignore
*
!.gitignore
```

Meaning: ignore all tmp artifacts (`fs-cache/`, change-locks, etc.) while allowing the ignore rule file itself to remain un-ignored.

- **`specd init`:** create the same file for new projects (idempotent if already correct).

### 7. Scope (single change — must compile together)

Ports, FS adapters, storage rules, list use cases, project summary, CLI list commands (including pagination flags), init/gitignore, and test fakes ship together.

### 8. Testing

- Proposal/tasks call out updating stubs/fakes (`StubChangeRepository`, etc.) to the new contracts.
- **Verify scenarios are the minimum required tests**; implementation adds further unit/integration coverage and edge cases beyond verify.

### 9. Post-verify fixes (same change)

Locked from verification / compliance of the first implementing pass:

1. **`meta.after`:** when keyset pagination returns a page with more items remaining, `ListMeta.after` MUST be the cursor of the **last returned item**, not an echo of the request cursor. Omit `meta.after` when the page is exhausted. Cover with unit tests on `paginateList`.
2. **`archivePath`:** accept `ArchiveListEntry` / `ArchivedChange` without requiring a singular `workspaces` field on the path entry. Archive patterns MUST NOT expand `{{change.workspace}}`.
3. **Remove singular change workspace templates:** delete `{{change.workspace}}` from archive patterns, hook `run:` expansion, artifact/hook instruction templates, and related docs. Keep **plural** “workspaces touched by the change” derived from `specIds` (e.g. `Change.workspaces` getter as a derived set) for compile-context and similar — that is not a primary workspace.
4. **Composition factory text:** align `resolveGetProjectSummaryDeps` / `resolveListSpecsDeps` requirements with the count-capable / listWorkspaces-only deps actually used (stale List\* / hasher/yaml lists are spec drift).
5. **`cli:spec-list --workspace` JSON/toon:** align the spec to **filtered workspaces only** (current CLI behaviour) — do not require emitting empty stubs for every configured workspace.
6. **Documentation:** update CLI reference, config/schema guides, workflow/workspaces guides, ADR 0013 wording where it mandates `{{change.workspace}}`, and `docs/core/use-cases.md` stale list/summary shapes. Follow `default:_global/docs`.

## Specs affected

### New specs

- `core:change-list-entry` — shared base + `ActiveChangeListEntry` / `DraftedChangeListEntry` / `DiscardedChangeListEntry`
- `cli:storage-reindex` — `specd storage reindex` with combinable `--changes` / `--specs` / `--archive`

### Modified specs

- `core:archived-change-index-entry` — rename listing type to `ArchiveListEntry`; drop `artifacts` and legacy `workspaces` from list rows; `archivedBy` via include
- `core:repository-port` — `invalidateCache()`; shared `ListOptions` / `ListCursor` / `ListMeta` / `ListResult<T>`; `meta.after` = last returned cursor when more remain
- `core:change-repository-port` — `list*` → `ListResult<*ChangeListEntry>`; `count()`; `reindex()` / `reindexActive()` / `reindexDrafts()` / `reindexDiscarded()`; per-bucket include options; no full aggregates from list
- `core:spec-repository-port` — port-level `SpecListEntry`; `list` → `ListResult<SpecListEntry>` with include options; `count()`; `reindex()`
- `core:archive-repository-port` — `ArchiveListEntry`; index in fs-cache; `count()` alignment; `reindex()` rebuilds fs-cache; `archivePath` without singular workspace; no `{{change.workspace}}` in patterns
- `core:storage` — fs-cache layout; remove root-local archive index requirements; `configPath/tmp` gitignore; archive pattern variable set without `{{change.workspace}}`
- `core:fs-change-repository` / `core:fs-archive-repository` / `core:fs-spec-repository` — index helpers, delegation, freshness, mutate/lock; archive expand without workspace token
- `core:list-changes` / `core:list-drafts` / `core:list-discarded` / `core:list-archived` / `core:list-specs` — forward pagination/includes; no re-sort; list entries only; fix stale `resolveListSpecsDeps` shape
- `core:get-project-summary` — use `count()` / `meta.total`; fix stale `resolveGetProjectSummaryDeps` field list
- `core:config-writer-port` — `initProject` creates `{configPath}/tmp/.gitignore`
- `cli:change-list` / `cli:drafts-list` / `cli:discarded-list` / `cli:archive-list` / `cli:spec-list` — pagination + include flags; truncation hint; `cli:spec-list` filtered `--workspace` JSON; fix stale archive-list examples
- `cli:project-init` — documents tmp gitignore via `initProject`
- `core:template-variables` — remove `{{change.workspace}}` from the supported token set
- `core:run-step-hooks` / `core:get-hook-instructions` / `core:get-artifact-instruction` — stop expanding singular workspace; drop `[0] ?? 'default'` injection into template vars
- `core:change` — clarify `workspaces` as **derived from `specIds` only** (touched workspaces); not a primary workspace identity for templates
- `default:_global/docs` — require docs under `docs/` that mention `{{change.workspace}}` / stale list APIs to be updated in this change

## Impact

- **Performance:** list/count become index-backed; change listing no longer rehydrates full history per row.
- **API clarity:** list = table rows; get = full resource; uniform pagination and count.
- **Storage hygiene:** derived caches under `{configPath}/tmp/fs-cache/`, not inside data trees; `tmp` kept out of git.
- **Composition:** no VCS coupling for cache freshness.
- **Breaking (intentional):** archive patterns and hook/instruction templates that used `{{change.workspace}}` must switch to other tokens (`{{change.name}}`, `{{change.archivedName}}`, date vars, etc.). Config examples and guides update in-repo.
- **Overlap:** `core:change` is also targeted by active change `implementation-snapshot` (designing) — coordinate if both touch the same requirements.
- **Blast radius:** ports, FS, use cases, CLI list commands, template expansion, and docs in one change so the monorepo compiles.

## Technical context

Decisions locked in design review:

1. List entries only; detail on get/status.
2. Three change list entry types (base + extras); `ArchiveListEntry` rename; drop unused `workspaces` from archive list rows (derive from `specIds` if needed).
3. Shared `ListOptions`/`ListResult` on `repository-port`; per-port **normative** `include*` catalog (description/reason/supersededBy/summary/metadataStatus/archivedBy as listed above).
4. Index stores full CLI-usable payload; includes are projection-only (no extra I/O).
5. `count()` on every listable port and on the index helper (meta `totalCount`).
6. Same pagination options everywhere; default `limit` **100** for all; keyset via `after: { key, id? }` (replaces `startAt`); CLI flags `--limit` / `--page` / `--after-key` / `--after-id`.
7. Canonical sort owned by the index helper (active: `createdAt` asc; drafts/discarded/archive: `*At` desc; specs: path asc).
8. ChangeRepository: `reindex()` + `reindexActive()` / `reindexDrafts()` / `reindexDiscarded()`; specs/archive: `reindex()`.
9. FS helpers own index, count, sort, freshness, regeneration; writes only via helper `mutate(fn)` under per-bucket lock (waiters block) with **temp+atomic rename** publish; reads unlocked and snapshot-safe.
10. Archive: rebuild in fs-cache; abandon root index; orphan cleanup only on rebuild/migration.
11. `invalidateCache()` on `Repository` base (generic reset).
12. Freshness: invalidated flag + mtimes + fixed **5-minute** max-age TTL constant; no VCS in cache.
13. `save()` upserts when projected list entry changes (history-derived fields included).
14. `configPath/tmp` gitignore at runtime + init.
15. Verify = minimum tests; fakes updated in this change.
16. Full port/use-case/CLI scope in this change (register all affected specs before deltas).
17. **Singular vs plural workspaces:** plural “touched workspaces from `specIds`” stays; singular primary / `{{change.workspace}}` is removed everywhere (code + docs).
18. **`meta.after`:** last returned item when more remain; omitted when exhausted.
19. **`cli:spec-list --workspace` JSON:** filtered workspaces only (align spec to CLI).
20. Docs updates are in scope for this change (`default:_global/docs`).

## Open questions

None. Ready for revised spec deltas (including new scope) and design artifact.
