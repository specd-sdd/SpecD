# Spec Compliance Audit: archived-change-read-only

**Mode:** Change (`--change archived-change-read-only`)  
**Date:** 2026-05-26  
**State:** verifying  
**Graph:** indexed (776 files, 3416 symbols)

## Executive Summary

| Metric               | Count |
| -------------------- | ----: |
| Specs in scope       |     6 |
| Requirements checked |   ~42 |
| Implemented          |    40 |
| Partial              |     1 |
| Missing              |     0 |
| Spec/verify drift    |     3 |
| Test gaps (minor)    |     2 |

**Verdict:** Implementation matches merged **spec.md** requirements. Primary gaps are **stale `verify.md` scenarios** (no-op verify deltas) and **minor test coverage** for `archivePath(indexEntry)` and `workspacesFromSpecIds` in isolation.

---

## Scope

### Change specs

- `core:archived-change-index-entry` (new)
- `core:archive-repository-port` (delta)
- `core:list-archived` (delta)
- `core:get-archived-change` (delta)
- `cli:archive-list` (delta)
- `cli:archive-show` (delta)

### Dependency specs (consistency spot-check)

- `core:read-only-change-view` — facade pattern for `ArchivedChange` ✓
- `core:change` — `ActorIdentity`, lifecycle state on read model ✓
- `core:storage` — `index.jsonl`, append-only semantics ✓
- `cli:entrypoint` — exit codes, format flags ✓

---

## Detailed Findings by Spec

### core:archived-change-index-entry

**Implementation status:** Implemented

| Requirement           | Status | Evidence                                                  |
| --------------------- | ------ | --------------------------------------------------------- |
| Index entry fields    | ✓      | `packages/core/src/domain/archived-change-index-entry.ts` |
| No manifest-only data | ✓      | Interface has no history/artifact maps                    |
| Derived workspaces    | ✓      | `workspacesFromSpecIds()`                                 |

**Test coverage:** Partial

- Covered indirectly via `FsArchiveRepository.list()` and `list-archived.spec.ts`
- **Gap:** No unit test for `workspacesFromSpecIds` edge cases (empty specIds, no colon)

**Discrepancies:** None between spec.md and code.

---

### core:archive-repository-port

**Implementation status:** Implemented

| Requirement                                   | Status | Evidence                                                    |
| --------------------------------------------- | ------ | ----------------------------------------------------------- |
| `list()` → `ArchivedChangeIndexEntry[]`       | ✓      | `FsArchiveRepository.list()`, enriched index lines          |
| `get()` → manifest-backed `ArchivedChange`    | ✓      | `_loadArchivedDetailFromManifest`, `loadChangeFromManifest` |
| `archivePath(ArchivePathEntry)`               | ✓      | Port + `archivePath(entry)` accepts index shape             |
| `archive()` returns `ArchivedChange`          | ✓      | `toArchivedChangeView(change, meta)` after commit           |
| Legacy index fallback (manifest read on list) | ✓      | `_indexEntryToRow` when `createdAt` missing                 |
| Staged commit, gitignore, reindex             | ✓      | Existing tests unchanged, still pass                        |

**Test coverage:** Good

- `packages/core/test/infrastructure/fs/archive-repository.spec.ts` — list/get/archive/archivePath

**Gap (minor):** No explicit test passing a bare `ArchivedChangeIndexEntry` to `archivePath()` (only full `ArchivedChange` from `archive()` today). Type contract is satisfied; behavioral test would strengthen compliance.

**Discrepancies:** None on spec.md. **verify.md** has added scenarios in delta for index list — merged verify should be correct for archive-repository-port (delta was not no-op).

---

### core:list-archived

**Implementation status:** Implemented

| Requirement                          | Status | Evidence                             |
| ------------------------------------ | ------ | ------------------------------------ |
| Returns `ArchivedChangeIndexEntry[]` | ✓      | `list-archived.ts`                   |
| Delegation, no transform             | ✓      | Direct `return this._archive.list()` |
| No side effects                      | ✓      | Read-only                            |

**Test coverage:** Good — `list-archived.spec.ts` uses index entries.

**Spec/verify drift (MEDIUM):**

- **verify.md** (workspace, no delta applied) still describes output as `ArchivedChange` instances in some scenarios.
- **spec.md** (merged delta) correctly requires `ArchivedChangeIndexEntry[]`.
- **Assessment:** Implementation follows spec.md; verify.md needs update via `/specd-design`.

---

### core:get-archived-change

**Implementation status:** Implemented

| Requirement                                 | Status | Evidence                 |
| ------------------------------------------- | ------ | ------------------------ |
| Returns manifest-backed `ArchivedChange`    | ✓      | Delegates to `get()`     |
| Extends `ReadOnlyChangeView` + archive meta | ✓      | `toArchivedChangeView`   |
| `ChangeNotFoundError`                       | ✓      | `get-archived-change.ts` |
| No side effects (use case)                  | ✓      | No writes in use case    |

**Test coverage:** Good — `get-archived-change.spec.ts`, FS integration.

**Discrepancies:** None.

---

### cli:archive-list

**Implementation status:** Implemented

| Requirement                             | Status | Evidence                            |
| --------------------------------------- | ------ | ----------------------------------- |
| Index-backed JSON (no manifest per row) | ✓      | Uses `listArchived` → index entries |
| Sort desc by `archivedAt`               | ✓      | CLI sort after fetch                |
| JSON schema fields                      | ✓      | `list.ts` mapping                   |
| Empty archive                           | ✓      | Tests                               |

**Partial:** Text table columns

- Merged spec text header example says `NAME  DATE`; implementation shows `NAME`, `WORKSPACE`, `DATE`, `BY`.
- **Assessment:** Superset of spec (improvement); not a regression. Optional spec.md clarification in design follow-up.

**Test coverage:** Good — `archive-list.spec.ts`, `list-commands.spec.ts`.

---

### cli:archive-show

**Implementation status:** Implemented

| Requirement                                          | Status | Evidence                                      |
| ---------------------------------------------------- | ------ | --------------------------------------------- |
| Manifest-derived `state`                             | ✓      | `archived.state` from read model              |
| Text/JSON fields (archivedAt, archivedBy, artifacts) | ✓      | `show.ts`                                     |
| Not hardcoded `archivable`                           | ✓      | E2E: `drafted-change-read-only` → `archiving` |

**Spec/verify drift (MEDIUM):**

- **verify.md** still asserts `state: archivable` / `"archivable"` (no-op verify delta).
- **spec.md** delta explicitly forbids hardcoding.
- **Assessment:** Code correct; verify.md stale.

**Test coverage:** Good — `archive-show.spec.ts` updated for new fields; some `list-commands` mocks still use `archivable` as example state (valid for mocks).

---

## Cross-Cutting Consistency

| Check                                                   | Result                                                   |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `ArchivedChange` is interface/facade, not summary class | ✓ Aligns with `core:read-only-change-view`               |
| No `Change` escape hatch on archived view               | ✓ Facade only                                            |
| `archive()` O(1) index append                           | ✓ Index append unchanged; detail from in-memory `Change` |
| Global architecture (ports, DI)                         | ✓ No violations found                                    |
| ESLint / typecheck / tests                              | ✓ Post-implementing hooks green                          |

---

## Recommendations

### Before archive (optional, non-blocking)

1. **Update verify deltas** for `cli:archive-show`, `core:list-archived` (replace no-op placeholders with scenario edits matching spec deltas).
2. **Add test:** `archivePath` with minimal `ArchivedChangeIndexEntry` object.
3. **Add test:** `workspacesFromSpecIds` unit cases.

### Proceed without design?

Yes — implementation matches authoritative **spec.md** content. Verify drift is documentation debt, not a functional defect.

---

## Audit Traceability

- Implementation files tracked via `specd changes implementation list archived-change-read-only`
- Tests: `@specd/core` 1957 passed, `@specd/cli` 714 passed (verification run)
