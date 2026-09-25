# Spec compliance partial — code-graph (windows-platform-compatibility)

Read-only audit of requirements **added or modified** by change `windows-platform-compatibility`. Scope is the merged `specs` artifact (`changes spec-preview --artifact specs --diff`) plus the paired `verify` scenarios. Unchanged requirements were not re-audited. Markdown underscore escapes in the diff renderer (`COVERS\_SYMBOL`, `node\_modules`) are display artifacts, not requirement edits.

Graph navigation used `graph search` / `graph impact` before file reads. The index reported `CONTENT_KNOWN_STALE`; symbol locations were confirmed by reading the current source.

## code-graph:sqlite-graph-store

### Requirements Summary

**Added: Locked recreation preserves the index lease**

> When `recreate()` deletes the SQLite database or its WAL sidecars and the deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it MUST retry a bounded number of times and then MUST surface the original error.
>
> `recreate()` MUST NOT delete a live `index.lock`. A lock that is held by a running index MUST survive recreation of the database files.

Verify scenarios: a WAL delete that keeps failing with `EBUSY` surfaces the original error after bounded retries; a live `index.lock` is still present after `recreate()` removes the database files.

### Implementation Status

Met.

`SQLiteGraphStore.recreate()` deletes only `code-graph.sqlite`, `code-graph.sqlite-wal`, and `code-graph.sqlite-shm` through `retryLockedAsync`, then rotates the storage-generation sidecar. `index.lock` is a sibling file (`graph/index.lock`) and is not in that suffix list. `SQLiteGraphDatabase.recreate()` does the same with synchronous `retryLocked` and `rmSync`.

`retryLocked` / `retryLockedAsync` treat lock errors as:

```ts
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [50, 100, 150, 200] as const
```

The loop runs five attempts (`attempt` 0 through 4). On a lock error when `attempt === RETRY_DELAYS_MS.length`, it throws the original error. Other error codes are not retried.

### Discrepancies

None.

### Test Coverage

- `creates sqlite schema artifacts under graph/ and recreates backend state destructively` writes `graph/index.lock` and expects it to remain after `recreate()`.
- `retries a locked WAL file while recreating the store` fails `node:fs/promises` `rm` of the WAL path twice with `EBUSY`, then expects recreation to succeed. The store method calls that `rm`.
- `surfaces the original lock error after five WAL failures` sets five `EBUSY` failures, expects `recreate()` to reject with `code: 'EBUSY'`, and expects both the WAL file and `index.lock` to remain.

`EPERM` and `EACCES` are the same `LOCK_CODES` predicate as `EBUSY`. The verify scenario names `EBUSY` only.

### Missing Tests

None.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 0 discrepancies, 0 missing tests.

## code-graph:isolated-index-worker

### Requirements Summary

**Added: Index lease release on exit**

> The process that holds the index lease MUST release it on process exit. On Windows it MUST also release the lease on `SIGBREAK`. Releasing the lease on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` MUST NOT leave the lease held after the process has exited.

Verify scenarios: process exit releases the lease; `SIGBREAK` on Windows releases the lease.

The spec dependency change (from `_none_` to `code-graph:sqlite-graph-store`) is not a behavioral requirement. The new requirement is consistent with that store’s index lease: the worker must release the same lock `recreate()` is required to leave in place.

### Implementation Status

Met.

The supervisor acquires the lease with `signalCleanup: 'exit-only'`, so the lock helper still registers an `exit` release and does not install its own `SIGINT` / `SIGTERM` exit-the-parent handlers. The supervisor then installs:

- `onProcessExit` → `lease.release()`
- `onSigbreak` → `lease.release()` then forward `SIGBREAK` to the child
- `onSigterm` → forward `SIGTERM` to the child

`finalize()` also calls `lease.release()` before the run’s promise settles, and `release()` is idempotent (token-checked `rmSync`, listener removal). A parent `exit` therefore drops the lease even when `SIGTERM` is not delivered. `SIGTERM` still ends in lease release when the child exit settles the run, which is the existing signal-forwarding path.

### Discrepancies

None.

### Test Coverage

`releases the lease on SIGBREAK and process exit` emits `SIGBREAK` and `exit` on the same run, expects the child to be killed with `SIGBREAK`, then expects a second `acquireLock` not to throw.

That assertion does not prove the two verify scenarios separately. `onSigbreak` releases before `onProcessExit` runs, so a failure of either handler can be masked by the other.

`SIGTERM` release is covered by the pre-existing settle/finalize path (lease released in `finalize()`), not by a new scenario in this delta.

### Missing Tests

1. **Process exit releases the lease without `SIGBREAK`.** The verify scenario “Process exit releases the lease” is only exercised in the same test as `SIGBREAK`.
2. **`SIGBREAK` releases the lease without a following parent `exit` event.** The verify scenario “SIGBREAK releases the lease on Windows” is only exercised together with `exit`.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 0 discrepancies, 2 missing tests.

## code-graph:indexer

### Requirements Summary

**Added: Portable graph paths**

> Relative paths persisted by the indexer MUST use `/` as the separator. That conversion MUST NOT collapse `.` or `..` segments.
>
> A key that begins with a Windows drive letter, matching `^[A-Za-z]:[/\\]`, MUST NOT be split into a workspace name and a path. A bare drive letter, matching `^[A-Za-z]:$`, is the same kind of path: the directory of a file at the drive root. `goPackageSurface('C:/a.go')` is `C:`, and that string MUST NOT parse as workspace `C`. The drive letter is part of the path, not a workspace prefix. Every graph-identity split MUST use that rule, including language-adapter relative imports, package surfaces, scoped binding, and hotspot caller classification. A PHP namespace separator is not a graph identity and MUST stay local.

Verify scenarios: splitting `C:/repo/src/a.ts` does not yield workspace `C`; persisting `src\..\secret` stores `src/../secret`; a language-adapter split of `C:/repo/src/a.ts` does not yield workspace `C`; `goPackageSurface` of `C:/a.go` is surface `C:` and the workspace name is not `C`.

### Implementation Status

Met for the indexer-owned splits.

Separator conversion is `toPortableGraphPath`:

```ts
return value.replaceAll('\\', '/')
```

That replacement does not normalize `.` or `..`. Discovery also uses `relative(...).replaceAll('\\', '/')` for walked paths. `node:path.relative` / `join` normalize `..` between absolute filesystem paths before that slash conversion. The requirement’s “conversion” is the separator conversion, and the verify input `src\..\secret` is what `toPortableGraphPath` preserves. Config-relative paths computed with `path.relative` can still drop `..` that existed only as lexical segments of an absolute path; that is path resolution, not the slash conversion.

The shared splitter is:

```ts
const DRIVE_LETTER_PATH = /^[A-Za-z]:(?:[/\\]|$)/
```

`splitWorkspaceIdentity` returns `null` when `isDriveLetterPath` is true, before `indexOf(':')`.

**`splitWorkspaceIdentity('C:')` in `packages/code-graph/src/domain/services/split-workspace-identity.ts` returns `null`.** `C:` matches `/^[A-Za-z]:(?:[/\\]|$)/` because of the `$` alternative, so the function returns before it can set `workspace` to `C`.

Call sites named by this requirement import that helper:

- TypeScript, Python, and PHP relative-import splits use `splitWorkspaceIdentity`.
- `goPackageSurface` returns the directory before the last `/`. For `C:/a.go` that slice is `C:`. It calls `splitWorkspaceIdentity` only when the path has no `/`. Parsing that surface with the shared helper returns `null`, so it is not workspace `C`.
- Scoped binding uses `splitWorkspaceIdentity` for the workspace prefix.
- Hotspot caller classification uses `isDriveLetterPath` and returns `''` for a drive-letter path, then the shared splitter.

PHP namespace separators stay inside adapter-local candidate mapping (`replaceAll('\\', '/')` on a class/namespace string). They are not passed through the graph-identity splitter.

A second, narrower copy of the drive-letter check lives in CLI display and in `matchesExclude`. Those copies omit `$`. They are outside the call sites this requirement lists. The workspace-integration requirement names them explicitly; the discrepancy is recorded there.

### Discrepancies

None for this requirement’s listed indexer, adapter, package-surface, scoped-binding, and hotspot-classification splits.

### Test Coverage

- `split-workspace-identity.spec.ts`: `isDriveLetterPath('C:')` is true, `splitWorkspaceIdentity('C:')` is null, `splitWorkspaceIdentity('C:/repo/src/a.ts')` is null, and `toPortableGraphPath('src\\..\\secret')` is `src/../secret`. A workspace identity `core:src/../secret` keeps the parent segment.
- Go adapter tests: surface of `C:/repo/src/a.go` is `C:/repo/src` and is not `C:`; surface of `C:/a.go` is `C:`.
- TypeScript, Python, and PHP relative-import tests resolve from `C:/repo/src/...` and keep the `C:/repo/src` prefix.
- Hotspot test `does not treat a drive letter as workspace C` uses paths `C:/repo/src/a.ts` and `C:/repo/src/b.ts` with workspace filter `C` and expects no entries.
- Scoped-binding test uses `C:/repo/src/a.ts` and expects prefixes not to contain `C:`.

### Missing Tests

None against this requirement’s verify scenarios. The bare-drive parse is asserted on the shared helper. The Go test asserts the surface string `C:` and does not itself call the splitter; the splitter test covers that parse.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 0 discrepancies, 0 missing tests.

## code-graph:workspace-integration

### Requirements Summary

**Added: Drive letters are not workspace names**

> Parsing a graph identity MUST NOT treat a Windows drive letter as a workspace name. A string that matches `^[A-Za-z]:[/\\]` or `^[A-Za-z]:$` is a drive-letter path. The character before the first `:` in that string MUST NOT become `{workspaceName}`. This applies to exclusion, hotspot classification, SQLite workspace inclusion, package surfaces, and CLI graph display. A workspace filter of `C` MUST NOT match a drive-letter path or the bare drive letter `C:`.

Verify scenarios: parsing `C:/repo/src/a.ts` does not yield workspace `C` and keeps the drive letter in the path; a workspace filter `C` does not include stored path `C:/repo/src/a.ts`; parsing `C:` does not yield workspace `C`.

### Implementation Status

Met for hotspot classification, SQLite workspace inclusion, and package surfaces, because those use the shared helper `/^[A-Za-z]:(?:[/\\]|$)/`.

Unmet for exclusion and CLI graph display. Both have a local check that requires a slash:

```ts
;/^[A-Za-z]:[/\\]/
```

That pattern matches `C:/...` and `C:\...`. It does not match `C:`.

**Shared helper** (`packages/code-graph/src/domain/services/split-workspace-identity.ts`): `splitWorkspaceIdentity('C:')` returns `null`.

**CLI copy** (`packages/cli/src/commands/graph/resolve-impact-file-selectors.ts`):

```ts
const DRIVE_LETTER_PATH = /^[A-Za-z]:[/\\]/

export function splitWorkspaceIdentity(value: string) {
  if (isDriveLetterPath(value)) return null
  const index = value.indexOf(':')
  if (index <= 0) return null
  return { workspace: value.slice(0, index), relativePath: value.slice(index + 1) }
}
```

**`splitWorkspaceIdentity('C:')` in the CLI copy returns `{ workspace: 'C', relativePath: '' }`.** `isDriveLetterPath('C:')` is false, `indexOf(':')` is 1, and the slice before the colon is `C`.

`toGraphDisplayPath` then does:

```ts
const identity = splitWorkspaceIdentity(canonicalPath)
if (identity === null || identity.relativePath.length === 0) return canonicalPath
```

So the displayed path string for `C:` stays `C:` because `relativePath` is empty. The workspace field is still `C`. CLI graph hotspots text and JSON set `workspace` from this same function (`splitWorkspaceIdentity(filePath)?.workspace`). CLI public-export impact sets `workspace` from `splitWorkspaceIdentity(canonicalSurface)?.workspace ?? 'default'`. A package surface of `C:` (the value `goPackageSurface('C:/a.go')` is required to produce) therefore becomes workspace `C` on that CLI path.

**Exclusion** (`matchesExclude` local `extractWorkspace`):

```ts
if (/^[A-Za-z]:[/\\]/.test(filePath)) return null
const idx = filePath.indexOf(':')
if (idx === -1) return filePath
if (idx === 0) return null
return filePath.slice(0, idx)
```

`extractWorkspace('C:')` returns `'C'`. `matchesExclude('C:', undefined, ['C'])` is therefore true: exclusion treats the bare drive letter as workspace `C`. `C:/repo/src/a.ts` is correctly ignored by this regex, which is what the existing test checks.

Hotspot inclusion and SQLite search use the shared splitter, so a workspace filter `C` does not include `C:/repo/src/a.ts` or `C:` (`null` workspace is not `C`).

### Discrepancies

**Bare drive letter `C:` is parsed as workspace `C` in exclusion and CLI graph display**

- The spec might be wrong if CLI display and exclusion were only meant to reject slash-form drive paths (`^[A-Za-z]:[/\\]`), and a bare `C:` was not supposed to be a graph identity those layers see. The merged sentence says otherwise: a string matching `^[A-Za-z]:[/\\]` **or** `^[A-Za-z]:$` is a drive-letter path, the character before the first `:` must not become `{workspaceName}`, and this applies to exclusion and CLI graph display. The indexer requirement in the same change says `goPackageSurface('C:/a.go')` is `C:` and that string must not parse as workspace `C`. The spec is consistent across those two requirements.
- The code might be wrong: the shared helper implements both alternatives (`/^[A-Za-z]:(?:[/\\]|$)/`) and returns `null` for `C:`. The CLI regex and the exclusion regex are `/^[A-Za-z]:[/\\]/` and then fall through to `slice` before the colon, so `C` becomes the workspace name. Evidence: CLI `splitWorkspaceIdentity('C:')` returns `{ workspace: 'C', relativePath: '' }`; exclusion `extractWorkspace('C:')` returns `'C'`.
- Both are partially involved in the display path only: `toGraphDisplayPath('C:')` returns the original string because `relativePath` is empty, so a path-only assertion can pass while the workspace label and the public-surface workspace argument are still `C`. That short-circuit does not satisfy “must not become `{workspaceName}`”.

### Test Coverage

Covered for the shared parser, hotspot inclusion, and SQLite inclusion of slash-form paths:

- `splitWorkspaceIdentity('C:')` is null in the code-graph unit test.
- Hotspots with workspace `C` exclude `C:/repo/src/a.ts`.
- SQLite `searchSymbols` with workspace `C` does not return a symbol stored at `C:/repo/src/a.ts`.
- `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false.
- CLI `toGraphDisplayPath(config, 'C:/repo/src/a.ts')` is `C:/repo/src/a.ts`.

Not covered: bare `C:` through CLI `splitWorkspaceIdentity` / hotspot workspace label / public-surface workspace, and bare `C:` through `matchesExclude`.

### Missing Tests

1. **CLI graph display of `C:`.** No test asserts that `splitWorkspaceIdentity('C:')` in the CLI module is null, or that a hotspot/impact workspace field for the identity `C:` is not `C`. The existing display test only uses `C:/repo/src/a.ts`, which the narrower regex already accepts.
2. **Exclusion of the bare drive letter.** No test asserts that `matchesExclude('C:', …, ['C'])` does not treat `C:` as workspace `C`. The exclusion test only uses `C:/repo/src/a.ts`.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 1 discrepancy, 2 missing tests.

## Audit totals

| Spec                             | Requirements | Discrepancies | Missing tests |
| -------------------------------- | -----------: | ------------: | ------------: |
| code-graph:sqlite-graph-store    |            1 |             0 |             0 |
| code-graph:isolated-index-worker |            1 |             0 |             2 |
| code-graph:indexer               |            1 |             0 |             0 |
| code-graph:workspace-integration |            1 |             1 |             2 |
| **Total**                        |        **4** |         **1** |         **4** |

Discrepancy title:

1. Bare drive letter `C:` is parsed as workspace `C` in exclusion and CLI graph display
