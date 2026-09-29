# Partial audit: code-graph Windows requirements

Change: `windows-platform-compatibility`
Scope: requirements this change adds or modifies, from `changes spec-preview` for:

- `code-graph:indexer`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`

Historical requirements in those specs were not re-audited. Graph search and impact ran first (`splitWorkspaceIdentity`, `toPortableGraphPath`, `ParentSignal`, `retryLocked`, file impact of `split-workspace-identity.ts` and CLI `impact.ts`). The hardcoded resolution-manifest fingerprint list (GitHub issue 64) is out of scope. A local copy of the drive-letter split or of lock retry is not a violation: code-graph is not required to import `@specd/core` infrastructure for these rules.

## Summary

| Spec                               | Requirements checked           | Implementation | Discrepancies | Missing tests                                         |
| ---------------------------------- | ------------------------------ | -------------- | ------------- | ----------------------------------------------------- |
| `code-graph:indexer`               | 1 requirement, 6 clauses       | Met            | 0             | Scoped-binding drive letter; Go drive-letter identity |
| `code-graph:workspace-integration` | 1 requirement, 4 clauses       | Met            | 0             | SQLite inclusion filter `C` vs `C:/repo/src/a.ts`     |
| `code-graph:sqlite-graph-store`    | 1 requirement, 3 clauses       | Met            | 0             | Exhausted WAL `EBUSY` surfaces the original error     |
| `code-graph:isolated-index-worker` | 1 requirement, 3 clauses       | Met            | 0             | 0                                                     |
| **Total**                          | **4 requirements, 16 clauses** |                | **0**         | **4**                                                 |

---

### code-graph:indexer

#### Requirements checked

`Portable graph paths` (added spec and verify):

1. Relative paths persisted by the indexer use `/`.
2. That conversion does not collapse `.` or `..`.
3. A key matching `^[A-Za-z]:[/\\]` is not split into a workspace name and a path. `splitWorkspaceIdentity` returns null. The drive letter stays in the path.
4. Every graph-identity split uses that rule, including language-adapter relative imports (TypeScript, Python, PHP, Go), scoped binding, and hotspot caller classification.
5. A PHP namespace separator is not a graph identity and stays local.
6. Scenarios: `C:/repo/src/a.ts` is not workspace `C`; `src\..\secret` persists as `src/../secret`; an adapter split of `C:/repo/src/a.ts` does not yield workspace `C`.

The modified Spec Dependencies section only adds the SQLite store link. It does not change behavior.

#### Implementation status

Met.

`packages/code-graph/src/domain/services/split-workspace-identity.ts:1` defines `DRIVE_LETTER_PATH = /^[A-Za-z]:[/\\]/`. `splitWorkspaceIdentity` (`:19-26`) returns null for a drive-letter path, then null when the first `:` is missing or at index 0, otherwise `{ workspace, relativePath }`. `toPortableGraphPath` (`:34-36`) is `value.replaceAll('\\', '/')` and does not normalize `.` or `..`.

Indexer persistence:

- `discover-files.ts:202` stores `relative(root, fullPath).replaceAll('\\', '/')`. The same replacement is at `:112` for gitignore bases. `replaceAll` does not collapse `..`.
- `index-code-graph.ts:723-726` prefixes `ws.name` onto that relative path and runs `toPortableGraphPath` on the config-relative path. Root discovery does the same at `:763-768`.
- `path.relative` can resolve `..` between two absolute paths before the separator replacement. That is path resolution, not the separator conversion. The conversion itself keeps `src/../secret` (`split-workspace-identity.spec.ts:22-24`).

Identity consumers of the shared helper (graph impact of `code-graph:src/domain/services/split-workspace-identity.ts`, depth 1):

- Relative imports: `typescript-language-adapter.ts:1815-1817`, `python-language-adapter.ts:1143-1145`, `php-language-adapter.ts:2521-2523`. A null identity keeps `fromFile` as the relative path, so `C:/repo/src/a.ts` stays in the resolved path.
- Go has no `resolveRelativeImportPath`. Imports are marked `isRelative: false` (`go-language-adapter.ts:751`). The graph-identity split is `goPackageSurface` (`:149-154`): a `/` keeps the directory, including a `C:/...` prefix; otherwise it calls `splitWorkspaceIdentity` and does not treat `C` as the workspace. A forward-slash drive path therefore stays in the package surface.
- Scoped binding: `scoped-binding-environment.ts:378-380` `extractWorkspacePrefix` uses `splitWorkspaceIdentity` and returns undefined when the identity is null.
- Hotspot caller classification: `compute-hotspots.ts:19-21` returns `''` for a drive-letter path, then `splitWorkspaceIdentity`. Callers compare those names at `:145-146`. The workspace filter at `:223-225` compares `splitWorkspaceIdentity(...)?.workspace` to `options.workspace`, so filter `C` does not match `C:/repo/src/a.ts`.
- Indexer helpers: `index-code-graph.ts:99-110` `relativeIdentityPath` and `workspaceIdentityName`.

PHP namespace backslashes stay local. `php-language-adapter.ts` imports only `splitWorkspaceIdentity`, not `toPortableGraphPath`. `resolveQualifiedNameToPath` (`:2163`) uses `qualifiedName.replace(/\\/g, path.sep)` and `path.join`. Other `replaceAll('\\', '/')` sites (`:123`, `:204`, `:320`, `:523`, `:625`) convert namespace text to lookup segments inside the adapter. They are not graph-identity splits.

#### Discrepancies

None.

#### Test coverage

- `packages/code-graph/test/infrastructure/sqlite/split-workspace-identity.spec.ts:9-24` — drive letter is null; `src\..\secret` becomes `src/../secret`; parent segments survive a real workspace split.
- `typescript-language-adapter.spec.ts:859-861`, `python-language-adapter.spec.ts:574-576`, `php-language-adapter.spec.ts:1301-1303` — relative import of `C:/repo/src/...` keeps the drive letter.
- `compute-hotspots.spec.ts:480-491` — workspace filter `C` returns no entries for `C:/repo/src/a.ts`.

#### Missing tests

- Scoped binding: no test that `extractWorkspacePrefix('C:/repo/src/a.ts')` is undefined. The implementation calls the shared helper (`scoped-binding-environment.ts:379`), but nothing would fail if that call site split on the first colon again.
- Go: no test that `goPackageSurface('C:/repo/src/a.go')` keeps the drive letter and does not yield workspace `C`. TypeScript, Python, and PHP cover the relative-import scenario. Go's only identity split is untested.

---

### code-graph:workspace-integration

#### Requirements checked

`Drive letters are not workspace names` (added spec and verify):

1. Parsing a graph identity does not treat a Windows drive letter as a workspace name. `^[A-Za-z]:[/\\]` is a drive-letter path. The character before the first `:` does not become `{workspaceName}`.
2. The drive letter stays part of the path.
3. This applies to exclusion, hotspot classification, SQLite workspace inclusion, and CLI graph display.
4. A workspace filter of `C` does not match a drive-letter path. Scenarios: `C:/repo/src/a.ts` is not workspace `C`; hotspot classification or SQLite inclusion does not place that path in workspace `C`.

#### Implementation status

Met.

Shared parse: `split-workspace-identity.ts:19-26` (see indexer).

Exclusion: `matches-exclude.ts:16-22` repeats the same regex and returns null for a drive-letter path, so `excludeWorkspaces` containing `C` does not exclude `C:/repo/src/a.ts` (`:36-38`). The regex is local and equivalent; it is not a second, weaker rule.

Hotspot classification and filter: `compute-hotspots.ts:19-21` and `:223-225`.

SQLite inclusion: `sqlite-graph-database.ts:1476-1484` filters `searchSymbols` rows with `splitWorkspaceIdentity(row.file_path)?.workspace`. A drive-letter path yields `undefined`, which is not workspace `C`. `excludeWorkspaces` uses the same split. File and document search (`:1621`, `:1733`, `:1774-1784`) compare the stored `workspace` column, not a colon split of the path.

CLI display uses a local copy with the same regex and the same null-on-drive-letter behavior:

- `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts:57-81` `splitWorkspaceIdentity`
- `toGraphDisplayPath` (`:97-99`) returns the canonical path when the identity is null, so `C:/repo/src/a.ts` is displayed unchanged
- `impact.ts:16-17` and `:467`, `:574`, `:739`, `:865` call that copy
- `search.ts:9` and `:243-244`, `:258`
- `hotspots.ts:7` and `:180-181`, `:196`, `:215-216`

#### Discrepancies

None.

#### Test coverage

- `matches-exclude.spec.ts:52` — `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false.
- `compute-hotspots.spec.ts:480-491` — hotspot workspace filter `C` excludes the drive-letter path.
- `packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts:50-57` — `toGraphDisplayPath` of `C:/repo/src/a.ts` is `C:/repo/src/a.ts`. `impact.ts`, `search.ts`, and `hotspots.ts` display through that function.

#### Missing tests

SQLite inclusion: no test that `searchSymbols` (or the filter at `sqlite-graph-database.ts:1476-1478`) drops `C:/repo/src/a.ts` when `workspace` is `C`. The hotspot half of the verify scenario is tested. The SQLite half is not.

---

### code-graph:sqlite-graph-store

#### Requirements checked

`Locked recreation preserves the index lease` (added spec and verify), plus the recreate file set this change requires:

1. When `recreate()` deletes the SQLite database or its WAL sidecars and deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it retries a bounded number of times and then surfaces the original error.
2. `recreate()` deletes only `code-graph.sqlite`, `code-graph.sqlite-wal`, and `code-graph.sqlite-shm`. It does not delete `graph/index.lock`.
3. Scenarios: a WAL sidecar that keeps failing with `EBUSY` surfaces the original error after retries; a live `index.lock` is still present after database files are removed.

#### Implementation status

Met in both recreate implementations.

`packages/code-graph/src/infrastructure/storage-generation.ts:122-176`:

- `LOCK_CODES` is `EPERM`, `EBUSY`, `EACCES`.
- `retryLocked` and `retryLockedAsync` attempt the operation five times (attempts 0–4).
- A lock error on attempts 0–3 waits (`RETRY_DELAYS_MS` is 50, 100, 150, 200 ms) and retries.
- On attempt 4 (`attempt === RETRY_DELAYS_MS.length`) the caught error is rethrown unchanged.
- Any other code is rethrown immediately.

`SQLiteGraphStore.recreate()` (`sqlite-graph-store.ts:749-761`) rejects when the client is open, then `retryLockedAsync` + `rm(..., { force: true })` for suffixes `''`, `-wal`, and `-shm` on `graph/code-graph.sqlite`, then rotates the storage generation. It does not name `index.lock`.

`SQLiteGraphDatabase.recreate()` (`sqlite-graph-database.ts:354-368`) deletes the same three paths with synchronous `retryLocked` + `rmSync`. It does not name `index.lock`.

#### Discrepancies

None. The local retry helper is the code-graph copy of the lock-retry rule. It is not a missing import from `@specd/core`.

#### Test coverage

`packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:

- `:901-916` writes `graph/index.lock`, calls `store.recreate()`, and expects `code-graph.sqlite` gone, `storage.epoch` still present, and `index.lock` still present.
- `:919-932` mocks `fs/promises.rm` (`:5-16`) to throw `EBUSY` twice on the WAL path, then expects `recreate()` to succeed and the WAL file to be gone. That proves retry of `EBUSY`. It does not exhaust the five attempts.

#### Missing tests

"A locked WAL file surfaces the original error after retries" is untested. Nothing keeps failing with `EBUSY` (or `EPERM` / `EACCES`) through all five attempts and asserts the original error object and `code`. `SQLiteGraphDatabase.recreate()` is the same suffix list and has no direct lock test; the store test covers the public `recreate()`.

---

### code-graph:isolated-index-worker

#### Requirements checked

`Index lease release on exit` (added spec and verify), with the supervisor signal rule:

1. The process that holds the index lease releases it on process exit.
2. On Windows it also releases the lease on `SIGBREAK`. Releasing on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` does not leave the lease held after exit.
3. Supervisor `ParentSignal` includes `SIGBREAK`. `SIGBREAK` releases the lease and forwards the signal.
4. Scenarios: process exit releases the lease; `SIGBREAK` releases the lease on Windows.

The modified Spec Dependencies section points the worker at the SQLite index lease. It does not change behavior.

#### Implementation status

Met.

`packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts:32` — `type ParentSignal = 'SIGINT' | 'SIGTERM' | 'SIGBREAK'`.

`forwardSignal` (`:252-262`) records the signal and `child.kill(signal)`. `onSigbreak` (`:265-268`) calls `lease.release()` and then `forwardSignal('SIGBREAK')`. `onProcessExit` (`:269-271`) calls `lease.release()`. Both listeners are installed at `:284-285` and removed in `finalize` (`:137-140`) before `lease.release()` at `:147`. `release` on the lease is idempotent (`index-lock.ts:107-109`).

Production construction uses `signalCleanup: 'exit-only'` (`supervisor.ts:347-348`), so the lease object itself listens for `exit` and not for `SIGINT`/`SIGTERM` (`index-lock.ts:128-131`). The supervisor owns `SIGBREAK`. The lease's own `exit` listener (`index-lock.ts:118`, `:128`) also releases if the process exits.

`SIGTERM` is still forwarded by `onSigterm` (`:264`). Exit cleanup does not depend on `SIGTERM` being delivered.

#### Discrepancies

None.

#### Test coverage

`packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts:292-307` emits `SIGBREAK` and `exit`, expects `child.kill` with `SIGBREAK`, expects `GraphIndexWorkerSignalError` after the child exits with `SIGBREAK`, expects both listeners removed, and expects a later `acquireLock` on the same root to succeed.

`signals.spec.ts:20-53` still forwards `SIGINT` and `SIGTERM` once and leaves pre-existing listeners in place.

The exit scenario is not isolated: the `SIGBREAK` test emits `exit` in the same run. A no-op `onProcessExit` would still pass because `onSigbreak` already released the lease. Both handlers are present and the combined run does release the lease. That is partial coverage of the exit scenario, not a missing behavior.

#### Missing tests

None that leave a required behavior with no forcing assertion, beyond the combined exit/`SIGBREAK` run noted above.

---

## Counts

- Requirements checked: 4 (16 clauses)
- Discrepancies: 0
- Missing tests: 4
- Discrepancy titles: none

Missing-test titles:

1. Exhausted WAL `EBUSY` surfaces the original error after retries.
2. SQLite symbol inclusion filter `C` does not include `C:/repo/src/a.ts`.
3. Scoped binding does not treat a drive letter as a workspace.
4. Go `goPackageSurface` keeps a drive letter and does not yield workspace `C`.
