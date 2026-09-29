# Code graph specs

Audit of requirements added or modified by `windows-platform-compatibility` for:

- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`
- `code-graph:indexer`
- `code-graph:workspace-integration`

Source of requirements: `changes spec-preview … --artifact specs` deltas (added requirement bodies and the two modified `Spec Dependencies` sections). Verify scenarios from the matching `verify.md` deltas are used only as the test contract. Neither spec nor code is treated as automatically right.

## Requirements checked

### code-graph:sqlite-graph-store — Locked recreation preserves the index lease

1. When `recreate()` deletes the SQLite database or its WAL sidecars and deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it retries a bounded number of times and then surfaces the original error.
2. `recreate()` does not delete a live `index.lock`. A lock held by a running index survives recreation of the database files.

**Code.** `SQLiteGraphStore.recreate` (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`) deletes only `code-graph.sqlite`, `code-graph.sqlite-wal`, and `code-graph.sqlite-shm`, each through `retryLockedAsync`. It never names `index.lock`. `retryLockedAsync` (`packages/code-graph/src/infrastructure/storage-generation.ts`) attempts the operation five times, treats `EPERM`, `EBUSY`, and `EACCES` as lock errors, and rethrows the caught error after the fifth failure. The in-worker `SQLiteGraphDatabase.recreate` uses the synchronous `retryLocked` twin and the same three suffixes, also leaving `index.lock` untouched.

**Verdict.** Matches the spec for the stated files and codes. The bound is five attempts; the spec says “bounded,” and the verify scenario plus the WAL test fix that bound at five `EBUSY` failures. Preserving every `index.lock`, including a stale file, is stronger than “a live lock survives” and does not contradict it. The test stands in for a running holder by writing the lock file; the implementation does not inspect the holder, it simply does not delete that path.

### code-graph:isolated-index-worker — Index lease release on exit

3. The process that holds the index lease releases it on process exit.
4. On Windows that process also releases the lease on `SIGBREAK`.
5. Releasing the lease on `SIGTERM` remains required where that signal is delivered.
6. Failure to deliver `SIGTERM` does not leave the lease held after the process has exited.

**Code.** `createNodeIsolatedGraphIndexRunner` acquires the lease with `signalCleanup: 'exit-only'`, so `acquireGraphIndexLockLeaseByStoragePath` still registers an `exit` release and does not register its own `SIGINT`/`SIGTERM` handlers. The supervisor (`packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`) registers `exit` → `lease.release()`, `SIGBREAK` → `lease.release()` then forward, and `SIGINT`/`SIGTERM` → forward only. `finalize()` also calls `lease.release()` when the run settles, including after a forwarded signal causes the child to exit. `release()` deletes `graph/index.lock` only when the owner token still matches.

**Verdict.** Exit and `SIGBREAK` match the spec. `SIGTERM` still ends in a release if the child exits or the parent process exits; it is not released inside the `SIGTERM` callback the way `SIGBREAK` is. That still satisfies “where that signal is delivered” if delivery is followed by child exit or process exit. Swallowing `SIGTERM` (a listener prevents Node’s default termination) can keep the lease until one of those later events. The spec does not require the release to happen inside the `SIGTERM` handler, so this is not scored as a mismatch. The modified dependency line points the lease at `code-graph:sqlite-graph-store`; the lease file is `index-lock.ts`, and the sqlite spec only forbids deleting it during `recreate()`. The worker does release that file. The dependency sentence is descriptive, not a second behavioral rule.

### code-graph:indexer — Portable graph paths

7. Relative paths persisted by the indexer use `/`. That conversion does not collapse `.` or `..`.
8. A key matching `^[A-Za-z]:[/\\]` is not split into a workspace name and a path. The drive letter stays part of the path.
9. Every graph-identity split uses that rule, including language-adapter relative imports, scoped binding, and hotspot caller classification.
10. A PHP namespace separator is not a graph identity and stays local.

**Code.** `toPortableGraphPath` replaces `\` with `/` and does not normalize `.` or `..`. `splitWorkspaceIdentity('C:/repo/src/a.ts')` returns `null` because `isDriveLetterPath` matches first. Callers that then keep the original string leave the drive letter in the path. `discoverFiles` also rewrites `\` to `/` via `path.relative(...).replaceAll('\\', '/')`. `path.relative` itself canonicalizes `..` before that rewrite; the spec sentence attaches non-collapse to the separator conversion, which `toPortableGraphPath` honors. The verify example `src\..\secret` → `src/../secret` is the conversion function, and that function is what the indexer applies to config-relative paths after discovery.

Adapter relative imports (`typescript`, `python`, `php`, and Go’s slash branch) call `splitWorkspaceIdentity` and, on `null`, keep the original path, so `C:/repo/src/a.ts` does not become workspace `C`. Scoped binding’s `extractWorkspacePrefix` returns `undefined` instead of `C:`. Hotspot `extractWorkspace` returns `''` for a drive-letter path, and the workspace filter compares `splitWorkspaceIdentity(...)?.workspace`. PHP `\` is rewritten only inside Cake/class helpers (`replaceAll('\\', '/')` in `getCakeTargetCandidates` and `toPhpFileStem`), not by the graph-identity splitter.

**Verdict.** Clauses 7, 8, and the forward-slash cases of 9 match. Clause 10 matches the code and has no test (see Missing tests). Clause 9 fails for a Go file whose only slash is the drive slash (Discrepancy 1).

### code-graph:workspace-integration — Drive letters are not workspace names

11. Parsing a graph identity does not treat a Windows drive letter as `{workspaceName}`. A string matching `^[A-Za-z]:[/\\]` keeps the drive letter in the path.
12. The rule applies to exclusion, hotspot classification, SQLite workspace inclusion, and CLI graph display.
13. A workspace filter of `C` does not match a drive-letter path.

**Code.**

- Exclusion: `matchesExclude` returns `null` from its drive-letter check, so exclude-workspace `C` does not exclude `C:/repo/src/a.ts`.
- Hotspot classification: drive-letter paths classify as `''`, not `C`. The inclusion filter drops them when `workspace` is `C` because the split is `null`.
- SQLite inclusion: `searchSymbols` post-filters with `splitWorkspaceIdentity(row.file_path)?.workspace`. A stored path `C:/repo/src/a.ts` is not workspace `C` even if some other column differs. The drive-letter test inserts that path with `workspace: 'repo'` and expects `searchSymbols({ workspace: 'C' })` to be empty; that assertion fails if the path were split as workspace `C`, so it does exercise the path rule.
- CLI display: `toGraphDisplayPath` uses a second copy of the same split. A drive-letter path does not parse, and the canonical string is returned. `resolve-impact-file-selectors.spec.ts` expects `C:/repo/src/a.ts` unchanged.

**Verdict.** Matches for `C:/…` paths. The CLI splitter is a duplicate of the code-graph function; current behavior matches. `C:` with no slash or backslash after the colon is not a drive-letter path under the spec regex, and `splitWorkspaceIdentity('C:')` returns workspace `C` (this is how Discrepancy 1 becomes a workspace name).

### Modified spec-dependency sections

14. `code-graph:isolated-index-worker` dependency text now cites `code-graph:sqlite-graph-store` for the index lease and persistence layout.
15. `code-graph:indexer` dependency list now includes `code-graph:sqlite-graph-store` for persisted graph identity.

No behavioral contradiction with the added requirements. See clause 6 for the lease wording.

## Discrepancies

### 1. Go package surface `C:/a.go` is the workspace prefix `C:`

**Spec.** A key matching `^[A-Za-z]:[/\\]` must not be split into a workspace name and a path. The drive letter is part of the path. Every graph-identity split, including language-adapter surfaces, uses that rule. The added verify example is the nested path: `C:/repo/src/a.go` stays a path, and the workspace name is not `C`.

**Code.** `goPackageSurface` returns `filePath.slice(0, filePath.lastIndexOf('/'))` whenever a `/` exists, and only then falls through to `splitWorkspaceIdentity`.

- `C:/repo/src/a.go` → `C:/repo/src`. `splitWorkspaceIdentity` of that surface is `null`. This matches the verify scenario and the Go adapter test.
- `C:/a.go` → slice at the drive slash → `C:`. `isDriveLetterPath('C:')` is false because the regex requires `/` or `\` after the colon, so `splitWorkspaceIdentity('C:')` returns `{ workspace: 'C', relativePath: '' }`.

**Both readings.**

- Spec is right about the general rule, and the slash branch is wrong for a file in the drive root: the stored package surface is exactly the workspace prefix the change forbids. The nested example does not catch it.
- Code is right for the only path the verify scenario and the new test name (`C:/repo/src/a.go` → `C:/repo/src`, and not `C:`). The drive-root surface `C:` is the same shape the adapter already uses for a real workspace root (`workspace:first.go` → `workspace:`). The spec never says what the directory of `C:/a.go` should be.

## Missing tests

1. **`EPERM` and `EACCES` retries.** The sqlite requirement names three lock codes. `sqlite-graph-store.spec.ts` exhausts five `EBUSY` failures on the WAL and checks that the original `EBUSY` is surfaced and `index.lock` remains. Nothing fails `rm` with `EPERM` or `EACCES`.
2. **Process exit alone releases the lease.** Verify scenario: the worker holds the lease, the process exits, the lease is released. `supervisor.spec.ts` “releases the lease on SIGBREAK and process exit” emits `SIGBREAK` and then `exit` before it tries to acquire the lock again. `SIGBREAK` already calls `lease.release()`, so a broken `exit` listener would still pass.
3. **`SIGBREAK` alone releases the lease.** Same test. An `exit` listener that releases would hide a `SIGBREAK` handler that only forwards. The test also does not assert that the lock is gone before `exit` is emitted.
4. **`SIGTERM` still releases the lease.** `signals.spec.ts` forwards `SIGTERM` and checks the child kill and listener cleanup. It does not assert that `index.lock` can be acquired again. Other supervisor tests reacquire the lock after start failures that kill the child with `SIGTERM`; they do not emit `SIGTERM` on the parent.
5. **PHP namespace separator stays local.** No test passes a namespace such as `App\Models\User` through identity parsing or asserts that `\` is not a graph-identity separator. The drive-letter PHP test only checks `resolveRelativeImportPath('C:/repo/src/a.php', './b.php')`.
6. **Hotspot caller classification.** `compute-hotspots.spec.ts` asserts that `workspace: 'C'` returns no entries for `C:/repo/src/a.ts` and `C:/repo/src/b.ts`. That uses the filter’s `splitWorkspaceIdentity` check. `extractWorkspace`, which buckets same-workspace vs cross-workspace callers, is not asserted. A regression that classified those callers as workspace `C` would still pass.

Covered, and not counted above:

- `splitWorkspaceIdentity('C:/repo/src/a.ts')` is `null`; backslash form is covered for `isDriveLetterPath` only.
- SQLite `searchSymbols` with workspace `C` does not return `C:/repo/src/a.ts`.
- Scoped binding does not pass prefix `C:`.
- Go surface of `C:/repo/src/a.go` is `C:/repo/src`.
- TypeScript, Python, and PHP relative imports keep `C:/repo/src` in the resolved path.
- `toPortableGraphPath('src\\..\\secret')` is `src/../secret`.
- Five WAL `EBUSY` failures surface `EBUSY`; a written `index.lock` is still present after a failed recreate and after a successful recreate.
- CLI `toGraphDisplayPath` leaves `C:/repo/src/a.ts` unchanged.
- `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false.

## Summary

counts: requirements 15, discrepancies 1, missing tests 6
