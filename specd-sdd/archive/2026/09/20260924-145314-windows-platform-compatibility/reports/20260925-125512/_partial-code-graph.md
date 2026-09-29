# Partial audit: code-graph Windows requirements

Change: `windows-platform-compatibility`
Scope: Windows deltas only, from `changes spec-preview` for:

- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`
- `code-graph:indexer`
- `code-graph:workspace-integration`

Historical requirements in those specs were not re-audited. Graph search/impact ran first. `graph search` reported `CONTENT_KNOWN_STALE`. Impact on `toPortableGraphPath` returned only its definition, so call sites were confirmed by reading the files the graph had already located.

The local CLI copy of the drive-letter split in `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts` matches `splitWorkspaceIdentity` (drive letter returns null, otherwise first colon, `index <= 0` returns null). That duplication is not a violation.

---

### code-graph:sqlite-graph-store

#### Requirements

`Locked recreation preserves the index lease` (spec.md and verify.md from this change):

- When `recreate()` deletes the SQLite database or a WAL sidecar and deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it retries a bounded number of times and then surfaces the original error.
- `recreate()` must not delete a live `index.lock`. A lock held by a running index survives database recreation.
- Scenario: a locked WAL file that keeps failing with `EBUSY` surfaces the original error after retries.
- Scenario: a live `index.lock` is still present after `recreate()` removes the database files.

Design/task detail used only to interpret "bounded": five attempts, delays 50/100/150/200 ms, same codes as `retryOnLock`. `@specd/core` does not export that helper, so a local copy is intended.

#### Implementation status

Compliant in both recreate implementations.

`packages/code-graph/src/infrastructure/storage-generation.ts` `retryLocked` and `retryLockedAsync`:

- `LOCK_CODES` is `EPERM`, `EBUSY`, `EACCES`.
- Loop runs attempts 0 through 4 (five tries).
- On a lock error at attempts 0–3 it waits `RETRY_DELAYS_MS[attempt]` (50, 100, 150, 200 ms) and retries.
- On attempt 4 (`attempt === RETRY_DELAYS_MS.length`) it rethrows the caught error unchanged.
- Any other error is rethrown immediately.
- Sync wait uses `Atomics.wait`; async wait uses `setTimeout`.

`SQLiteGraphStore.recreate()` (`sqlite-graph-store.ts` 749–761) rejects when the client is open, then `retryLockedAsync` + `rm(..., { force: true })` for `code-graph.sqlite`, `-wal`, and `-shm` only, then rotates the storage generation.

`SQLiteGraphDatabase.recreate()` (`sqlite-graph-database.ts` 354–368) does the same trio with synchronous `retryLocked` + `rmSync`. Neither path names `graph/index.lock`.

#### Discrepancies

None in the recreation behavior against this requirement. The local retry copy is the design, not drift.

Either reading of the retry budget matches: five attempts, then the original lock error, not a wrapped error.

#### Test coverage

`packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` (`creates sqlite schema artifacts under graph/ and recreates backend state destructively`) writes `graph/index.lock` with contents `lease\n`, calls `store.recreate()`, and expects:

- `code-graph.sqlite` absent
- `storage.epoch` still present
- `index.lock` still present

That covers "A live index lock is not deleted" for `SQLiteGraphStore.recreate()`. `sqlite-worker-lifecycle.spec.ts` checks closed recreate removes data and does not leave the reopened store holding the old file. It does not assert `index.lock`.

#### Missing tests

"A locked WAL file surfaces the original error after retries" has no test that forces `EBUSY` (or `EPERM` / `EACCES`). A search of `packages/code-graph/**/*.spec.ts` finds no `EBUSY` and no `retryLocked` assertion. The only `EACCES` hit is an unrelated health-check stub in `get-graph-health.spec.ts`.

Also untested:

- `SQLiteGraphDatabase.recreate()` lock preservation (same suffix list, no direct test).
- Immediate throw for a non-lock code such as `ENOENT` from a non-force failure.
- That the surfaced error is the same object/code after five failures, not a new error.

---

### code-graph:isolated-index-worker

#### Requirements

`Index lease release on exit`:

- The process that holds the index lease must release it on process exit.
- On Windows it must also release the lease on `SIGBREAK`.
- Releasing on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` must not leave the lease held after exit.
- Scenario: process exit releases the lease.
- Scenario: `SIGBREAK` on Windows releases the lease.

`Signal forwarding and cleanup` still requires `SIGINT` and `SIGTERM` forwarding and does not mention `SIGBREAK`. The change design also forwards `SIGBREAK` to the child. That extra forward is consistent with the design and is not forbidden by the signal-forwarding requirement.

#### Implementation status

Compliant.

`supervisor.ts`:

- `ParentSignal` is `'SIGINT' | 'SIGTERM' | 'SIGBREAK'`.
- Listeners are installed for `SIGINT`, `SIGTERM`, `SIGBREAK`, and `exit`.
- `finalize()` removes those four listeners and calls `lease.release()` once per finalize.
- `onProcessExit` calls `lease.release()`.
- `onSigbreak` calls `lease.release()` and then `forwardSignal('SIGBREAK')`, which `child.kill`s `SIGBREAK`.
- `SIGINT` / `SIGTERM` only forward; release still happens in `finalize()` after the child settles.

`acquireGraphIndexLockLeaseByStoragePath` `release()` is idempotent (`released` flag) and deletes the lock file only when the owner token still matches. A second release from `exit` or `finalize()` after `SIGBREAK` does not throw or delete another process's lock.

`createNodeIsolatedGraphIndexRunner` acquires the lease with `signalCleanup: 'exit-only'`, so the lease helper itself does not install `SIGINT`/`SIGTERM` process-exit killers. The supervisor owns those signals. The lease helper still registers the real `process` `exit` listener, which also releases.

#### Discrepancies

None against the requirement text. `SIGBREAK` is handled on every platform, not only `win32`. The requirement says Windows must release on `SIGBREAK`; it does not forbid the same handler elsewhere.

`SIGBREAK` drops the lease before the child has exited, then forwards the signal. The scenario only requires release when `SIGBREAK` is received. The earlier release is what the requirement asks for. `SIGINT`/`SIGTERM` still wait for child termination before `finalize()` releases.

#### Test coverage

`packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts` `releases the lease on SIGBREAK and process exit`:

- Starts a run with the real `acquireGraphIndexLockLeaseByStoragePath` (`exit-only`) and a fake child.
- Emits `SIGBREAK` on the injected process emitter. That runs `onSigbreak` synchronously, which calls `lease.release()` before the following `exit` emit.
- Asserts `child.kill` was called with `SIGBREAK`.
- Emits child `exit` with signal `SIGBREAK` and expects `GraphIndexWorkerSignalError`.
- Asserts `SIGBREAK` and `exit` listener counts are 0.
- Asserts a second `acquireLock` does not throw, which means the lock file was removed.

So "SIGBREAK releases the lease" is implemented and the test does force the `SIGBREAK` handler to release. It is not a Windows-platform-gated test; the handler is unconditional, so the fake emitter is enough.

#### Missing tests

No separate test emits only `exit` or only `SIGBREAK`. Both scenarios are one test. Because `release()` is idempotent and `SIGBREAK` is emitted first, the passing assertion does not by itself show which handler deleted the file. The source order makes `SIGBREAK` the one that deletes it.

No test checks that a `SIGBREAK` release is a no-op when the lock token no longer matches, or that `SIGTERM` still releases only after child termination when `SIGBREAK` was not used.

---

### code-graph:indexer

#### Requirements

`Portable graph paths`:

- Relative paths persisted by the indexer must use `/`. That conversion must not collapse `.` or `..`.
- A key matching `^[A-Za-z]:[/\\]` must not be split into a workspace name and a path. The drive letter stays in the path.
- Scenario: `C:/repo/src/a.ts` does not yield workspace `C`.
- Scenario: persisted `src\..\secret` is stored as `src/../secret`.

#### Implementation status

The designated helpers comply. Not every indexer identity split uses them.

`split-workspace-identity.ts`:

- `isDriveLetterPath` is `/^[A-Za-z]:[/\\]/`.
- `splitWorkspaceIdentity` returns null for a drive letter, otherwise splits on the first colon, and returns null when the colon is missing or at index 0.
- `toPortableGraphPath` is `value.replaceAll('\\', '/')` only. It does not call `path.normalize` or `path.posix.normalize`.

`index-code-graph.ts` uses those helpers:

- `relativeIdentityPath` / `workspaceIdentityName` go through `splitWorkspaceIdentity`. A drive-letter key stays intact (`relativePath` falls back to the original string; workspace falls back to `''`, which is not `C`).
- Config-relative paths and the code-root containment check pass through `toPortableGraphPath`.
- Workspace file identities are `` `${ws.name}:${relPath}` ``. `discoverFiles` already replaces `\` with `/` via `relative(...).replaceAll('\\', '/')`. `createFileNode` normalizes with the same slash replace and does not collapse `.` or `..`.

`path.relative` (used inside `discoverFiles` and before some `toPortableGraphPath` calls) resolves real absolute paths, so a file that is physically `secret` is not stored as `src/../secret`. That is path resolution from two absolute paths, not the separator conversion. The separator conversion itself does not collapse dot segments.

#### Discrepancies

Primary indexer identity helpers match both scenarios. These extraction/lookup splits still take the first colon and will treat a drive letter as a workspace when given a key such as `C:/repo/src/a.ts`:

| Location                                                     | Behavior on `C:/repo/src/a.ts`                                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scoped-binding-environment.ts` `extractWorkspacePrefix`     | Prefix `C:` for symbol lookup                                                                                                                                         |
| `typescript-language-adapter.ts` `resolveRelativeImportPath` | Workspace prefix `C:`, relative path `/repo/src/a.ts`                                                                                                                 |
| `python-language-adapter.ts` `resolveRelativeImportPath`     | Same first-colon split                                                                                                                                                |
| `php-language-adapter.ts` `splitWorkspacePath`               | Colon index `> 0` and path does not start with `/`, so prefix `C:` and path `/repo/src/a.ts`                                                                          |
| `go-language-adapter.ts` `goPackageSurface`                  | If the path has no `/`, the first colon becomes the package surface prefix. `C:/...` has a slash, so this one returns the directory and does not use the drive letter |

The change task says indexer persistence and workspace-integration parsing should call `splitWorkspaceIdentity`. Those named paths do. The requirement text is broader: any key that begins with a drive letter must not be split into a workspace and a path. The adapter and binding-environment splits still do that.

Two readings:

- Spec drift relative to the task list: only the named persistence/identity helpers were in scope, and those comply.
- Implementation gap relative to the requirement sentence: indexing still splits drive-letter keys inside extraction and scoped binding.

#### Test coverage

`packages/code-graph/test/infrastructure/sqlite/split-workspace-identity.spec.ts`:

- `C:/repo/src/a.ts` is a drive letter and `splitWorkspaceIdentity` returns null.
- `c:\repo\src\a.ts` is a drive letter (predicate only; split null is not repeated for the backslash form).
- `core:src/../secret` keeps `..` in `relativePath`.
- `toPortableGraphPath('src\\..\\secret')` is `src/../secret`.
- `src/a.ts` (no colon) returns null.

That is direct coverage of both indexer scenarios at the helper. No `IndexCodeGraph` test persists `src\..\secret` or feeds `C:/repo/src/a.ts` through discovery.

#### Missing tests

- Indexer persistence of a backslash path that contains `..`, through `IndexCodeGraph` or `createFileNode`, not only `toPortableGraphPath`.
- `splitWorkspaceIdentity('c:\\repo\\src\\a.ts')` is null (regex is shared with the predicate, so this is a small gap).
- Drive-letter keys through `extractWorkspacePrefix` and the TypeScript/Python/PHP relative-import splits.
- A workspace-prefixed path whose relative segment contains a colon is only split on the first colon. The spec does not require otherwise.

---

### code-graph:workspace-integration

#### Requirements

`Drive letters are not workspace names`:

- Parsing a graph identity must not treat a Windows drive letter as a workspace name.
- A string matching `^[A-Za-z]:[/\\]` is a drive-letter path.
- The character before the first `:` must not become `{workspaceName}`.
- Scenario: `C:/repo/src/a.ts` does not use workspace `C`, and the drive letter stays part of the path.

`matches-exclude` `extractWorkspace` was checked against the stated rule: a drive letter returns null; a path with no colon returns the whole path.

#### Implementation status

`splitWorkspaceIdentity` matches the scenario: null for `C:/...` and `C:\...`, so callers that use `?.workspace` do not assign `C`. The drive-letter string remains the path when the caller falls back to the original value (`relativeIdentityPath`).

`matches-exclude.ts` `extractWorkspace`:

- `/^[A-Za-z]:[/\\]/` returns null.
- No colon returns the whole path (`idx === -1`).
- A leading colon (`idx === 0`) returns null.
- Otherwise the prefix before the first colon is the workspace.
- `matchesExclude` only treats that result as a workspace exclusion when it is non-null, so `C:/repo/src/a.ts` is not excluded as workspace `C`.

`resolve-impact-file-selectors.ts` local `splitWorkspaceIdentity` has the same drive-letter null and first-colon behavior. `toGraphDisplayPath` returns the original canonical path when the identity is null, so `C:/repo/src/a.ts` is not displayed as workspace `C`.

#### Discrepancies

The helper and `matches-exclude` match the requirement. Other workspace-prefix parsers do not:

- `compute-hotspots.ts` `extractWorkspace` is `indexOf(':')` with no drive-letter guard. On `C:/repo/src/a.ts` the workspace is `C`. Callers at lines 144–145 use that to classify same-workspace versus cross-workspace callers. Two drive-letter files compare equal as workspace `C` even when they are not the same workspace. A drive-letter file versus `core:...` is counted as cross-workspace.
- `sqlite-graph-database.ts` around line 1476: an inclusion filter uses `row.file_path.startsWith(options.workspace + ':')`. Workspace `C` matches `C:/repo/src/a.ts`. The exclude path just below uses `splitWorkspaceIdentity` and does not. Inclusion and exclusion disagree for the same drive-letter key.
- CLI display splits in `impact.ts`, `search.ts`, and `hotspots.ts` still take the first colon. They are outside the code-graph helpers. A drive-letter `filePath` would be labeled workspace `C` in those commands. The impact-file selector copy is the one that was updated and is not a violation.

`matches-exclude` returning the whole path when there is no colon is the requested behavior. `compute-hotspots` has a separate `extractWorkspace` with the same no-colon fallback but without the drive-letter null. That second function is the discrepancy.

#### Test coverage

`matches-exclude.spec.ts` covers the no-colon rule: `matchesExclude('standalone', undefined, ['standalone'])` is true, and a different name is false. It does not cover a drive letter.

`split-workspace-identity.spec.ts` covers the scenario `C:/repo/src/a.ts` → not a workspace. No CLI test covers the local selector copy. No hotspot test feeds a `C:/` symbol path.

#### Missing tests

- `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false, and `matchesExclude('C:\\repo\\src\\a.ts', undefined, ['C'])` is false.
- `computeHotspots` does not count `C` as the workspace of a drive-letter `filePath`.
- SQLite symbol search with `workspace: 'C'` does not return `C:/repo/...` rows.
- CLI `toGraphDisplayPath` leaves `C:/repo/src/a.ts` unchanged. Behavior matches; there is no test.

---

## Summary counts

Windows requirement headings audited: 4
Behavioral clauses: 8

| Spec                               | Clauses                                                       | Implementation                                                                                               | Discrepancies                                                   | Scenario tests                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:sqlite-graph-store`    | 2                                                             | Both met (`retryLocked` / `retryLockedAsync` and both `recreate()` methods)                                  | 0                                                               | Live `index.lock` covered. Locked WAL `EBUSY` not covered                                                                        |
| `code-graph:isolated-index-worker` | 3 (exit, `SIGBREAK`, `SIGTERM` still released when delivered) | Met. `SIGBREAK` releases and forwards. `exit` releases. Release is idempotent                                | 0                                                               | `SIGBREAK` and exit covered in one test. `SIGBREAK` handler does release                                                         |
| `code-graph:indexer`               | 2                                                             | Helpers met. Adapter and scoped-binding splits still take the first colon                                    | 1 residual split set                                            | Both scenarios covered on `splitWorkspaceIdentity` / `toPortableGraphPath` only                                                  |
| `code-graph:workspace-integration` | 1                                                             | `splitWorkspaceIdentity` and `matches-exclude` met. Hotspot extract and SQLite workspace `startsWith` do not | 1 residual split set (same drive-letter hole, extra call sites) | Drive-letter scenario covered on the helper. `matches-exclude` drive letter not covered. No-colon whole-path behavior is covered |

Totals:

- Requirements (headings): 4
- Clauses checked: 8
- Clauses whose named implementation matches: 8
- Discrepancy groups: 2 (indexer extraction/binding first-colon splits; workspace hotspot extract plus SQLite inclusion `startsWith`). CLI selector duplication is not one of them.
- Spec scenarios: 7
- Scenarios with a test that exercises the behavior: 6
- Scenarios with no forcing test: 1 — "A locked WAL file surfaces the original error after retries" (no `EBUSY` injection)
- "A live index lock is not deleted": tested on `SQLiteGraphStore.recreate()`
- "SIGBREAK releases the lease": tested; the test also emits `exit`, and `SIGBREAK` runs first and calls `lease.release()`
